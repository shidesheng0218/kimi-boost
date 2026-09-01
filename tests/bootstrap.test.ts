import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { generateBootstrap } from "../src/commands/bootstrap.js";
import { installProjectPreset } from "../src/core/project.js";

let tmp: string;

beforeAll(() => {
  tmp = mkdtempSync(join(tmpdir(), "kimi-boost-bootstrap-"));
  mkdirSync(join(tmp, ".git"));
});

afterAll(() => {
  rmSync(tmp, { recursive: true, force: true });
});

describe("generateBootstrap", () => {
  it("generates setup.sh with CLI detection and no install lines when no presets installed", () => {
    const result = generateBootstrap({ cwd: tmp });
    expect(result.mode).toBe("setup.sh");
    expect(result.presetIds).toEqual([]);
    const content = readFileSync(result.path, "utf8");
    expect(content).toContain("command -v kimi");
    expect(content).toContain("未检测到项目级预设记录");
    // chmod 的执行位在 Windows 上没有 POSIX 语义,跳过该断言
    if (process.platform !== "win32") {
      expect(statSync(result.path).mode & 0o111).not.toBe(0);
    }
  });

  it("includes an install line per project-installed preset", async () => {
    await installProjectPreset("vue3", { root: tmp });
    const result = generateBootstrap({ cwd: tmp });
    expect(result.presetIds).toContain("vue3");
    const content = readFileSync(result.path, "utf8");
    expect(content).toContain("npx kimi-boost install vue3 --project");
  });

  it("appends a setup target to an existing Makefile without touching its content", () => {
    const makefilePath = join(tmp, "Makefile");
    writeFileSync(makefilePath, "build:\n\techo building\n");

    const result = generateBootstrap({ cwd: tmp, makefile: true });
    expect(result.mode).toBe("makefile");
    const content = readFileSync(makefilePath, "utf8");
    expect(content).toContain("build:");
    expect(content).toContain("echo building");
    expect(content).toContain("setup:");
    expect(content).toContain("npx kimi-boost install vue3 --project");
  });

  it("re-running bootstrap in makefile mode does not duplicate the setup target", () => {
    generateBootstrap({ cwd: tmp, makefile: true });
    generateBootstrap({ cwd: tmp, makefile: true });
    const content = readFileSync(join(tmp, "Makefile"), "utf8");
    const occurrences = content.split("setup:").length - 1;
    expect(occurrences).toBe(1);
    expect(content).toContain("build:");
  });

  it("auto-detects an existing Makefile without --makefile flag", () => {
    const tmp2 = mkdtempSync(join(tmpdir(), "kimi-boost-bootstrap2-"));
    try {
      mkdirSync(join(tmp2, ".git"));
      writeFileSync(join(tmp2, "Makefile"), "test:\n\techo test\n");
      const result = generateBootstrap({ cwd: tmp2 });
      expect(result.mode).toBe("makefile");
      expect(existsSync(join(tmp2, "setup.sh"))).toBe(false);
    } finally {
      rmSync(tmp2, { recursive: true, force: true });
    }
  });
});
