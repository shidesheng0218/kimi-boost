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

  it("skips malformed plugin records without inflating the count", () => {
    writeFileSync(
      join(home, "plugins", "installed.json"),
      JSON.stringify({
        plugins: [{ foo: 1 }, { id: "real" }, null, "str", { name: "named" }, { enabled: false, id: "disabled" }],
      }),
      "utf8",
    );
    expect(installedKimiPlugins()).toEqual(["named", "real", "str"]);
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

  it("reads hooks from a .kimi-plugin/plugin.json manifest", () => {
    const dir = join(home, "plugins", "managed", "a", ".kimi-plugin");
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "plugin.json"), JSON.stringify({ hooks: [{ event: "PostToolUse" }] }), "utf8");
    expect(kimiHookEvents()).toContain("PostToolUse");
  });

  it("uses the installed.json root when a plugin lives outside managed/", () => {
    const external = join(tmp, "external");
    const dir = join(external, ".kimi-plugin");
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "plugin.json"), JSON.stringify({ hooks: [{ event: "Stop" }] }), "utf8");
    writeFileSync(
      join(home, "plugins", "installed.json"),
      JSON.stringify({ plugins: [{ id: "ext", root: external }] }),
      "utf8",
    );
    expect(kimiHookEvents()).toContain("Stop");
  });

  it("skips null hook entries without dropping the rest of the manifest", () => {
    const dir = join(home, "plugins", "managed", "a");
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "kimi.plugin.json"), JSON.stringify({ hooks: [null, { event: "PostToolUse" }] }), "utf8");
    expect(kimiHookEvents()).toEqual(["PostToolUse"]);
  });
});