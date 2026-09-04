import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import * as tar from "tar";
import { installPreset } from "../src/commands/install.js";
import { listStatus } from "../src/commands/list.js";

vi.mock("tar", () => ({ x: vi.fn(async () => undefined) }));
vi.mock("../src/commands/install.js", () => ({
  installPreset: vi.fn(async () => [{ tool: "kimi", presetId: "vue3", ok: true, message: "ok", changed: [] }]),
}));
vi.mock("../src/commands/list.js", () => ({
  listStatus: vi.fn(async () => ({ presets: [], installedOnly: ["vue3"] })),
}));

let tmp: string;
let boostHome: string;

function writeLocalStore(id: string, version: string, files: Record<string, string> = {}): string {
  const dir = join(boostHome, "presets", id);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "preset.json"), JSON.stringify({ id, version }), "utf8");
  for (const [rel, content] of Object.entries(files)) {
    const fp = join(dir, rel);
    mkdirSync(dirname(fp), { recursive: true });
    writeFileSync(fp, content, "utf8");
  }
  return dir;
}

/**
 * 模拟远端 registry:codeload 返回假 tarball,tar.x 把 preset 内容播种到
 * `${cwd}/<repoDir>/presets/<id>/`。repoDir 故意用非 "kimi-boost-main" 的名字,
 * 以证明 findRepoRoot 不依赖硬编码目录名(fork 健壮)。
 */
function stubRegistry(remotePresets: Record<string, { version: string; files?: Record<string, string> }>): void {
  vi.stubGlobal("fetch", vi.fn(async (url: string) => {
    if (url.includes("codeload")) return { ok: true, arrayBuffer: async () => new ArrayBuffer(0) };
    if (url.includes("preset.json")) {
      const m = url.match(/presets\/([^/]+)\/preset\.json/);
      const id = m?.[1] ?? "";
      return { ok: true, json: async () => ({ version: remotePresets[id]?.version }) };
    }
    throw new Error(`unexpected fetch: ${url}`);
  }));
  vi.mocked(tar.x).mockImplementation(async (opts: unknown) => {
    const cwd = (opts as { cwd: string }).cwd;
    for (const [id, p] of Object.entries(remotePresets)) {
      const dir = join(cwd, "somefork-main", "presets", id);
      mkdirSync(dir, { recursive: true });
      writeFileSync(join(dir, "preset.json"), JSON.stringify({ id, version: p.version }), "utf8");
      for (const [rel, content] of Object.entries(p.files ?? {})) {
        const fp = join(dir, rel);
        mkdirSync(dirname(fp), { recursive: true });
        writeFileSync(fp, content, "utf8");
      }
    }
  });
}

beforeAll(() => {
  tmp = mkdtempSync(join(tmpdir(), "kimi-boost-updatecmd-"));
  boostHome = join(tmp, "kboost");
  process.env.KIMI_BOOST_HOME = boostHome;
});

afterAll(() => {
  delete process.env.KIMI_BOOST_HOME;
  rmSync(tmp, { recursive: true, force: true });
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe("fetchRemotePreset", () => {
  it("returns ok:false when the fetch fails", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: false, status: 404 })));
    const { fetchRemotePreset } = await import("../src/commands/update.js");
    expect((await fetchRemotePreset("vue3")).ok).toBe(false);
  });

  it("returns the remote version when reachable", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, json: async () => ({ version: "2.0.0" }) })));
    const { fetchRemotePreset } = await import("../src/commands/update.js");
    expect(await fetchRemotePreset("vue3")).toEqual({ ok: true, version: "2.0.0" });
  });
});

describe("runUpdate", () => {
  it("reports (none) when nothing is installed", async () => {
    vi.mocked(listStatus).mockResolvedValueOnce({ presets: [], installedOnly: [] });
    const { runUpdate } = await import("../src/commands/update.js");
    expect(await runUpdate()).toEqual([{ id: "(none)", status: "up-to-date", message: "no presets installed yet" }]);
  });

  it("activates from the remote sourceDir (not the bundled preset) and cleans up temp dir", async () => {
    writeLocalStore("vue3", "1.0.0");
    stubRegistry({ vue3: { version: "1.1.0" } });
    const { runUpdate } = await import("../src/commands/update.js");
    const results = await runUpdate();
    expect(results).toEqual([{ id: "vue3", status: "updated", from: "1.0.0", to: "1.1.0" }]);

    // 关键断言:installPreset 收到的是远端解包目录 sourceDir
    const call = vi.mocked(installPreset).mock.calls[0];
    expect(call[0]).toBe("vue3");
    const sourceDir = (call[1] as { sourceDir: string }).sourceDir;
    expect(sourceDir).toContain(join("somefork-main", "presets", "vue3"));
    // 临时目录(root = <tmp>/kboost-registry-XXX,即 sourceDir 上 3 层)在 finally 中被清理
    const registryRoot = dirname(dirname(dirname(sourceDir)));
    expect(existsSync(registryRoot)).toBe(false);
  });

  it("reports up-to-date and skips reinstall when versions match", async () => {
    writeLocalStore("vue3", "1.0.0");
    stubRegistry({ vue3: { version: "1.0.0" } });
    const { runUpdate } = await import("../src/commands/update.js");
    const results = await runUpdate();
    expect(results).toEqual([{ id: "vue3", status: "up-to-date", from: "1.0.0", to: "1.0.0" }]);
    expect(installPreset).not.toHaveBeenCalled();
  });

  it("reports error for every preset when the registry tarball fetch fails", async () => {
    writeLocalStore("vue3", "1.0.0");
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: false, status: 500 })));
    const { runUpdate } = await import("../src/commands/update.js");
    const results = await runUpdate();
    expect(results).toHaveLength(1);
    expect(results[0].status).toBe("error");
    expect(results[0].message).toContain("failed to fetch tarball");
  });
});

describe("previewUpdate", () => {
  it("returns update-available with a content diff and never installs", async () => {
    writeLocalStore("vue3", "1.0.0", {
      "skills/vue3-best-practices/SKILL.md": "v1",
      "hooks/protect-main.mjs": "old-hook",
    });
    stubRegistry({
      vue3: {
        version: "1.1.0",
        files: {
          "skills/vue3-best-practices/SKILL.md": "v2",
          "hooks/new-guard.mjs": "new-hook",
        },
      },
    });
    const { previewUpdate } = await import("../src/commands/update.js");
    const previews = await previewUpdate();
    expect(previews).toHaveLength(1);
    const p = previews[0];
    expect(p.status).toBe("update-available");
    expect(p.from).toBe("1.0.0");
    expect(p.to).toBe("1.1.0");
    expect(p.diff?.added).toEqual(["hooks/new-guard.mjs"]);
    // preset.json 因版本号变化(1.0.0->1.1.0)也属于 modified
    expect(p.diff?.modified).toEqual(["preset.json", "skills/vue3-best-practices/SKILL.md"]);
    expect(p.diff?.removed).toEqual(["hooks/protect-main.mjs"]);
    // 预览是纯读:不触发安装
    expect(installPreset).not.toHaveBeenCalled();
    // 本地 store 未被改动
    expect(JSON.parse(readFileSync(join(boostHome, "presets", "vue3", "preset.json"), "utf8")).version).toBe("1.0.0");
  });

  it("reports up-to-date when versions match", async () => {
    writeLocalStore("vue3", "1.0.0");
    stubRegistry({ vue3: { version: "1.0.0" } });
    const { previewUpdate } = await import("../src/commands/update.js");
    const previews = await previewUpdate();
    expect(previews).toEqual([{ id: "vue3", status: "up-to-date", from: "1.0.0", to: "1.0.0" }]);
  });

  it("returns [] when nothing is installed", async () => {
    vi.mocked(listStatus).mockResolvedValueOnce({ presets: [], installedOnly: [] });
    const { previewUpdate } = await import("../src/commands/update.js");
    expect(await previewUpdate()).toEqual([]);
  });
});
