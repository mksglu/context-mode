import { describe, expect, it } from "vitest";
import {
  REDACTED,
  isSecretKey,
  redactConfigContent,
  redactText,
} from "../../scripts/lib/ctx-debug-redact.mjs";

// scripts/ctx-debug.sh copies config files into a report the bug template
// asks users to paste into a public issue. Before this module the only
// redaction was three patterns (sk-, postgres://, mongodb://), so every value
// in a Claude Code settings.json `env` block — API tokens included — landed in
// the report verbatim (#1141).

const settings = {
  env: {
    DYNATRACE_API_TOKEN: "dt0c01.ABC123.SECRETSECRET",
    SONAR_TOKEN: "sqp_1234567890",
    AWS_PROFILE: "work",
    OTEL_EXPORTER_OTLP_ENDPOINT: "https://otel.example.com",
  },
  model: "opus",
  hooks: {
    PreToolUse: [{ matcher: "Bash", hooks: [{ type: "command", command: "node hook.mjs" }] }],
  },
  apiKey: "sk-proj-abcdefghijklmnop",
  nested: {
    MY_SERVICE_PASSWORD: "hunter2",
    url: "postgres://user:pw@db.example.com/x",
    plain: "keep me",
  },
};

describe("redactConfigContent on JSON", () => {
  const out = JSON.parse(redactConfigContent(JSON.stringify(settings, null, 2)));

  it("redacts every value under the env block, secret-looking or not", () => {
    expect(out.env).toEqual({
      DYNATRACE_API_TOKEN: REDACTED,
      SONAR_TOKEN: REDACTED,
      AWS_PROFILE: REDACTED,
      OTEL_EXPORTER_OTLP_ENDPOINT: REDACTED,
    });
  });

  it("redacts credential-shaped keys anywhere in the document", () => {
    expect(out.apiKey).toBe(REDACTED);
    expect(out.nested.MY_SERVICE_PASSWORD).toBe(REDACTED);
  });

  it("keeps everything else readable for diagnosis", () => {
    expect(out.model).toBe("opus");
    expect(out.hooks.PreToolUse[0].hooks[0].command).toBe("node hook.mjs");
    expect(out.nested.plain).toBe("keep me");
    expect(Object.keys(out)).toEqual(["env", "model", "hooks", "apiKey", "nested"]);
  });

  it("strips passwords out of connection strings", () => {
    expect(out.nested.url).toBe(`postgres://user:${REDACTED}@db.example.com/x`);
  });

  it("does not turn empty or non-string values into markers", () => {
    const value = JSON.parse(
      redactConfigContent(JSON.stringify({ env: { EMPTY: "", PORT: 8080, DEBUG: true, NONE: null } })),
    );
    expect(value.env).toEqual({ EMPTY: "", PORT: 8080, DEBUG: true, NONE: null });
  });

  it("cuts to the size limit only after redacting", () => {
    const padded = { filler: "x".repeat(4000), env: { LATE_TOKEN: "leak-me-please" } };
    const text = redactConfigContent(JSON.stringify(padded), { maxChars: 3000 });
    expect(text.length).toBe(3000);
    expect(text).not.toContain("leak-me-please");
  });
});

describe("redactConfigContent on non-JSON text", () => {
  it("falls back to pattern redaction", () => {
    const text = [
      "DATABASE_URL=postgres://u:pw@h/db",
      "GITHUB_TOKEN=ghp_abcdefghijklmnopqrstuvwxyz",
      "OPENAI=sk-proj-abcdefghijklmnop",
      '"MY_TOKEN": "abc"',
      "comment = keep",
    ].join("\n");
    const out = redactConfigContent(text);
    expect(out).toContain(`postgres://u:${REDACTED}@h/db`);
    expect(out).toContain(`ghp_abcd${REDACTED}`);
    expect(out).toContain(`sk-proj${REDACTED}`);
    expect(out).toContain(`"MY_TOKEN": "${REDACTED}"`);
    expect(out).toContain("comment = keep");
    expect(out).not.toContain("abcdefghijklmnop");
  });

  it("redacts slack, aws, jwt and basic-auth shapes", () => {
    const out = redactText(
      "xoxb-1234-567890-abcdef AKIAIOSFODNN7EXAMPLE eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.abc https://me:secret@host/",
    );
    expect(out).toContain(`xoxb-1234${REDACTED}`);
    expect(out).toContain(`AKIAIOSF${REDACTED}`);
    expect(out).toContain(`eyJh${REDACTED}`);
    expect(out).toContain(`https://me:${REDACTED}@host/`);
  });
});

describe("isSecretKey", () => {
  it("recognises credential-shaped names and nothing else", () => {
    for (const key of ["apiKey", "api_key", "SONAR_TOKEN", "password", "passwd", "clientSecret", "AUTHORIZATION", "aws_access_key_id", "dsn"]) {
      expect(isSecretKey(key), key).toBe(true);
    }
    for (const key of ["model", "hooks", "command", "AWS_PROFILE", "endpoint", "timeout"]) {
      expect(isSecretKey(key), key).toBe(false);
    }
  });
});
