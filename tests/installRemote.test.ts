import { mkdtempSync, rmSync, mkdirSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as tar from "tar";
import prompts from "prompts";
import { installPreset } from "../src/commands/install.js";
import { getPreset } from "../src/registry/presets.js";

vi.mock("tar", () => ({ x: vi.fn(async () => undefined) }));
vi.mock("prompts", () => ({ default: vi.fn() }));
vi.mock("../src/commands/install.js", () => ({
  installPreset: vi.fn(async (id: string) => [{ tool: "kimi", presetId: id, ok: true, message: "installed", changed: [] }]),
}));
vi.mock("../src/registry/presets.js", () => ({
  getPreset: vi.fn(() => undefined),
}));

let tmp: string;

beforeEach(() => {
  tmp = mkdtempSync(join(tmpdir(), "kboost-remote-"));
  process.env.KIMI_BOOST_HOME = join(tmp, "kboost");
});

afterEach(() => {
  delete process.env.KIMI_BOOST_HOME;
  rmSync(tmp, { recursive: true, force: true });
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

/** 模拟 GitHub tarball:codeload 返回假包,tar.x 把单 preset 仓库内容播种到 ${cwd}/repo-main/ */
function stubRemoteRepo(preset: Record<string, unknown> | undefined): void {
  vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, arrayBuffer: async () => new ArrayBuffer(0) })));
  vi.mocked(tar.x).mockImplementation(async (opts: unknown) => {
    const cwd = (opts as { cwd: string }).cwd;
    const dir = join(cwd, "repo-main");
    mkdirSync(dir, { recursive: true });
    if (preset) {
      writeFileSync(join(dir, "preset.json"), JSON.stringify(preset), "utf8");
    }
  });
}

describe("parseRemoteSpec", () => {
  it("parses github:owner/repo", async () => {
    const { parseRemoteSpec } = await import("../src/commands/installRemote.js");
    expect(parseRemoteSpec("github:foo/bar")).toEqual({ owner: "foo", repo: "bar", ref: "main" });
  });

  it("parses github:owner/repo@ref", async () => {
    const { parseRemoteSpec } = await import("../src/commands/installRemote.js");
    expect(parseRemoteSpec("github:foo/bar@v1.2.0")).toEqual({ owner: "foo", repo: "bar", ref: "v1.2.0" });
  });

  it("parses https URLs with optional .git and /tree/<ref>", async () => {
    const { parseRemoteSpec } = await import("../src/commands/installRemote.js");
    expect(parseRemoteSpec("https://github.com/foo/bar")).toEqual({ owner: "foo", repo: "bar", ref: "main" });
    expect(parseRemoteSpec("https://github.com/foo/bar.git")).toEqual({ owner: "foo", repo: "bar", ref: "main" });
    expect(parseRemoteSpec("https://github.com/foo/bar/tree/dev")).toEqual({ owner: "foo", repo: "bar", ref: "dev" });
  });

  it("returns undefined for plain preset ids and non-GitHub input", async () => {
    const { parseRemoteSpec } = await import("../src/commands/installRemote.js");
    expect(parseRemoteSpec("go")).toBeUndefined();
    expect(parseRemoteSpec("https://gitlab.com/foo/bar")).toBeUndefined();
  });
});

describe("installRemotePreset", () => {
  const presetDef = {
    id: "cool",
    name: "Cool Preset",
    description: "test",
    version: "1.2.0",
    hooks: [{ event: "PreToolUse", matcher: "Bash", script: "guard.mjs", timeout: 5 }],
  };

  it("installs after confirmation and records the source marker", async () => {
    stubRemoteRepo(presetDef);
    vi.mocked(prompts).mockResolvedValue({ ok: true });
    const { installRemotePreset } = await import("../src/commands/installRemote.js");
    const reports = await installRemotePreset({ owner: "foo", repo: "bar", ref: "main" });
    expect(reports).toBeDefined();
    expect(reports![0].ok).toBe(true);

    // installPreset 收到解包目录 sourceDir
    const call = vi.mocked(installPreset).mock.calls[0];
    expect(call[0]).toBe("cool");
    expect((call[1] as { sourceDir: string }).sourceDir).toContain(join("repo-main"));

    // 来源标记写入 sources.json
    const sources = JSON.parse(readFileSync(join(tmp, "kboost", "sources.json"), "utf8"));
    expect(sources.cool).toEqual({ repo: "foo/bar", ref: "main" });
  });

  it("cancels when the user declines the confirmation", async () => {
    stubRemoteRepo(presetDef);
    vi.mocked(prompts).mockResolvedValue({ ok: false });
    const { installRemotePreset } = await import("../src/commands/installRemote.js");
    const reports = await installRemotePreset({ owner: "foo", repo: "bar", ref: "main" });
    expect(reports).toBeUndefined();
    expect(installPreset).not.toHaveBeenCalled();
    expect(existsSync(join(tmp, "kboost", "sources.json"))).toBe(false);
  });

  it("skips confirmation with --yes", async () => {
    stubRemoteRepo(presetDef);
    const { installRemotePreset } = await import("../src/commands/installRemote.js");
    await installRemotePreset({ owner: "foo", repo: "bar", ref: "main" }, { yes: true });
    expect(prompts).not.toHaveBeenCalled();
    expect(installPreset).toHaveBeenCalledTimes(1);
  });

  it("does not write the source marker in dry-run", async () => {
    stubRemoteRepo(presetDef);
    const { installRemotePreset } = await import("../src/commands/installRemote.js");
    await installRemotePreset({ owner: "foo", repo: "bar", ref: "main" }, { dryRun: true });
    expect(existsSync(join(tmp, "kboost", "sources.json"))).toBe(false);
  });

  it("warns when the preset id collides with the official registry", async () => {
    stubRemoteRepo(presetDef);
    vi.mocked(getPreset).mockReturnValue({ id: "cool", name: "official", description: "", tags: [], hooks: [] });
    vi.mocked(prompts).mockResolvedValue({ ok: true });
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { installRemotePreset } = await import("../src/commands/installRemote.js");
    await installRemotePreset({ owner: "foo", repo: "bar", ref: "main" });
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("同名"));
    warn.mockRestore();
  });

  it("throws when the repo has no preset.json at root", async () => {
    stubRemoteRepo(undefined);
    const { installRemotePreset } = await import("../src/commands/installRemote.js");
    await expect(installRemotePreset({ owner: "foo", repo: "bar", ref: "main" }, { yes: true })).rejects.toThrow("preset.json");
  });

  it("cleans up the temp dir even on success", async () => {
    stubRemoteRepo(presetDef);
    const { installRemotePreset } = await import("../src/commands/installRemote.js");
    await installRemotePreset({ owner: "foo", repo: "bar", ref: "main" }, { yes: true });
    const sourceDir = (vi.mocked(installPreset).mock.calls[0][1] as { sourceDir: string }).sourceDir;
    // sourceDir = <临时根>/repo-main,临时根应在 finally 中被清理
    expect(existsSync(dirname(sourceDir))).toBe(false);
  });
});
