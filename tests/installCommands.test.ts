import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

vi.mock("node:child_process", () => ({
  execFileSync: vi.fn(),
}));

let tmp: string;
let kimiHome: string;
let claudeHome: string;

function writePresetWithCommands(id: string): string {
  const dir = join(tmp, "presets", id);
  mkdirSync(join(dir, "commands"), { recursive: true });
  writeFileSync(join(dir, "preset.json"), JSON.stringify({ id, name: id, description: "d", tags: [], version: "1.0.0", hooks: [] }), "utf8");
  writeFileSync(join(dir, "commands", "review.md"), "---\ndescription: review\n---\n\nReview this code.\n", "utf8");
  return dir;
}

beforeAll(() => {
  tmp = mkdtempSync(join(tmpdir(), "kimi-boost-cmdinstall-"));
  kimiHome = join(tmp, "kimi-code");
  claudeHome = join(tmp, "claude");
  process.env.KIMI_CODE_HOME = kimiHome;
  process.env.CLAUDE_CODE_HOME = claudeHome;
  mkdirSync(kimiHome, { recursive: true });
  mkdirSync(claudeHome, { recursive: true });
});

afterAll(() => {
  delete process.env.KIMI_CODE_HOME;
  delete process.env.CLAUDE_CODE_HOME;
  rmSync(tmp, { recursive: true, force: true });
});

describe("commands installation", () => {
  it("claude: copies commands/ to ~/.claude/commands/<id>/", async () => {
    const sourceDir = writePresetWithCommands("test-claude-cmd");
    const { claudeAdapter } = await import("../src/adapters/claude.js");
    const report = await claudeAdapter.activate({
      tool: "claude",
      preset: { id: "test-claude-cmd", name: "test", description: "d", tags: [], hooks: [] },
      sourceDir,
      installDir: join(tmp, "install", "test-claude-cmd"),
    });
    expect(report.ok).toBe(true);
    const cmdFile = join(claudeHome, "commands", "test-claude-cmd", "review.md");
    expect(existsSync(cmdFile)).toBe(true);
    expect(readFileSync(cmdFile, "utf8")).toContain("Review this code.");
  });

  it("claude: deactivate removes commands directory", async () => {
    const sourceDir = writePresetWithCommands("test-claude-rm");
    const { claudeAdapter } = await import("../src/adapters/claude.js");
    await claudeAdapter.activate({
      tool: "claude",
      preset: { id: "test-claude-rm", name: "test", description: "d", tags: [], hooks: [] },
      sourceDir,
      installDir: join(tmp, "install", "test-claude-rm"),
    });
    expect(existsSync(join(claudeHome, "commands", "test-claude-rm"))).toBe(true);
    await claudeAdapter.deactivate("test-claude-rm");
    expect(existsSync(join(claudeHome, "commands", "test-claude-rm"))).toBe(false);
  });

  it("kimi: skips commands/ copy and points user to /plugins channel", async () => {
    const sourceDir = writePresetWithCommands("test-kimi-cmd");
    const { kimiAdapter } = await import("../src/adapters/kimi.js");
    const report = await kimiAdapter.activate({
      tool: "kimi",
      preset: { id: "test-kimi-cmd", name: "test", description: "d", tags: [], hooks: [] },
      sourceDir,
      installDir: join(tmp, "install", "test-kimi-cmd"),
    });
    expect(report.ok).toBe(true);
    // 不再复制到 <kimiHome>/commands/<id>/ — 当前 Kimi Code 不扫描该目录,
    // 预先放置会成为永久垃圾;改为在 message 里指向 /plugins install
    expect(existsSync(join(kimiHome, "commands", "test-kimi-cmd"))).toBe(false);
    expect(report.message).toContain("/plugins install");
    expect(report.message).toContain("未安装");
  });

  it("kimi: deactivate does not touch <kimiHome>/commands/", async () => {
    // 历史遗留:0.17.0 之前的版本会把 commands 复制过去。新版本不再写,
    // deactivate 也不主动清理 — 留给用户手动删除或未来迁移命令处理
    const sourceDir = writePresetWithCommands("test-kimi-rm");
    const { kimiAdapter } = await import("../src/adapters/kimi.js");
    await kimiAdapter.activate({
      tool: "kimi",
      preset: { id: "test-kimi-rm", name: "test", description: "d", tags: [], hooks: [] },
      sourceDir,
      installDir: join(tmp, "install", "test-kimi-rm"),
    });
    expect(existsSync(join(kimiHome, "commands", "test-kimi-rm"))).toBe(false);
    await kimiAdapter.deactivate("test-kimi-rm");
    expect(existsSync(join(kimiHome, "commands", "test-kimi-rm"))).toBe(false);
  });

  it("skips commands when preset has no commands/ directory", async () => {
    const dir = join(tmp, "presets", "no-cmd");
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "preset.json"), JSON.stringify({ id: "no-cmd", name: "no-cmd", description: "d", tags: [], version: "1.0.0", hooks: [] }), "utf8");
    const { claudeAdapter } = await import("../src/adapters/claude.js");
    const report = await claudeAdapter.activate({
      tool: "claude",
      preset: { id: "no-cmd", name: "no-cmd", description: "d", tags: [], hooks: [] },
      sourceDir: dir,
      installDir: join(tmp, "install", "no-cmd"),
    });
    expect(report.ok).toBe(true);
    expect(existsSync(join(claudeHome, "commands", "no-cmd"))).toBe(false);
  });
});
