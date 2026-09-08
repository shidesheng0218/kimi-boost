import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

vi.mock("../src/core/fsguard.js", async (importOriginal) => {
  const orig = await importOriginal<typeof import("../src/core/fsguard.js")>();
  return {
    ...orig,
    // 模拟"写入丢失":声称复制成功但实际不落盘
    copyDirIfWritable: vi.fn((_src: string, dest: string) => [join(dest, "lost.md")]),
  };
});

let tmp: string;
let claudeHome: string;

beforeAll(() => {
  tmp = mkdtempSync(join(tmpdir(), "kimi-boost-selfcheck-"));
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

describe("安装后自检", () => {
  it("记录的关键文件在写完后缺失时,该工具结果被标为 ok:false 且指明缺失文件", async () => {
    const { claudeAdapter } = await import("../src/adapters/claude.js");
    const { getPreset, presetSourceDir } = await import("../src/registry/presets.js");
    const preset = getPreset("vue3")!;
    const report = await claudeAdapter.activate({
      tool: "claude",
      preset,
      sourceDir: presetSourceDir("vue3"),
      installDir: join(tmp, "preset"),
    });

    expect(report.ok).toBe(false);
    expect(report.message).toContain("self-check failed");
    expect(report.message).toContain(join(claudeHome, "skills", "vue3"));
  });

  it("失败的自检结果经 renderReports 输出后退出码为 1", async () => {
    const { claudeAdapter } = await import("../src/adapters/claude.js");
    const { renderReports } = await import("../src/commands/reports.js");
    const { getPreset, presetSourceDir } = await import("../src/registry/presets.js");
    const preset = getPreset("vue3")!;
    const report = await claudeAdapter.activate({
      tool: "claude",
      preset,
      sourceDir: presetSourceDir("vue3"),
      installDir: join(tmp, "preset"),
    });

    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    const prev = process.exitCode;
    process.exitCode = 0;
    try {
      renderReports([report]);
      expect(process.exitCode).toBe(1);
    } finally {
      process.exitCode = prev;
      log.mockRestore();
    }
  });
});
