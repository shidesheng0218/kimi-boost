import { describe, expect, it } from "vitest";
import { buildMarketplace } from "../src/commands/marketplace.js";
import { listPresets } from "../src/registry/presets.js";

describe("buildMarketplace", () => {
  it("repo mode (default) emits only mirrored presets with single-repo sources", () => {
    const m = buildMarketplace();
    expect(m.version).toBe("2");
    expect(m.plugins.length).toBeGreaterThan(0);
    for (const p of m.plugins) {
      expect(p.source).toBe(`https://github.com/shidesheng0218/kimi-boost-${p.id}`);
    }
    expect(m.plugins.map((p) => p.id)).toContain("vue3");
  });

  it("zip mode emits every preset with release-asset sources", () => {
    const m = buildMarketplace({ sourceMode: "zip", version: "v9.9.9" });
    expect(m.plugins.length).toBe(listPresets().length);
    for (const p of m.plugins) {
      expect(p.source).toContain("/releases/download/v9.9.9/");
      expect(p.source).toContain(`${p.id}-v9.9.9.zip`);
    }
  });

  it("repo mode stays installable: no tree-subdirectory URLs", () => {
    const m = buildMarketplace();
    for (const p of m.plugins) {
      expect(p.source).not.toContain("/tree/");
    }
  });
});
