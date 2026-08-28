import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

/** manifest v0.8 版本化:新旧格式互读、自然迁移、项目级 manifest 带版本 */
let tmp: string;
let boostHome: string;

beforeAll(() => {
  tmp = mkdtempSync(join(tmpdir(), "kimi-boost-manifest-"));
  boostHome = join(tmp, "kboost");
  process.env.KIMI_BOOST_HOME = boostHome;
});

afterAll(() => {
  delete process.env.KIMI_BOOST_HOME;
  rmSync(tmp, { recursive: true, force: true });
});

describe("user manifest back-compat", () => {
  it("reads legacy string[] records and migrates on next recordInstall", async () => {
    const manifestPath = join(boostHome, "installed.json");
    mkdirSync(boostHome, { recursive: true });
    writeFileSync(
      manifestPath,
      JSON.stringify({ presets: { vue3: { claude: ["/old/path"] } } }),
      "utf8",
    );

    const { installedFilesFor, recordInstall, recordedVersion } = await import("../src/core/manifest.js");
    expect(installedFilesFor("vue3", "claude")).toEqual(["/old/path"]);
    expect(recordedVersion("vue3")).toBeUndefined();

    recordInstall("vue3", "claude", ["/new/path"], "1.1.0");
    expect(installedFilesFor("vue3", "claude")).toEqual(["/old/path", "/new/path"]);
    expect(recordedVersion("vue3")).toBe("1.1.0");

    const stored = JSON.parse(await import("node:fs").then((fs) => fs.readFileSync(manifestPath, "utf8")));
    expect(stored.presets.vue3.claude).toEqual({ files: ["/old/path", "/new/path"], version: "1.1.0" });
  });

  it("writeHookRegistry stores hook entries in the same manifest", async () => {
    const { writeHookRegistry, readHookRegistry } = await import("../src/core/manifest.js");
    writeHookRegistry({
      fp1: { event: "PreToolUse", matcher: "Bash", script: "guard.mjs", command: 'node "/h/a/guard.mjs"', refs: ["a"] },
    });
    expect(Object.keys(readHookRegistry())).toEqual(["fp1"]);
  });
});

describe("project manifest versioning", () => {
  it("installProjectPreset records the preset version", async () => {
    const proj = join(tmp, "proj");
    mkdirSync(join(proj, ".git"), { recursive: true });
    const { installProjectPreset, projectInstalledPresets } = await import("../src/core/project.js");
    await installProjectPreset("vue3", { root: proj });

    const rows = projectInstalledPresets(proj);
    expect(rows).toEqual([{ id: "vue3", version: "1.0.0" }]);
  });

  it("removeProjectPreset still cleans legacy array-shaped manifests", async () => {
    const proj = join(tmp, "legacy-proj");
    mkdirSync(join(proj, ".git"), { recursive: true });
    mkdirSync(join(proj, ".agents", "agents"), { recursive: true });
    mkdirSync(join(proj, ".kimi-boost"), { recursive: true });
    writeFileSync(join(proj, ".agents", "agents", "vue3-reviewer.md"), "x", "utf8");
    writeFileSync(
      join(proj, ".kimi-boost", "installed.json"),
      JSON.stringify({ presets: { vue3: [".agents/agents/vue3-reviewer.md"] } }),
      "utf8",
    );

    const { removeProjectPreset, projectInstalledPresets } = await import("../src/core/project.js");
    const reports = await removeProjectPreset("vue3", { root: proj });
    expect(reports[0].changed).toContain(".agents/agents/vue3-reviewer.md");
    expect(existsSync(join(proj, ".agents", "agents", "vue3-reviewer.md"))).toBe(false);
    expect(projectInstalledPresets(proj)).toEqual([]);
  });
});
