import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as tar from "tar";
import { installPreset } from "../src/commands/install.js";

vi.mock("tar", () => ({ x: vi.fn(async () => undefined) }));
vi.mock("../src/commands/install.js", () => ({
  installPreset: vi.fn(async (id: string) => [{ tool: "kimi", presetId: id, ok: true, message: "ok", changed: [] }]),
}));
vi.mock("../src/commands/list.js", () => ({
  listStatus: vi.fn(async () => ({ presets: [], installedOnly: ["cool"] })),
}));

let tmp: string;
let boostHome: string;

beforeEach(() => {
  tmp = mkdtempSync(join(tmpdir(), "kboost-updc-"));
  boostHome = join(tmp, "kboost");
  process.env.KIMI_BOOST_HOME = boostHome;
  // 本地 store:cool@1.0.0 + sources.json 标记其来自社区仓库
  const store = join(boostHome, "presets", "cool");
  mkdirSync(store, { recursive: true });
  writeFileSync(join(store, "preset.json"), JSON.stringify({ id: "cool", version: "1.0.0" }), "utf8");
  writeFileSync(join(boostHome, "sources.json"), JSON.stringify({ cool: { repo: "foo/bar", ref: "main" } }), "utf8");
});

afterEach(() => {
  delete process.env.KIMI_BOOST_HOME;
  rmSync(tmp, { recursive: true, force: true });
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

/** 模拟社区仓库 tarball:preset.json 在仓库根(无 presets/ 子目录) */
function stubCommunityRepo(version: string): void {
  vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, arrayBuffer: async () => new ArrayBuffer(0) })));
  vi.mocked(tar.x).mockImplementation(async (opts: unknown) => {
    const cwd = (opts as { cwd: string }).cwd;
    const dir = join(cwd, "bar-main");
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "preset.json"), JSON.stringify({ id: "cool", version }), "utf8");
  });
}

describe("update with community presets", () => {
  it("updates a community preset from its source repo (preset.json at repo root)", async () => {
    stubCommunityRepo("1.1.0");
    const { runUpdate } = await import("../src/commands/update.js");
    const results = await runUpdate();
    expect(results).toEqual([{ id: "cool", status: "updated", from: "1.0.0", to: "1.1.0" }]);
    const call = vi.mocked(installPreset).mock.calls[0];
    expect((call[1] as { sourceDir: string }).sourceDir).toContain(join("bar-main"));
  });

  it("reports up-to-date when the source repo version matches", async () => {
    stubCommunityRepo("1.0.0");
    const { runUpdate } = await import("../src/commands/update.js");
    const results = await runUpdate();
    expect(results).toEqual([{ id: "cool", status: "up-to-date", from: "1.0.0", to: "1.0.0" }]);
    expect(installPreset).not.toHaveBeenCalled();
  });

  it("reports error when the source repo is unreachable", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: false, status: 404 })));
    const { runUpdate } = await import("../src/commands/update.js");
    const results = await runUpdate();
    expect(results[0].status).toBe("error");
    expect(results[0].message).toContain("failed to fetch tarball");
  });

  it("previewUpdate diffs community presets without installing", async () => {
    stubCommunityRepo("1.1.0");
    const { previewUpdate } = await import("../src/commands/update.js");
    const previews = await previewUpdate();
    expect(previews[0].status).toBe("update-available");
    expect(previews[0].diff?.modified).toEqual(["preset.json"]);
    expect(installPreset).not.toHaveBeenCalled();
  });

  it("outdated checks community presets against the source repo root preset.json", async () => {
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      // 社区 preset 应读仓库根 preset.json,而非官方 registry 的 presets/<id>/ 路径
      if (url === "https://raw.githubusercontent.com/foo/bar/main/preset.json") {
        return { ok: true, json: async () => ({ version: "1.1.0" }) };
      }
      throw new Error(`unexpected fetch: ${url}`);
    }));
    const { runOutdated } = await import("../src/commands/outdated.js");
    const rows = await runOutdated({ ids: ["cool"] });
    expect(rows).toEqual([{ id: "cool", installed: "1.0.0", latest: "1.1.0", status: "update-available" }]);
  });
});
