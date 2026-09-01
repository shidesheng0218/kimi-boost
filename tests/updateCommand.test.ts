import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

vi.mock("tar", () => ({ x: vi.fn(async () => undefined) }));
vi.mock("../src/commands/install.js", () => ({
  installPreset: vi.fn(async () => [{ tool: "kimi", presetId: "vue3", ok: true, message: "ok", changed: [] }]),
}));
vi.mock("../src/commands/list.js", () => ({
  listStatus: vi.fn(async () => ({ presets: [], installedOnly: ["vue3"] })),
}));

let tmp: string;
let boostHome: string;

function writeLocalStore(id: string, version: string): void {
  const dir = join(boostHome, "presets", id);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "preset.json"), JSON.stringify({ id, version }), "utf8");
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
    const result = await fetchRemotePreset("vue3");
    expect(result.ok).toBe(false);
  });

  it("returns the remote version when reachable", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, json: async () => ({ version: "2.0.0" }) })));
    const { fetchRemotePreset } = await import("../src/commands/update.js");
    const result = await fetchRemotePreset("vue3");
    expect(result).toEqual({ ok: true, version: "2.0.0" });
  });
});

describe("updatePreset", () => {
  it("short-circuits to up-to-date without fetching a tarball", async () => {
    writeLocalStore("vue3", "1.0.0");
    const fetchMock = vi.fn(async (url: string) => {
      if (url.includes("preset.json")) return { ok: true, json: async () => ({ version: "1.0.0" }) };
      throw new Error(`unexpected fetch: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);
    const { updatePreset } = await import("../src/commands/update.js");
    const result = await updatePreset("vue3");
    expect(result.status).toBe("up-to-date");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("downloads and reinstalls when the remote version differs", async () => {
    writeLocalStore("vue3", "1.0.0");
    const fetchMock = vi.fn(async (url: string) => {
      if (url.includes("preset.json")) return { ok: true, json: async () => ({ version: "1.1.0" }) };
      if (url.includes("codeload")) return { ok: true, arrayBuffer: async () => new ArrayBuffer(0) };
      throw new Error(`unexpected fetch: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);
    const tar = await import("tar");
    vi.mocked(tar.x).mockImplementation(async () => {
      // tar.x extracts nothing in this mock, so seed the expected extracted dir ourselves
      const extracted = join(boostHome, "presets", ".tmp-update", "kimi-boost-main", "presets", "vue3");
      mkdirSync(extracted, { recursive: true });
      writeFileSync(join(extracted, "preset.json"), JSON.stringify({ id: "vue3", version: "1.1.0" }), "utf8");
    });
    const { updatePreset } = await import("../src/commands/update.js");
    const result = await updatePreset("vue3");
    expect(result.status).toBe("updated");
    expect(result.to).toBe("1.1.0");
  });

  it("reports error when the registry is unreachable", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: false, status: 500 })));
    const { updatePreset } = await import("../src/commands/update.js");
    const result = await updatePreset("vue3");
    expect(result.status).toBe("error");
  });
});

describe("runUpdate", () => {
  it("updates every installed preset and reports (none) when nothing is installed", async () => {
    const { listStatus } = await import("../src/commands/list.js");
    (listStatus as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ presets: [], installedOnly: [] });
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: false })));
    const { runUpdate } = await import("../src/commands/update.js");
    const results = await runUpdate();
    expect(results).toEqual([{ id: "(none)", status: "up-to-date", message: "no presets installed yet" }]);
  });
});
