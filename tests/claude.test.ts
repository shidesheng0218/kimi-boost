import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

let tmp: string;
let claudeHome: string;

beforeAll(() => {
  tmp = mkdtempSync(join(tmpdir(), "kimi-boost-claude-"));
  claudeHome = join(tmp, ".claude");
  process.env.CLAUDE_CODE_HOME = claudeHome;
  process.env.KIMI_BOOST_HOME = join(tmp, "kboost");
  process.env.KIMI_CODE_HOME = join(tmp, ".kimi-code");
});

afterAll(() => {
  delete process.env.CLAUDE_CODE_HOME;
  delete process.env.KIMI_BOOST_HOME;
  delete process.env.KIMI_CODE_HOME;
  rmSync(tmp, { recursive: true, force: true });
});

describe("claude adapter", () => {
  it("installs agents, skills and hooks into ~/.claude", async () => {
    const { claudeAdapter } = await import("../src/adapters/claude.js");
    const { getPreset, presetSourceDir } = await import("../src/registry/presets.js");

    const preset = getPreset("vue3")!;
    const report = await claudeAdapter.activate({
      tool: "claude",
      preset,
      sourceDir: presetSourceDir("vue3"),
      installDir: join(tmp, "preset"),
    });

    expect(report.ok).toBe(true);
    expect(existsSync(join(claudeHome, "agents", "vue3-reviewer.md"))).toBe(true);
    expect(existsSync(join(claudeHome, "skills", "vue3", "vue3-best-practices", "SKILL.md"))).toBe(true);

    const settings = JSON.parse(readFileSync(join(claudeHome, "settings.json"), "utf8"));
    const preToolUse = settings.hooks.PreToolUse.find((g: { matcher?: string }) => g.matcher === "Bash");
    expect(preToolUse.hooks[0].type).toBe("command");
    expect(preToolUse.hooks[0].command).toContain("protect-main.mjs");
    expect(preToolUse.hooks[0].timeout).toBe(5);
  });

  it("is idempotent on re-activation", async () => {
    const { claudeAdapter } = await import("../src/adapters/claude.js");
    const { getPreset, presetSourceDir } = await import("../src/registry/presets.js");

    const preset = getPreset("vue3")!;
    const report = await claudeAdapter.activate({
      tool: "claude",
      preset,
      sourceDir: presetSourceDir("vue3"),
      installDir: join(tmp, "preset"),
    });
    const settings = JSON.parse(readFileSync(join(claudeHome, "settings.json"), "utf8"));
    const hooks = settings.hooks.PreToolUse.flatMap((g: { hooks: unknown[] }) => g.hooks);
    expect(hooks.filter((h: { command: string }) => h.command.includes("protect-main.mjs"))).toHaveLength(1);
    expect(report.message).not.toContain("already active");
  });

  it("deactivates cleanly", async () => {
    const { claudeAdapter } = await import("../src/adapters/claude.js");
    const report = await claudeAdapter.deactivate("vue3");
    expect(report.ok).toBe(true);
    expect(existsSync(join(claudeHome, "skills", "vue3"))).toBe(false);
    expect(existsSync(join(claudeHome, "agents", "vue3-reviewer.md"))).toBe(false);
    const settings = JSON.parse(readFileSync(join(claudeHome, "settings.json"), "utf8"));
    const hooks = settings.hooks.PreToolUse.flatMap((g: { hooks: unknown[] }) => g.hooks);
    expect(hooks.filter((h: { command: string }) => h.command.includes("protect-main.mjs"))).toHaveLength(0);
  });
});
