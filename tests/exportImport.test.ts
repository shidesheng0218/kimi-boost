import { mkdtempSync, mkdirSync, rmSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import prompts from "prompts";
import { installPreset } from "../src/commands/install.js";
import { installRemotePreset } from "../src/commands/installRemote.js";
import { installWatch } from "../src/commands/updateWatch.js";

vi.mock("prompts", () => ({ default: vi.fn() }));
vi.mock("../src/commands/install.js", () => ({
  installPreset: vi.fn(async (id: string) => [{ tool: "kimi", presetId: id, ok: true, message: "ok", changed: [] }]),
}));
vi.mock("../src/commands/installRemote.js", () => ({
  installRemotePreset: vi.fn(async () => [{ tool: "kimi", presetId: "cool", ok: true, message: "ok", changed: [] }]),
}));
vi.mock("../src/commands/updateWatch.js", () => ({
  installWatch: vi.fn(() => ({ platform: "darwin", message: "watch on" })),
  getWatchState: vi.fn(() => ({ enabled: true, intervalHours: 6 })),
}));

let tmp: string;
let boostHome: string;

beforeEach(() => {
  tmp = mkdtempSync(join(tmpdir(), "kboost-expimp-"));
  boostHome = join(tmp, "kboost");
  process.env.KIMI_BOOST_HOME = boostHome;
  mkdirSync(join(boostHome, "presets", "go"), { recursive: true });
  writeFileSync(join(boostHome, "presets", "go", "preset.json"), JSON.stringify({ id: "go", version: "1.0.0" }), "utf8");
  writeFileSync(
    join(boostHome, "installed.json"),
    JSON.stringify({
      presets: {
        go: { kimi: { files: [], version: "1.0.0" }, claude: { files: [], version: "1.0.0" } },
        cool: { kimi: ["legacy-array-form"] },
      },
    }),
    "utf8",
  );
  writeFileSync(join(boostHome, "sources.json"), JSON.stringify({ cool: { repo: "foo/bar", ref: "main" } }), "utf8");
});

afterEach(() => {
  delete process.env.KIMI_BOOST_HOME;
  rmSync(tmp, { recursive: true, force: true });
  vi.clearAllMocks();
});

describe("buildExportManifest", () => {
  it("collects presets with versions and tools, sources, and watch state", async () => {
    const { buildExportManifest } = await import("../src/commands/export.js");
    const m = buildExportManifest({ cliVersion: "0.11.0" });
    expect(m.schema).toBe(1);
    expect(m.cliVersion).toBe("0.11.0");
    expect(m.presets).toEqual([
      { id: "cool", version: undefined, tools: ["kimi"] }, // 旧数组形态无版本
      { id: "go", version: "1.0.0", tools: ["claude", "kimi"] },
    ]);
    expect(m.sources).toEqual({ cool: { repo: "foo/bar", ref: "main" } });
    expect(m.watch).toEqual({ enabled: true, intervalHours: 6 });
    expect(m.usage).toBeUndefined();
  });

  it("includes usage only with --include-usage", async () => {
    writeFileSync(join(boostHome, "usage.json"), JSON.stringify({ days: { "2026-01-01": { sessions: 1, prompts: 2, toolCalls: 3 } } }), "utf8");
    const { buildExportManifest } = await import("../src/commands/export.js");
    expect(buildExportManifest({ cliVersion: "x", includeUsage: true }).usage?.days["2026-01-01"].prompts).toBe(2);
  });
});

describe("runImport", () => {
  function writeManifest(overrides: Record<string, unknown> = {}): string {
    const file = join(tmp, "export.json");
    writeFileSync(
      file,
      JSON.stringify({
        schema: 1,
        exportedAt: "2026-09-08T00:00:00Z",
        cliVersion: "0.11.0",
        presets: [
          { id: "go", version: "1.0.0", tools: ["kimi"] },
          { id: "cool", version: "1.2.0", tools: ["kimi"] },
        ],
        sources: { cool: { repo: "foo/bar", ref: "main" } },
        watch: { enabled: true, intervalHours: 6 },
        ...overrides,
      }),
      "utf8",
    );
    return file;
  }

  it("restores official presets via registry, community via source repo, and watch", async () => {
    const { runImport } = await import("../src/commands/import.js");
    await runImport(writeManifest(), { yes: true });

    // 官方 preset:getPreset('go') 存在 → installPreset 不带 sourceDir
    const officialCall = vi.mocked(installPreset).mock.calls.find((c) => c[0] === "go");
    expect(officialCall).toBeDefined();
    expect((officialCall![1] as { sourceDir?: string }).sourceDir).toBeUndefined();

    // 社区 preset:按 sources.json 的来源精确重装
    expect(installRemotePreset).toHaveBeenCalledWith({ owner: "foo", repo: "bar", ref: "main" }, { yes: true, tool: undefined });

    // watch 恢复
    expect(installWatch).toHaveBeenCalledWith({ interval: 6 });
  });

  it("dry-run prints the plan and installs nothing", async () => {
    const { runImport } = await import("../src/commands/import.js");
    await runImport(writeManifest(), { dryRun: true });
    expect(installPreset).not.toHaveBeenCalled();
    expect(installRemotePreset).not.toHaveBeenCalled();
    expect(installWatch).not.toHaveBeenCalled();
  });

  it("cancels when the user declines", async () => {
    vi.mocked(prompts).mockResolvedValue({ ok: false });
    const { runImport } = await import("../src/commands/import.js");
    await runImport(writeManifest(), {});
    expect(installPreset).not.toHaveBeenCalled();
    expect(installRemotePreset).not.toHaveBeenCalled();
  });

  it("skips presets missing from the official registry", async () => {
    const { runImport } = await import("../src/commands/import.js");
    await runImport(writeManifest({ presets: [{ id: "no-such-preset-xyz", version: "1.0.0", tools: ["kimi"] }], sources: {}, watch: { enabled: false } }), { yes: true });
    expect(installPreset).not.toHaveBeenCalled();
  });

  it("rejects an unsupported schema", async () => {
    const { runImport } = await import("../src/commands/import.js");
    await expect(runImport(writeManifest({ schema: 99 }), { yes: true })).rejects.toThrow("schema");
  });

  it("merges usage history, keeping local days on conflict", async () => {
    writeFileSync(
      join(boostHome, "usage.json"),
      JSON.stringify({ days: { "2026-01-01": { sessions: 9, prompts: 9, toolCalls: 9 } } }),
      "utf8",
    );
    const { runImport, mergeUsage } = await import("../src/commands/import.js");
    const merged = mergeUsage(
      { days: { "2026-01-01": { sessions: 9, prompts: 9, toolCalls: 9 } } },
      { days: { "2026-01-01": { sessions: 1, prompts: 1, toolCalls: 1 }, "2026-01-02": { sessions: 2, prompts: 2, toolCalls: 2 } } },
    );
    expect(merged.added).toBe(1);
    expect(merged.skipped).toBe(1);
    expect(merged.data.days["2026-01-01"].prompts).toBe(9); // 本机值优先

    await runImport(
      writeManifest({ usage: { days: { "2026-01-01": { sessions: 1, prompts: 1, toolCalls: 1 }, "2026-01-02": { sessions: 2, prompts: 2, toolCalls: 2 } } }, watch: { enabled: false } }),
      { yes: true },
    );
    const onDisk = JSON.parse(readFileSync(join(boostHome, "usage.json"), "utf8"));
    expect(onDisk.days["2026-01-02"].prompts).toBe(2);
    expect(onDisk.days["2026-01-01"].prompts).toBe(9);
  });
});

describe("export --embed-content round trip", () => {
  it("embeds the preset store and import installs from the embedded content", async () => {
    const out = join(tmp, "export.tar.gz");
    const { runExport } = await import("../src/commands/export.js");
    await runExport({ out, embedContent: true, cliVersion: "0.11.0" });
    expect(existsSync(out)).toBe(true);

    const { runImport } = await import("../src/commands/import.js");
    await runImport(out, { yes: true });
    // go 不在 sources 里 → 走 embedded sourceDir 安装
    const call = vi.mocked(installPreset).mock.calls.find((c) => c[0] === "go");
    expect(call).toBeDefined();
    expect((call![1] as { sourceDir: string }).sourceDir).toContain(join("presets", "go"));
  });
});
