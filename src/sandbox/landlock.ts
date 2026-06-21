/**
 * Linux Landlock filesystem-read confinement for the polyglot executor.
 *
 * Issue #852: `ctx_execute` / `ctx_execute_file` run arbitrary code in an
 * out-of-process subprocess that does NOT inherit the harness sandbox, so an
 * agent can read files outside the project even when the user enabled the
 * harness's filesystem sandbox. In-process checks cannot stop this — arbitrary
 * code can call `fs.readFileSync` directly. The only real boundary is an
 * OS-level one.
 *
 * Landlock (Linux ≥ 5.13) lets an unprivileged process irreversibly restrict
 * its own (and its descendants') filesystem access. We apply it via a tiny C
 * launcher that confines reads to an allow-list and then `exec`s the runtime,
 * so even arbitrary user code cannot read outside the allowed subtrees.
 *
 * Opt-in via the `CONTEXT_MODE_CONFINE_FS` env var. Linux-only for now; macOS
 * (sandbox-exec) and Windows are documented follow-ups. When confinement is
 * requested but cannot be honored, the executor FAILS CLOSED rather than
 * running unconfined.
 */
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync, chmodSync } from "node:fs";
import { createHash } from "node:crypto";
import { join } from "node:path";
import { tmpdir } from "node:os";

/** Env var that opts a session into filesystem read confinement. */
export const CONFINE_FS_ENV = "CONTEXT_MODE_CONFINE_FS";

/** Truthy values accepted for {@link CONFINE_FS_ENV}. */
const TRUTHY = new Set(["1", "true", "yes", "on"]);

/** Compilers tried, in order, to build the launcher on first use. */
const COMPILERS = ["cc", "gcc", "clang"];

/** Persistent cache dir for the compiled launcher (survives across execs). */
const SANDBOX_CACHE_DIR = join(tmpdir(), "ctx-mode-sandbox");

/**
 * System directories a language runtime must be able to read to function at all
 * (shared libraries, the dynamic linker cache, TLS certificates, timezone data,
 * `/proc` self-introspection, `/dev/null|urandom`). These are always added to
 * the allow-list. They are world-readable system paths, not the user's private
 * data — the threat in #852 is reading the user's project-external files
 * (`$HOME`, other repos, secrets), which stay denied.
 */
export const SYSTEM_READ_DIRS = [
  "/usr",
  "/lib",
  "/lib64",
  "/lib32",
  "/bin",
  "/sbin",
  "/etc",
  "/proc",
  "/dev",
  "/opt",
  "/run",
  "/sys",
];

/**
 * The Landlock launcher C source. Embedded (rather than shipped as a `.c` file)
 * so it survives bundling without an asset-copy build step. Compiled lazily on
 * first use. `String.raw` keeps the C backslash escapes intact.
 */
const LAUNCHER_SOURCE = String.raw`
#define _GNU_SOURCE
#include <stdio.h>
#include <string.h>
#include <unistd.h>
#include <fcntl.h>
#include <errno.h>
#include <stdint.h>
#include <sys/syscall.h>
#include <sys/prctl.h>

#ifndef __NR_landlock_create_ruleset
#define __NR_landlock_create_ruleset 444
#endif
#ifndef __NR_landlock_add_rule
#define __NR_landlock_add_rule 445
#endif
#ifndef __NR_landlock_restrict_self
#define __NR_landlock_restrict_self 446
#endif

#define LL_ACCESS_FS_READ_FILE (1ULL << 2)
#define LL_ACCESS_FS_READ_DIR (1ULL << 3)
#define LL_RULE_PATH_BENEATH 1
#define LL_CREATE_RULESET_VERSION (1U << 0)

#ifndef PR_SET_NO_NEW_PRIVS
#define PR_SET_NO_NEW_PRIVS 38
#endif
#ifndef O_PATH
#define O_PATH 010000000
#endif

#define LL_HANDLED (LL_ACCESS_FS_READ_FILE | LL_ACCESS_FS_READ_DIR)

struct ll_ruleset_attr {
  uint64_t handled_access_fs;
};

struct ll_path_beneath_attr {
  uint64_t allowed_access;
  int32_t parent_fd;
} __attribute__((packed));

int main(int argc, char **argv) {
  long abi = syscall(__NR_landlock_create_ruleset, NULL, (size_t)0,
                     LL_CREATE_RULESET_VERSION);
  if (abi < 1) {
    fprintf(stderr, "ll-exec: Landlock unavailable (abi=%ld)\n", abi);
    return 99;
  }

  struct ll_ruleset_attr ra;
  ra.handled_access_fs = LL_HANDLED;
  int rs_fd = (int)syscall(__NR_landlock_create_ruleset, &ra, sizeof(ra), 0U);
  if (rs_fd < 0) {
    perror("ll-exec: create_ruleset");
    return 99;
  }

  int i = 1;
  for (; i < argc; i++) {
    if (strcmp(argv[i], "--") == 0) {
      i++;
      break;
    }
    if (strcmp(argv[i], "--allow") == 0 && i + 1 < argc) {
      const char *dir = argv[++i];
      int pfd = open(dir, O_PATH | O_CLOEXEC);
      if (pfd < 0) {
        continue;
      }
      struct ll_path_beneath_attr pb;
      pb.allowed_access = LL_HANDLED;
      pb.parent_fd = pfd;
      long rc = syscall(__NR_landlock_add_rule, rs_fd, LL_RULE_PATH_BENEATH, &pb,
                        0U);
      close(pfd);
      if (rc != 0) {
        perror("ll-exec: add_rule");
        return 99;
      }
    }
  }

  if (i >= argc) {
    fprintf(stderr, "ll-exec: no command after --\n");
    return 98;
  }

  if (prctl(PR_SET_NO_NEW_PRIVS, 1, 0, 0, 0) != 0) {
    perror("ll-exec: prctl(NO_NEW_PRIVS)");
    return 99;
  }
  if (syscall(__NR_landlock_restrict_self, rs_fd, 0U) != 0) {
    perror("ll-exec: restrict_self");
    return 99;
  }
  close(rs_fd);

  execvp(argv[i], &argv[i]);
  perror("ll-exec: execvp");
  return 127;
}
`;

/** Launcher filename, salted with a source hash so a changed source recompiles. */
const LAUNCHER_BIN = `ctx-ll-exec-${createHash("sha1")
  .update(LAUNCHER_SOURCE)
  .digest("hex")
  .slice(0, 12)}`;

/** Returns true when the session opted into FS confinement. */
export function isConfineRequested(env: NodeJS.ProcessEnv = process.env): boolean {
  const v = env[CONFINE_FS_ENV];
  return v !== undefined && TRUTHY.has(v.toLowerCase());
}

/** Whether OS-level FS confinement is implemented for this platform. */
export function isConfineSupported(): boolean {
  return process.platform === "linux";
}

// undefined = not attempted yet, null = unavailable, string = compiled path
let helperCache: string | null | undefined;

function findCompiler(): string | null {
  for (const cc of COMPILERS) {
    const r = spawnSync(cc, ["--version"], { stdio: "ignore" });
    if (!r.error && r.status === 0) return cc;
  }
  return null;
}

/**
 * Path to the compiled Landlock launcher, building it on first call. Returns
 * `null` when confinement cannot be provided (non-Linux, no C compiler, or the
 * compile fails). Result is memoized.
 */
export function landlockHelperPath(): string | null {
  if (helperCache !== undefined) return helperCache;
  helperCache = compileHelper();
  return helperCache;
}

function compileHelper(): string | null {
  if (!isConfineSupported()) return null;
  try {
    const bin = join(SANDBOX_CACHE_DIR, LAUNCHER_BIN);
    if (existsSync(bin)) return bin;

    const compiler = findCompiler();
    if (!compiler) return null;

    mkdirSync(SANDBOX_CACHE_DIR, { recursive: true });
    const src = join(SANDBOX_CACHE_DIR, `${LAUNCHER_BIN}.c`);
    writeFileSync(src, LAUNCHER_SOURCE, "utf-8");

    const r = spawnSync(compiler, ["-O2", "-o", bin, src], {
      stdio: "pipe",
      encoding: "utf-8",
    });
    if (r.status !== 0 || !existsSync(bin)) return null;

    chmodSync(bin, 0o700);
    return bin;
  } catch {
    return null;
  }
}

/**
 * Wrap a runtime command so it runs under Landlock read-confinement, granting
 * read access to `allowDirs` plus {@link SYSTEM_READ_DIRS}. Returns `null` if no
 * launcher is available (caller must fail closed). Duplicate dirs are coalesced.
 */
export function buildConfinedCommand(
  cmd: string[],
  allowDirs: string[],
): string[] | null {
  const helper = landlockHelperPath();
  if (!helper) return null;

  const args: string[] = [];
  const seen = new Set<string>();
  for (const dir of [...allowDirs, ...SYSTEM_READ_DIRS]) {
    if (dir && !seen.has(dir)) {
      seen.add(dir);
      args.push("--allow", dir);
    }
  }
  args.push("--", ...cmd);
  return [helper, ...args];
}
