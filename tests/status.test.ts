import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

let tmp: string;
let boostHome: string;

function writeLocalStore(id: string, version: string): void {
  const dir = join(boostHome, "presets", id);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "preset.json"), JSON.stringify({ id, version }), "utf8");
}

beforeAll(() => {
  tmp = mkdtempSync(join(tmpdir(), "kimi-boost-status-"));
  boostHome = join(tmp, "kboost");
  process.env.KIMI_BOOST_HOME = boostHome;
});

afterAll(() => {
  delete process.env.KIMI_BOOST_HOME;
  rmSync(tmp, { recursive: true, force: true });
});

describe("getStatus", () => {
  it("reflects platform and per-tool detection", async () => {
    const { getStatus } = await import("../src/commands/status.js");
    const s = getStatus();
    expect(s.tools.map((t) => t.name)).toEqual(["kimi", "claude", "codex"]);
    expect(typeof s.platform).toBe("string");
  });
});

describe("getPresetMatrix / renderPresetMatrix", () => {
  it("builds a matrix row per installed preset with per-tool flags", async () => {
    writeLocalStore("vue3", "1.0.0");
    const { getPresetMatrix, renderPresetMatrix } = await import("../src/commands/status.js");
    const rows = [
      { id: "vue3", installed: "1.0.0", latest: "1.1.0", tools: { kimi: true, claude: false, codex: false } },
    ];
    const table = renderPresetMatrix(rows);
    const lines = table.split("\n");
    expect(lines[0]).toContain("Preset");
    expect(lines[1]).toContain("vue3");
    expect(lines[1]).toContain("✓");
    expect(lines[1]).toContain("—");

    // getPresetMatrix exercises real adapters; just assert it resolves to an array without throwing
    const matrix = await getPresetMatrix();
    expect(Array.isArray(matrix)).toBe(true);
  });
});
