import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { existsSync, mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

let tmp: string;

beforeAll(() => {
  tmp = mkdtempSync(join(tmpdir(), "kimi-boost-dryrun-"));
  process.env.KIMI_CODE_HOME = join(tmp, ".kimi-code");
  process.env.KIMI_BOOST_HOME = join(tmp, "kboost");
});

afterAll(() => {
  delete process.env.KIMI_CODE_HOME;
  delete process.env.KIMI_BOOST_HOME;
  rmSync(tmp, { recursive: true, force: true });
});

describe("dry-run", () => {
  it("install --dry-run writes nothing and reports the plan", async () => {
    const { installPreset } = await import("../src/commands/install.js");

    const reports = await installPreset("vue3", { tool: "kimi", dryRun: true });

    expect(reports.length).toBeGreaterThan(0);
    expect(reports.every((r) => r.ok)).toBe(true);
    expect(reports.some((r) => r.changed.some((c) => c.includes("config.toml")))).toBe(true);

    expect(existsSync(join(tmp, "kboost", "hooks", "vue3"))).toBe(false);
    expect(existsSync(join(tmp, ".kimi-code", "config.toml"))).toBe(false);
  });

  it("remove --dry-run does not delete installed files", async () => {
    const { installPreset } = await import("../src/commands/install.js");
    const { kimiAdapter } = await import("../src/adapters/kimi.js");
    const { setDryRun, isDryRun } = await import("../src/core/fsguard.js");

    await installPreset("vue3", { tool: "kimi" });
    const installedDir = join(tmp, "kboost", "hooks", "vue3");
    expect(existsSync(installedDir)).toBe(true);

    setDryRun(true);
    try {
      await kimiAdapter.deactivate("vue3");
    } finally {
      setDryRun(false);
    }
    expect(isDryRun()).toBe(false);
    expect(existsSync(installedDir)).toBe(true);
  });

  it("dry-run flag is reset after install (no leakage)", async () => {
    const { installPreset } = await import("../src/commands/install.js");
    const { isDryRun } = await import("../src/core/fsguard.js");

    await installPreset("vue3", { tool: "kimi", dryRun: true });
    expect(isDryRun()).toBe(false);

    // a normal install still works after a dry-run
    await installPreset("vue3", { tool: "kimi" });
    expect(existsSync(join(tmp, "kboost", "hooks", "vue3", "protect-main.mjs"))).toBe(true);
    expect(existsSync(join(tmp, ".kimi-code", "config.toml"))).toBe(true);
  });
});
