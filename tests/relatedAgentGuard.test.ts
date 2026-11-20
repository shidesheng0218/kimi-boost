import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { agentGuardBlockNestedInBoost, detectAgentGuard } from "../src/core/related.js";

const ENV_KEYS = [
  "KIMI_CODE_HOME",
  "KIMI_BOOST_HOME",
  "AGENT_GUARD_HOME",
  "KIMI_GUARD_HOME",
  "CLAUDE_CODE_HOME",
  "CODEX_HOME",
  "KIMI_CONFIG_PATH",
  "CLAUDE_SETTINGS_PATH",
  "CODEX_HOOKS_PATH",
] as const;

let tmp: string;
let saved: Map<string, string | undefined>;

beforeEach(() => {
  tmp = mkdtempSync(join(tmpdir(), "kboost-related-"));
  saved = new Map(ENV_KEYS.map((k) => [k, process.env[k]]));
  process.env.KIMI_CODE_HOME = join(tmp, "kimi-code");
  process.env.KIMI_BOOST_HOME = join(tmp, "kboost");
  process.env.AGENT_GUARD_HOME = join(tmp, "agent-guard");
  process.env.CLAUDE_CODE_HOME = join(tmp, "claude");
  process.env.CODEX_HOME = join(tmp, "codex");
  for (const k of ["KIMI_CONFIG_PATH", "CLAUDE_SETTINGS_PATH", "CODEX_HOOKS_PATH"] as const) delete process.env[k];
  mkdirSync(process.env.KIMI_CODE_HOME, { recursive: true });
  mkdirSync(process.env.CLAUDE_CODE_HOME, { recursive: true });
  mkdirSync(process.env.CODEX_HOME, { recursive: true });
});

afterEach(() => {
  for (const k of ENV_KEYS) {
    const v = saved.get(k);
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  rmSync(tmp, { recursive: true, force: true });
});

function kimiConfig(): string {
  return join(process.env.KIMI_CODE_HOME!, "config.toml");
}

function claudeSettings(): string {
  return join(process.env.CLAUDE_CODE_HOME!, "settings.json");
}

function codexHooks(): string {
  return join(process.env.CODEX_HOME!, "hooks.json");
}

describe("detectAgentGuard", () => {
  it("reports absent when neither the home nor any marker exists", () => {
    const r = detectAgentGuard();
    expect(r.present).toBe(false);
    expect(r.active).toBe(false);
    expect(r.markers).toEqual({ kimi: false, claude: false, codex: false });
  });

  it("reports present but not active when only the state dir exists", () => {
    mkdirSync(process.env.AGENT_GUARD_HOME!, { recursive: true });
    const r = detectAgentGuard();
    expect(r.present).toBe(true);
    expect(r.active).toBe(false);
  });

  it("detects the Kimi managed block", () => {
    writeFileSync(kimiConfig(), "# >>> kimi-guard managed >>> DO NOT EDIT\n[[hooks]]\ncommand = \"kguard hook PreToolUse\"\n# <<< kimi-guard <<<\n", "utf8");
    const r = detectAgentGuard();
    expect(r.markers.kimi).toBe(true);
    expect(r.active).toBe(true);
  });

  it("detects a Claude command entry", () => {
    writeFileSync(
      claudeSettings(),
      JSON.stringify({
        hooks: {
          PreToolUse: [
            { matcher: "", hooks: [{ type: "command", command: "agentguard hook PreToolUse --harness claude", timeout: 5 }] },
          ],
        },
      }),
      "utf8",
    );
    const r = detectAgentGuard();
    expect(r.markers.claude).toBe(true);
    expect(r.active).toBe(true);
  });

  it("detects a Codex hooks.json command entry", () => {
    writeFileSync(
      codexHooks(),
      JSON.stringify({
        hooks: {
          PreToolUse: [{ matcher: "", hooks: [{ type: "command", command: "kguard hook PreToolUse --harness codex", timeout: 5 }] }],
        },
      }),
      "utf8",
    );
    const r = detectAgentGuard();
    expect(r.markers.codex).toBe(true);
    expect(r.active).toBe(true);
  });
});

describe("agentGuardBlockNestedInBoost", () => {
  it("flags a kimi-guard block nested inside the kimi-boost block", () => {
    const text = [
      "# >>> kimi-boost managed >>>",
      "[[hooks]]",
      'command = "node hooks/x.mjs"',
      "# >>> kimi-guard managed >>>",
      'command = "kguard hook PreToolUse"',
      "# <<< kimi-guard <<<",
      "# <<< kimi-boost managed <<<",
    ].join("\n");
    expect(agentGuardBlockNestedInBoost(text)).toBe(true);
  });

  it("does not flag separate blocks", () => {
    const text = [
      "# >>> kimi-boost managed >>>",
      'command = "node hooks/x.mjs"',
      "# <<< kimi-boost managed <<<",
      "# >>> kimi-guard managed >>>",
      'command = "kguard hook PreToolUse"',
      "# <<< kimi-guard <<<",
    ].join("\n");
    expect(agentGuardBlockNestedInBoost(text)).toBe(false);
  });
});