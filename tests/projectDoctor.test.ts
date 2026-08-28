import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runProjectDoctor } from "../src/commands/doctorProject.js";
import { installProjectPreset } from "../src/core/project.js";

let tmp: string;

beforeAll(() => {
  tmp = mkdtempSync(join(tmpdir(), "kimi-boost-projdoc-"));
  mkdirSync(join(tmp, ".git"));
});

afterAll(() => {
  rmSync(tmp, { recursive: true, force: true });
});

describe("doctor --project", () => {
  it("warns when no project presets installed", () => {
    const issues = runProjectDoctor(false, tmp);
    expect(issues.some((i) => i.item.includes("no project presets"))).toBe(true);
  });

  it("all ok after installing a preset", async () => {
    await installProjectPreset("vue3", { root: tmp });
    const issues = runProjectDoctor(false, tmp);
    const errors = issues.filter((i) => i.level === "error");
    expect(errors).toHaveLength(0);
    expect(issues.some((i) => i.item.includes("git repository detected"))).toBe(true);
    expect(issues.some((i) => i.item.includes("file present"))).toBe(true);
  });

  it("detects missing files and --fix restores them", async () => {
    rmSync(join(tmp, ".agents/agents/vue3-reviewer.md"));
    let issues = runProjectDoctor(false, tmp);
    expect(issues.some((i) => i.level === "error" && i.item.includes("file missing"))).toBe(true);

    issues = runProjectDoctor(true, tmp);
    expect(existsSync(join(tmp, ".agents/agents/vue3-reviewer.md"))).toBe(true);
    expect(issues.some((i) => i.item.includes("restored"))).toBe(true);
  });

  it("detects CLI dependency (kimi needed for .agents/)", async () => {
    const issues = runProjectDoctor(false, tmp);
    const kimiIssue = issues.find((i) => i.item.startsWith("kimi:"));
    expect(kimiIssue).toBeDefined();
    // 本机装了 kimi CLI,所以应该是 ok;在 CI 无 CLI 环境下会是 warn
    expect(["ok", "warn"]).toContain(kimiIssue!.level);
  });

  it("detects stale claude hook entries and --fix cleans them", async () => {
    // 手动往 settings.json 里加一条指向不存在脚本的 hook
    const settingsPath = join(tmp, ".claude/settings.json");
    const settings = JSON.parse(readFileSync(settingsPath, "utf8"));
    settings.hooks = settings.hooks ?? {};
    settings.hooks.PreToolUse = settings.hooks.PreToolUse ?? [];
    settings.hooks.PreToolUse.push({
      matcher: "Bash",
      hooks: [{ type: "command", command: 'node "$CLAUDE_PROJECT_DIR/.kimi-boost/ghost/hooks/nonexistent.mjs"' }],
    });
    writeFileSync(settingsPath, JSON.stringify(settings, null, 2));

    let issues = runProjectDoctor(false, tmp);
    expect(issues.some((i) => i.level === "error" && i.item.includes("hook script missing"))).toBe(true);

    issues = runProjectDoctor(true, tmp);
    expect(issues.some((i) => i.item.includes("settings.json cleaned"))).toBe(true);
    const cleaned = JSON.parse(readFileSync(settingsPath, "utf8"));
    const commands = (cleaned.hooks?.PreToolUse ?? []).flatMap((g: { hooks: Array<{ command: string }> }) =>
      g.hooks.map((h) => h.command),
    );
    expect(commands.some((c: string) => c.includes("ghost"))).toBe(false);
  });
});
