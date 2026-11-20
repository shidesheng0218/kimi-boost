import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

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
let kimiConfig: string;

function resetFiles(): void {
  rmSync(process.env.AGENT_GUARD_HOME!, { recursive: true, force: true });
  writeFileSync(kimiConfig, "", "utf8");
}

function writeGuardBlock(): void {
  writeFileSync(
    kimiConfig,
    [
      "# >>> kimi-guard managed >>> DO NOT EDIT",
      "[[hooks]]",
      'event = "PreToolUse"',
      'command = "kguard hook PreToolUse"',
      "timeout = 5",
      "# <<< kimi-guard <<<",
      "",
    ].join("\n"),
    "utf8",
  );
}

beforeEach(() => {
  tmp = mkdtempSync(join(tmpdir(), "kboost-coexist-doctor-"));
  saved = new Map(ENV_KEYS.map((k) => [k, process.env[k]]));
  process.env.KIMI_CODE_HOME = join(tmp, "kimi-code");
  process.env.KIMI_BOOST_HOME = join(tmp, "kboost");
  process.env.AGENT_GUARD_HOME = join(tmp, "agent-guard");
  process.env.CLAUDE_CODE_HOME = join(tmp, "claude");
  process.env.CODEX_HOME = join(tmp, "codex");
  for (const k of ["KIMI_CONFIG_PATH", "CLAUDE_SETTINGS_PATH", "CODEX_HOOKS_PATH", "KIMI_GUARD_HOME"] as const) delete process.env[k];
  for (const dir of [process.env.KIMI_CODE_HOME, process.env.KIMI_BOOST_HOME, process.env.CLAUDE_CODE_HOME, process.env.CODEX_HOME]) {
    mkdirSync(dir, { recursive: true });
  }
  kimiConfig = join(process.env.KIMI_CODE_HOME, "config.toml");
});

afterEach(() => {
  for (const k of ENV_KEYS) {
    const v = saved.get(k);
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  rmSync(tmp, { recursive: true, force: true });
});

describe("doctor coexistence", () => {
  it("does not flag agentguard hooks as missing script paths", async () => {
    writeGuardBlock();
    const { runDoctor } = await import("../src/commands/doctor.js");
    const issues = runDoctor(false);
    expect(issues.some((i) => i.item.includes("hook has no script path") && i.detail.includes("kguard"))).toBe(false);
    expect(issues.some((i) => i.item === "kimi: hook managed by agent-guard")).toBe(true);
  });

  it("emits exactly one coexistence ok line when agentguard is wired", async () => {
    writeGuardBlock();
    const { runDoctor } = await import("../src/commands/doctor.js");
    const coexistence = runDoctor(false).filter((i) => i.item.startsWith("coexistence:"));
    expect(coexistence).toHaveLength(1);
    expect(coexistence[0]).toMatchObject({ level: "ok", item: "coexistence: agent-guard detected" });
  });

  it("emits the installed-not-wired line when only the home exists", async () => {
    resetFiles();
    mkdirSync(process.env.AGENT_GUARD_HOME!, { recursive: true });
    const { runDoctor } = await import("../src/commands/doctor.js");
    const coexistence = runDoctor(false).filter((i) => i.item.startsWith("coexistence:"));
    expect(coexistence).toHaveLength(1);
    expect(coexistence[0]).toMatchObject({ level: "ok", item: "coexistence: agent-guard installed (hooks not detected)" });
  });

  it("emits nothing when agentguard is absent", async () => {
    resetFiles();
    const { runDoctor } = await import("../src/commands/doctor.js");
    const coexistence = runDoctor(false).filter((i) => i.item.startsWith("coexistence:"));
    expect(coexistence).toHaveLength(0);
  });

  it("reports an error when the agentguard block is nested inside the boost block", async () => {
    resetFiles();
    writeFileSync(
      kimiConfig,
      [
        "# >>> kimi-boost managed >>>",
        "[[hooks]]",
        'command = "node hooks/x.mjs"',
        "# >>> kimi-guard managed >>> DO NOT EDIT",
        "[[hooks]]",
        'command = "kguard hook PreToolUse"',
        "# <<< kimi-guard <<<",
        "# <<< kimi-boost managed <<<",
        "",
      ].join("\n"),
      "utf8",
    );
    const { runDoctor } = await import("../src/commands/doctor.js");
    const issues = runDoctor(false);
    expect(issues.some((i) => i.level === "error" && i.item === "coexistence: agent-guard block nested inside kimi-boost block")).toBe(true);
  });

  it("exposes related status through getStatus()", async () => {
    writeGuardBlock();
    const { getStatus } = await import("../src/commands/status.js");
    expect(getStatus().related).toMatchObject({ active: true, markers: { kimi: true } });
  });
});