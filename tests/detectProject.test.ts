import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { detectProjectPresets } from "../src/core/detectProject.js";

let dir: string;

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

/** 建一个临时目录并写入给定文件,返回目录路径作为项目根 */
function setup(files: Record<string, string>): string {
  dir = mkdtempSync(join(tmpdir(), "kboost-detect-"));
  for (const [name, content] of Object.entries(files)) {
    writeFileSync(join(dir, name), content);
  }
  return dir;
}

function ids(root: string): string[] {
  return detectProjectPresets(root).map((s) => s.id);
}

function pkg(deps: Record<string, string>, devDeps?: Record<string, string>): string {
  return JSON.stringify({ dependencies: deps, ...(devDeps ? { devDependencies: devDeps } : {}) });
}

describe("detectProjectPresets", () => {
  it("detects go via go.mod", () => {
    expect(ids(setup({ "go.mod": "module example.com/x\n" }))).toEqual(["go"]);
  });

  it("detects rust via Cargo.toml", () => {
    expect(ids(setup({ "Cargo.toml": "[package]\n" }))).toEqual(["rust"]);
  });

  it("detects flutter via pubspec.yaml", () => {
    expect(ids(setup({ "pubspec.yaml": "name: x\n" }))).toEqual(["flutter"]);
  });

  it("detects java via pom.xml", () => {
    expect(ids(setup({ "pom.xml": "<project/>\n" }))).toEqual(["java"]);
  });

  it("detects java via build.gradle.kts", () => {
    expect(ids(setup({ "build.gradle.kts": "plugins {}\n" }))).toEqual(["java"]);
  });

  it("detects uniapp via pages.json", () => {
    expect(ids(setup({ "pages.json": "{}" }))).toEqual(["uniapp"]);
  });

  it("detects weapp via project.config.json", () => {
    expect(ids(setup({ "project.config.json": "{}" }))).toEqual(["weapp"]);
  });

  it("detects nextjs via next dependency", () => {
    expect(ids(setup({ "package.json": pkg({ next: "^14.0.0" }) }))).toEqual(["nextjs"]);
  });

  it("detects react via react dependency", () => {
    expect(ids(setup({ "package.json": pkg({ react: "^18.0.0" }) }))).toEqual(["react"]);
  });

  it("prefers nextjs over react when both deps are present", () => {
    expect(ids(setup({ "package.json": pkg({ next: "^14.0.0", react: "^18.0.0" }) }))).toEqual(["nextjs"]);
  });

  it("detects nestjs via @nestjs/core dependency", () => {
    expect(ids(setup({ "package.json": pkg({ "@nestjs/core": "^10.0.0" }) }))).toEqual(["nestjs"]);
  });

  it("detects vue3 via vue in devDependencies", () => {
    expect(ids(setup({ "package.json": pkg({}, { vue: "^3.0.0" }) }))).toEqual(["vue3"]);
  });

  it("detects express via express dependency", () => {
    expect(ids(setup({ "package.json": pkg({ express: "^4.0.0" }) }))).toEqual(["express"]);
  });

  it("detects fastapi when requirements mention fastapi", () => {
    expect(ids(setup({ "requirements.txt": "fastapi\nuvicorn\n" }))).toEqual(["fastapi"]);
  });

  it("detects plain python when no fastapi is mentioned", () => {
    expect(ids(setup({ "requirements.txt": "requests\n" }))).toEqual(["python"]);
  });

  it("detects fastapi from pyproject.toml", () => {
    expect(ids(setup({ "pyproject.toml": '[project]\ndependencies = ["fastapi"]\n' }))).toEqual(["fastapi"]);
  });

  it("detects multiple stacks in a monorepo (go + react)", () => {
    const got = ids(setup({ "go.mod": "module x\n", "package.json": pkg({ react: "^18.0.0" }) }));
    expect(got).toContain("go");
    expect(got).toContain("react");
  });

  it("returns [] for an empty dir", () => {
    expect(ids(setup({}))).toEqual([]);
  });

  it("ignores an unparsable package.json", () => {
    expect(ids(setup({ "package.json": "{ not json" }))).toEqual([]);
  });

  it("records human-readable evidence", () => {
    const signals = detectProjectPresets(setup({ "go.mod": "module x\n" }));
    expect(signals[0]).toEqual({ id: "go", evidence: "go.mod" });
  });
});
