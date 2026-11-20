import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { installedKimiPlugins, kimiHookEvents, kimiHookSummary } from "../src/core/kimiPlugins.js";

let tmp: string;
let home: string;

beforeEach(() => {
  tmp = mkdtempSync(join(tmpdir(), "kboost-plugins-"));
  home = join(tmp, "kimi-code");
  process.env.KIMI_CODE_HOME = home;
  mkdirSync(join(home, "plugins", "managed"), { recursive: true });
});

afterEach(() => {
  delete process.env.KIMI_CODE_HOME;
  rmSync(tmp, { recursive: true, force: true });
});

function manifest(id: string, hooks: Array<{ event: string }>): void {
  const dir = join(home, "plugins", "managed", id);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "kimi.plugin.json"), JSON.stringify({ name: id, hooks }), "utf8");
}

function config(hooks: Array<{ event: string }>): void {
  const text = hooks
    .map((h) => `[[hooks]]\nevent = "${h.event}"\ncommand = "node ./hooks/${h.event}.mjs"\n`)
    .join("\n");
  writeFileSync(join(home, "config.toml"), text, "utf8");
}

describe("installedKimiPlugins", () => {
  it("counts managed plugin directories and installed.json ids without duplicates", () => {
    manifest("a", []);
    manifest("b", []);
    writeFileSync(
      join(home, "plugins", "installed.json"),
      JSON.stringify({ plugins: [{ id: "b" }, { id: "c" }] }),
      "utf8",
    );
    expect(installedKimiPlugins()).toEqual(["a", "b", "c"]);
  });

  it("returns an empty list when nothing is installed", () => {
    rmSync(join(home, "plugins", "managed"), { recursive: true, force: true });
    expect(installedKimiPlugins()).toEqual([]);
  });
});

describe("kimiHookEvents", () => {
  it("collects hook events from config.toml", () => {
    config([{ event: "PreToolUse" }, { event: "PostToolUse" }]);
    expect(kimiHookEvents()).toEqual(["PostToolUse", "PreToolUse"]);
  });

  it("collects hook events from plugin manifests", () => {
    manifest("a", [{ event: "Stop" }, { event: "PostToolUse" }]);
    expect(kimiHookEvents()).toEqual(["PostToolUse", "Stop"]);
  });

  it("dedupes the same event from both channels", () => {
    config([{ event: "PreToolUse" }, { event: "PostToolUse" }]);
    manifest("a", [{ event: "PostToolUse" }, { event: "Stop" }]);
    expect(kimiHookEvents()).toEqual(["PostToolUse", "PreToolUse", "Stop"]);
  });

  it("returns an empty list when nothing is installed", () => {
    rmSync(join(home, "plugins", "managed"), { recursive: true, force: true });
    expect(kimiHookEvents()).toEqual([]);
  });

  it("summarizes hook counts across channels including duplicates", () => {
    config([{ event: "PreToolUse" }, { event: "PostToolUse" }]);
    manifest("a", [{ event: "PostToolUse" }, { event: "Stop" }]);
    expect(kimiHookSummary()).toEqual({ total: 4, byEvent: { PreToolUse: 1, PostToolUse: 2, Stop: 1 } });
  });
});