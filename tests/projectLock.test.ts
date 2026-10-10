import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  describeProjectInstall,
  formatPresetSurface,
  hashPresetDir,
  installProjectPreset,
  missingLockFields,
  verifyProjectInstall,
} from "../src/core/project.js";
import { getPreset, presetSourceDir } from "../src/registry/presets.js";
import { runProjectDoctor } from "../src/commands/doctorProject.js";

let tmp: string;

beforeEach(() => {
  tmp = mkdtempSync(join(tmpdir(), "kimi-boost-lock-"));
  mkdirSync(join(tmp, ".git"));
});

afterEach(() => {
  rmSync(tmp, { recursive: true, force: true });
});

describe("preset content hash", () => {
  it("is stable across path separator noise and ignores dotfiles", () => {
    const dir = presetSourceDir("vue3");
    const a = hashPresetDir(dir);
    const b = hashPresetDir(dir);
    expect(a).toBe(b);
    expect(a).toMatch(/^[a-f0-9]{64}$/);

    const noise = join(dir, ".DS_Store");
    writeFileSync(noise, "noise");
    try {
      expect(hashPresetDir(dir)).toBe(a);
    } finally {
      rmSync(noise, { force: true });
    }
  });
});

describe("project lock", () => {
  it("records version, source, hashes, targets and an explicit codex skip", async () => {
    await installProjectPreset("vue3", { root: tmp });
    const manifest = JSON.parse(readFileSync(join(tmp, ".kimi-boost/installed.json"), "utf8"));
    const rec = manifest.presets.vue3;
    expect(missingLockFields(rec)).toEqual([]);
    expect(rec.version).toBe("1.0.1");
    expect(rec.source).toBe("builtin");
    expect(rec.contentHash).toBe(hashPresetDir(presetSourceDir("vue3")));
    expect(rec.installedHash).toMatch(/^[a-f0-9]{64}$/);
    expect(rec.targets).toEqual(["kimi", "claude"]);
    expect(rec.components).toEqual(expect.arrayContaining(["skills", "agents", "hooks"]));
    expect(rec.skipped).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ capability: "codex", reason: expect.stringContaining("Codex") }),
        expect.objectContaining({ capability: "kimi:hooks" }),
      ]),
    );
  });

  it("dry-run prints the plan and writes nothing", async () => {
    const lines: string[] = [];
    const log = vi.spyOn(console, "log").mockImplementation((...args: unknown[]) => {
      lines.push(args.map(String).join(" "));
    });
    try {
      await installProjectPreset("vue3", { root: tmp, dryRun: true });
    } finally {
      log.mockRestore();
    }
    const text = lines.join("\n");
    expect(text).toContain("network: none");
    expect(text).toContain("skipped:");
    expect(text).toContain("codex:");
    expect(text).toContain("dry-run");
    expect(existsSync(join(tmp, ".kimi-boost/installed.json"))).toBe(false);
    expect(existsSync(join(tmp, ".agents"))).toBe(false);
  });

  it("verify flags a user edit and does not delete it", async () => {
    await installProjectPreset("vue3", { root: tmp });
    const edited = join(tmp, ".agents/skills/vue3-best-practices/SKILL.md");
    const before = readFileSync(edited, "utf8");
    writeFileSync(edited, before + "\n# local note\n");

    const { issues } = verifyProjectInstall(tmp);
    expect(issues.some((i) => i.code === "modified" && i.level === "error")).toBe(true);
    expect(readFileSync(edited, "utf8")).toContain("# local note");
  });

  it("doctor warns on a legacy manifest instead of crashing", () => {
    const manifestPath = join(tmp, ".kimi-boost/installed.json");
    mkdirSync(join(tmp, ".kimi-boost"), { recursive: true });
    writeFileSync(manifestPath, JSON.stringify({ presets: { vue3: [".agents/skills/vue3-best-practices/SKILL.md"] } }) + "\n");
    const issues = runProjectDoctor(false, tmp);
    expect(issues.some((i) => i.level === "warn" && i.item.includes("not reproducible"))).toBe(true);
    expect(issues.some((i) => i.level === "error" && i.item.includes("file missing"))).toBe(true);
  });
});

describe("inspect surface", () => {
  it("lists hooks, deny, mcp and skipped hosts without writing", () => {
    const core = getPreset("core");
    expect(core).toBeDefined();
    const surface = describeProjectInstall(core!, presetSourceDir("core"), "builtin");
    const text = formatPresetSurface(surface);
    expect(text).toContain("network: none (builtin, no download)");
    expect(text).toContain("hooks (will install, claude only");
    expect(text).toContain("injection-scan.mjs");
    expect(text).toContain("deny:");
    expect(text).toContain("not written by --project");
    expect(surface.skipped.some((s) => s.capability === "codex")).toBe(true);
    expect(surface.skipped.some((s) => s.capability === "claude:deny")).toBe(true);
    expect(surface.network).toBe("none");

    const mcp = getPreset("mcp-tools")!;
    const mcpSurface = describeProjectInstall(mcp, presetSourceDir("mcp-tools"), "github:acme/mcp-tools@v1");
    expect(mcpSurface.network).toBe("github");
    expect(mcpSurface.mcpServers).toEqual(expect.arrayContaining(["fetch", "time"]));
    expect(mcpSurface.skipped.some((s) => s.capability === "kimi:mcp")).toBe(true);
    expect(formatPresetSurface(mcpSurface)).toContain("github:acme/mcp-tools@v1");
  });
});
