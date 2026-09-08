import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

let tmp: string;
let claudeHome: string;
let codexHome: string;

beforeAll(() => {
  tmp = mkdtempSync(join(tmpdir(), "kimi-boost-partial-"));
  claudeHome = join(tmp, ".claude");
  codexHome = join(tmp, ".codex");
  process.env.CLAUDE_CODE_HOME = claudeHome;
  process.env.CODEX_HOME = codexHome;
  process.env.KIMI_BOOST_HOME = join(tmp, "kboost");
  process.env.KIMI_CODE_HOME = join(tmp, ".kimi-code");
});

afterAll(() => {
  delete process.env.CLAUDE_CODE_HOME;
  delete process.env.CODEX_HOME;
  delete process.env.KIMI_BOOST_HOME;
  delete process.env.KIMI_CODE_HOME;
  rmSync(tmp, { recursive: true, force: true });
});

describe("部分安装失败后可被 remove 清理", () => {
  it("claude: activate 中途抛错时,已写文件仍增量进入 manifest,deactivate 能清干净", async () => {
    // 让 settings.json 为非法 JSON:agents/skills 写完后,hook 处理读取配置时抛错
    mkdirSync(claudeHome, { recursive: true });
    writeFileSync(join(claudeHome, "settings.json"), "not-json", "utf8");

    const { claudeAdapter } = await import("../src/adapters/claude.js");
    const { getPreset, presetSourceDir } = await import("../src/registry/presets.js");
    const preset = getPreset("vue3")!;
    await expect(
      claudeAdapter.activate({
        tool: "claude",
        preset,
        sourceDir: presetSourceDir("vue3"),
        installDir: join(tmp, "preset"),
      }),
    ).rejects.toThrow();

    // 失败前已写的 agents/skills 已记录进 manifest
    const { installedFilesFor } = await import("../src/core/manifest.js");
    const files = installedFilesFor("vue3", "claude");
    expect(files).toContain(join(claudeHome, "agents", "vue3-reviewer.md"));
    expect(files).toContain(join(claudeHome, "skills", "vue3"));

    // 修复配置后 remove 按 manifest 清理,不留孤儿文件
    writeFileSync(join(claudeHome, "settings.json"), "{}", "utf8");
    const report = await claudeAdapter.deactivate("vue3");
    expect(report.ok).toBe(true);
    expect(existsSync(join(claudeHome, "agents", "vue3-reviewer.md"))).toBe(false);
    expect(existsSync(join(claudeHome, "skills", "vue3"))).toBe(false);
    expect(installedFilesFor("vue3", "claude")).toEqual([]);
  });

  it("codex: activate 中途抛错时,已写 skills 仍进 manifest 并可被清理", async () => {
    mkdirSync(codexHome, { recursive: true });
    writeFileSync(join(codexHome, "config.toml"), "[unclosed", "utf8");

    const { codexAdapter } = await import("../src/adapters/codex.js");
    const { getPreset, presetSourceDir } = await import("../src/registry/presets.js");
    const preset = getPreset("python")!;
    await expect(
      codexAdapter.activate({
        tool: "codex",
        preset,
        sourceDir: presetSourceDir("python"),
        installDir: join(tmp, "preset"),
      }),
    ).rejects.toThrow();

    const { installedFilesFor } = await import("../src/core/manifest.js");
    expect(installedFilesFor("python", "codex")).toContain(join(codexHome, "skills", "python"));

    writeFileSync(join(codexHome, "config.toml"), "", "utf8");
    const report = await codexAdapter.deactivate("python");
    expect(report.ok).toBe(true);
    expect(existsSync(join(codexHome, "skills", "python"))).toBe(false);
    expect(installedFilesFor("python", "codex")).toEqual([]);
  });
});
