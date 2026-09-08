import { mkdtempSync, mkdirSync, rmSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as tar from "tar";
import { installPreset } from "../src/commands/install.js";

vi.mock("../src/commands/install.js", () => ({
  installPreset: vi.fn(async (id: string) => [{ tool: "kimi", presetId: id, ok: true, message: "ok", changed: [] }]),
}));

let tmp: string;

beforeEach(() => {
  tmp = mkdtempSync(join(tmpdir(), "kboost-dev-"));
  process.env.KIMI_BOOST_HOME = join(tmp, "kboost");
});

afterEach(() => {
  delete process.env.KIMI_BOOST_HOME;
  rmSync(tmp, { recursive: true, force: true });
  vi.clearAllMocks();
});

/** 造一个最小合法 preset 目录 */
function makePreset(id: string, overrides: Record<string, unknown> = {}): string {
  const dir = join(tmp, id);
  mkdirSync(join(dir, "skills", `${id}-best-practices`), { recursive: true });
  writeFileSync(join(dir, "skills", `${id}-best-practices`, "SKILL.md"), "# x", "utf8");
  writeFileSync(
    join(dir, "preset.json"),
    JSON.stringify({ id, name: id, description: "d", tags: [], version: "1.0.0", hooks: [], ...overrides }),
    "utf8",
  );
  return dir;
}

describe("validatePresetDir", () => {
  it("accepts a minimal valid preset", async () => {
    const { validatePresetDir } = await import("../src/core/presetValidation.js");
    const issues = validatePresetDir(makePreset("okpreset"));
    expect(issues).toEqual([{ level: "ok", message: "preset is valid" }]);
  });

  it("reports missing preset.json", async () => {
    const { validatePresetDir } = await import("../src/core/presetValidation.js");
    const dir = join(tmp, "empty");
    mkdirSync(dir, { recursive: true });
    expect(validatePresetDir(dir).some((i) => i.message.includes("missing preset.json"))).toBe(true);
  });

  it("reports id mismatch with directory name", async () => {
    const { validatePresetDir } = await import("../src/core/presetValidation.js");
    const dir = makePreset("wrongname");
    // makePreset 用 id=wrongname 作为目录名,这里改成不一致的 id
    writeFileSync(join(dir, "preset.json"), JSON.stringify({ id: "other", name: "x", description: "d", tags: [], version: "1.0.0", hooks: [] }), "utf8");
    expect(validatePresetDir(dir).some((i) => i.message.includes("must match directory name"))).toBe(true);
  });

  it("reports invalid hook event and missing hook script", async () => {
    const { validatePresetDir } = await import("../src/core/presetValidation.js");
    const dir = makePreset("badhook", {
      hooks: [
        { event: "NotAnEvent", script: "guard.mjs" },
        { event: "PreToolUse", script: "missing.mjs" },
      ],
    });
    const messages = validatePresetDir(dir).map((i) => i.message).join("\n");
    expect(messages).toContain("invalid hook event");
    expect(messages).toContain("hook script not found");
  });

  it("reports skills dir without SKILL.md", async () => {
    const { validatePresetDir } = await import("../src/core/presetValidation.js");
    const dir = join(tmp, "noskill");
    mkdirSync(join(dir, "skills", "x"), { recursive: true });
    writeFileSync(join(dir, "skills", "x", "README.md"), "not a skill", "utf8");
    writeFileSync(join(dir, "preset.json"), JSON.stringify({ id: "noskill", name: "x", description: "d", tags: [], version: "1.0.0", hooks: [] }), "utf8");
    expect(validatePresetDir(dir).some((i) => i.message.includes("no SKILL.md"))).toBe(true);
  });

  it("reports kimi.plugin.json name mismatch", async () => {
    const { validatePresetDir } = await import("../src/core/presetValidation.js");
    const dir = makePreset("pluginbad");
    writeFileSync(join(dir, "kimi.plugin.json"), JSON.stringify({ name: "different" }), "utf8");
    expect(validatePresetDir(dir).some((i) => i.message.includes("kimi.plugin.json name must be"))).toBe(true);
  });
});

describe("runDev", () => {
  it("validates then previews install via installPreset(sourceDir, dryRun)", async () => {
    const { runDev } = await import("../src/commands/devtools.js");
    await runDev(makePreset("devpreset"));
    const call = vi.mocked(installPreset).mock.calls[0];
    expect(call[0]).toBe("devpreset");
    const opts = call[1] as { sourceDir: string; dryRun: boolean };
    expect(opts.dryRun).toBe(true);
    expect(opts.sourceDir).toContain("devpreset");
  });

  it("blocks on invalid preset without calling install", async () => {
    const { runDev } = await import("../src/commands/devtools.js");
    const dir = join(tmp, "broken");
    mkdirSync(dir, { recursive: true });
    await expect(runDev(dir)).rejects.toThrow("校验未通过");
    expect(installPreset).not.toHaveBeenCalled();
  });
});

describe("runPackage", () => {
  it("packs a valid preset into <id>-<version>.zip containing preset.json", async () => {
    const { runPackage } = await import("../src/commands/devtools.js");
    const dir = makePreset("packme");
    const out = join(tmp, "out.zip");
    await runPackage(dir, { out });
    expect(existsSync(out)).toBe(true);
    // 解开验证内容
    const extract = join(tmp, "extract");
    mkdirSync(extract, { recursive: true });
    await tar.x({ file: out, cwd: extract });
    expect(existsSync(join(extract, "packme", "preset.json"))).toBe(true);
    expect(existsSync(join(extract, "packme", "skills", "packme-best-practices", "SKILL.md"))).toBe(true);
  });

  it("refuses to pack an invalid preset", async () => {
    const { runPackage } = await import("../src/commands/devtools.js");
    const dir = join(tmp, "alsokaput");
    mkdirSync(dir, { recursive: true });
    await expect(runPackage(dir, { out: join(tmp, "nope.zip") })).rejects.toThrow("校验未通过");
    expect(existsSync(join(tmp, "nope.zip"))).toBe(false);
  });
});
