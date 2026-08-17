import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

let tmp: string;
let kimiHome: string;
let boostHome: string;

beforeAll(() => {
  tmp = mkdtempSync(join(tmpdir(), "kimi-boost-dual-"));
  kimiHome = join(tmp, ".kimi-code");
  boostHome = join(tmp, "kboost");
  mkdirSync(kimiHome, { recursive: true });
  process.env.KIMI_CODE_HOME = kimiHome;
  process.env.KIMI_BOOST_HOME = boostHome;
});

afterAll(() => {
  delete process.env.KIMI_CODE_HOME;
  delete process.env.KIMI_BOOST_HOME;
  rmSync(tmp, { recursive: true, force: true });
});

describe("dual-channel detection", () => {
  it("detects plugin installed via managed dir probe", async () => {
    mkdirSync(join(kimiHome, "plugins", "managed", "vue3"), { recursive: true });
    const { kimiPluginInstalled } = await import("../src/core/kimiPlugins.js");
    expect(kimiPluginInstalled("vue3")).toBe(true);
    expect(kimiPluginInstalled("python")).toBe(false);
  });

  it("detects plugin installed via installed.json", async () => {
    rmSync(join(kimiHome, "plugins", "managed"), { recursive: true, force: true });
    mkdirSync(join(kimiHome, "plugins"), { recursive: true });
    writeFileSync(
      join(kimiHome, "plugins", "installed.json"),
      JSON.stringify({ version: "2", plugins: [{ id: "vue3", source: "..." }] }),
      "utf8",
    );
    const { kimiPluginInstalled } = await import("../src/core/kimiPlugins.js");
    expect(kimiPluginInstalled("vue3")).toBe(true);
    expect(kimiPluginInstalled("weapp")).toBe(false);
  });

  it("install skips hooks when plugin is installed via /plugins, unless --with-hooks", async () => {
    const { installPreset } = await import("../src/commands/install.js");
    const { readFileSync } = await import("node:fs");

    // plugin already installed
    mkdirSync(join(kimiHome, "plugins", "managed", "python"), { recursive: true });

    await installPreset("python", { tool: "kimi" });
    const config = readFileSync(join(kimiHome, "config.toml"), "utf8");
    expect(config).not.toContain("block-dangerous");

    // force with hooks
    await installPreset("python", { tool: "kimi", withHooks: true });
    const config2 = readFileSync(join(kimiHome, "config.toml"), "utf8");
    expect(config2).toContain("block-dangerous");
  });
});
