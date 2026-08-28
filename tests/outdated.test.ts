import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

/** outdated:本地已装版本 vs 远端 registry 版本(fetch mock,不触网) */
let tmp: string;
let boostHome: string;

function writeLocalStore(id: string, version: string): void {
  const dir = join(boostHome, "presets", id);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "preset.json"), JSON.stringify({ id, version }), "utf8");
}

beforeAll(() => {
  tmp = mkdtempSync(join(tmpdir(), "kimi-boost-outdated-"));
  boostHome = join(tmp, "kboost");
  process.env.KIMI_BOOST_HOME = boostHome;
});

afterAll(() => {
  delete process.env.KIMI_BOOST_HOME;
  vi.unstubAllGlobals();
  rmSync(tmp, { recursive: true, force: true });
});

describe("runOutdated", () => {
  it("reports update-available when remote is newer", async () => {
    writeLocalStore("vue3", "1.0.0");
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: true, json: async () => ({ version: "1.1.0" }) })),
    );
    const { runOutdated } = await import("../src/commands/outdated.js");
    const rows = await runOutdated({ ids: ["vue3"] });
    expect(rows).toEqual([{ id: "vue3", installed: "1.0.0", latest: "1.1.0", status: "update-available" }]);
  });

  it("reports up-to-date when versions match", async () => {
    writeLocalStore("react", "2.0.0");
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: true, json: async () => ({ version: "2.0.0" }) })),
    );
    const { runOutdated } = await import("../src/commands/outdated.js");
    const rows = await runOutdated({ ids: ["react"] });
    expect(rows[0].status).toBe("up-to-date");
  });

  it("reports unknown-remote when registry is unreachable", async () => {
    writeLocalStore("go", "1.0.0");
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: false, status: 404 })),
    );
    const { runOutdated } = await import("../src/commands/outdated.js");
    const rows = await runOutdated({ ids: ["go"] });
    expect(rows[0].status).toBe("unknown-remote");
    expect(rows[0].installed).toBe("1.0.0");
  });

  it("reports unknown-local when installed version cannot be determined", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: true, json: async () => ({ version: "1.0.0" }) })),
    );
    const { runOutdated } = await import("../src/commands/outdated.js");
    const rows = await runOutdated({ ids: ["mystery"] });
    expect(rows[0].status).toBe("unknown-local");
    expect(rows[0].latest).toBe("1.0.0");
  });

  it("renderOutdated aligns a readable table", async () => {
    const { renderOutdated } = await import("../src/commands/outdated.js");
    const table = renderOutdated([
      { id: "vue3", installed: "1.0.0", latest: "1.1.0", status: "update-available" },
      { id: "react", installed: "2.0.0", latest: "2.0.0", status: "up-to-date" },
    ]);
    expect(table.split("\n")).toHaveLength(3);
    expect(table).toContain("update available");
  });
});
