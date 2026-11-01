// tests/ops/toml-fixtures.mjs
// Valid TOML 1.0 files a Codex user can hold in ~/.codex/config.toml (tester report on 2.0.0-next.6: multiline
// strings, multiline arrays and [[skills.config]] were rejected). Shared by host-config-toml.test.mjs and the
// setup round trip in tests/setup/engine.test.mjs. Every value is plain data: no regex, no helper logic.
const HEAD = `# my codex config\nmodel = "o3" # fast one\n`;

export const OWN_TABLE = "[mcp_servers.context-mode]";

export const TOML_FIXTURES = {
  plain: `${HEAD}\n[features]\nhooks = true\n`,
  "multiline basic string": `${HEAD}notes = """\nline one\n[mcp_servers.fake]\n[[skills.config]]\nline "two"\n"""\n\n[features]\nhooks = true\n`,
  "multiline literal string": `${HEAD}raw = '''\nC:\\Users\\me\n[mcp_servers.context-mode]\n'''\n\n[tui]\ntheme = "dark"\n`,
  "multiline array": `${HEAD}allow = [\n  "git", # vcs\n  "npm",\n  # trailing comment\n]\n\n[sandbox]\nmode = "workspace-write"\n`,
  "array of tables": `${HEAD}\n[[skills.config]]\npath = "/a/SKILL.md"\nenabled = true\n\n[[skills.config]]\npath = "/b/SKILL.md"\nenabled = false\n\n[features]\nhooks = true\n`,
  "inline tables and dotted keys": `${HEAD}shell_environment_policy = { inherit = "all", set = { A = "1" } }\nprofiles.fast.model = "o4-mini"\n\n[projects."/work/app"]\ntrust_level = "trusted"\n`,
  "comments everywhere": `# top\n\n# before table\n[features] # inline\n# inside\nhooks = true # tail\n\n# end of file comment\n`,
  "other mcp server beside ours": `${HEAD}\n[mcp_servers.other]\ncommand = "other-server"\nargs = [\n  "--x",\n]\n`,
  "no trailing newline": `${HEAD}[features]\nhooks = true`,
  "empty file": ``,
};

// Our table already present (a v2 install), with user comments around it. The text before and after the table
// must survive byte for byte.
export const WITH_OWN = {
  before: `# keep me\nmodel = "o3"\n\n# about the server\n`,
  table: `[mcp_servers.context-mode]\ncommand = "old-node"\nargs = ["old.mjs"]\n`,
  after: `\n# about skills\n[[skills.config]]\npath = "/a"\nenabled = true\n`,
};
