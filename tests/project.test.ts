import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { findProjectRoot, installProjectPreset, removeProjectPreset } from "../src/core/project.js";

let tmp: string;

beforeAll(() => {
  tmp = mkdtempSync(join(tmpdir(), "kimi-boost-proj-"));
  mkdirSync(join(tmp, ".git"));
});

afterAll(() => {
  rmSync(tmp, { recursive: true, force: true });
});

describe("project-level presets", () => {
  it("findProjectRoot walks up to the nearest .git ancestor", () => {
    const nested = join(tmp, "a", "b");
    mkdirSync(nested, { recursive: true });
    expect(findProjectRoot(nested).root).toBe(tmp);
    expect(findProjectRoot(nested).isGitRoot).toBe(true);
  });

  it("installs skills/agents for kimi+claude and hooks only for claude", async () => {
    const reports = await installProjectPreset("vue3", { root: tmp });
    expect(reports.find((r) => r.tool === "kimi")?.ok).toBe(true);
    expect(reports.find((r) => r.tool === "claude")?.ok).toBe(true);
    // codex 被明确跳过
    expect(reports.find((r) => r.tool === "codex")?.message).toContain("skipped");

    // kimi: 跨工具 .agents/ 目录
    expect(existsSync(join(tmp, ".agents/skills/vue3-best-practices/SKILL.md"))).toBe(true);
    expect(existsSync(join(tmp, ".agents/agents/vue3-reviewer.md"))).toBe(true);
    // claude: .claude/ 目录
    expect(existsSync(join(tmp, ".claude/skills/vue3-best-practices/SKILL.md"))).toBe(true);
    expect(existsSync(join(tmp, ".claude/agents/vue3-reviewer.md"))).toBe(true);
    // hooks 脚本复制进项目
    expect(existsSync(join(tmp, ".kimi-boost/vue3/hooks/protect-main.mjs"))).toBe(true);
    // .claude/settings.json 合并了 hook
    const settings = JSON.parse(readFileSync(join(tmp, ".claude/settings.json"), "utf8"));
    const commands = (settings.hooks?.PreToolUse ?? []).flatMap((g: { hooks: Array<{ command: string }> }) => g.hooks.map((h) => h.command));
    expect(commands.some((c: string) => c.includes(".kimi-boost/vue3/hooks/protect-main.mjs"))).toBe(true);
    // kimi 端提示了 hooks 跳过
    expect(reports.find((r) => r.tool === "kimi")?.message).toContain("hooks 未装");
    // manifest 已记录
    expect(existsSync(join(tmp, ".kimi-boost/installed.json"))).toBe(true);
  });

  it("remove cleans everything it created", async () => {
    await removeProjectPreset("vue3", { root: tmp });
    expect(existsSync(join(tmp, ".agents/skills/vue3-best-practices"))).toBe(false);
    expect(existsSync(join(tmp, ".claude/skills/vue3-best-practices"))).toBe(false);
    expect(existsSync(join(tmp, ".kimi-boost/vue3"))).toBe(false);
    const settings = JSON.parse(readFileSync(join(tmp, ".claude/settings.json"), "utf8"));
    const commands = (settings.hooks?.PreToolUse ?? []).flatMap((g: { hooks: Array<{ command: string }> }) => g.hooks.map((h) => h.command));
    expect(commands.some((c: string) => c.includes("vue3"))).toBe(false);
    // manifest 清空后文件被移除
    expect(existsSync(join(tmp, ".kimi-boost/installed.json"))).toBe(false);
  });
});
