import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

let tmp: string;
let codexHome: string;

beforeAll(() => {
  tmp = mkdtempSync(join(tmpdir(), "kimi-boost-codex-"));
  codexHome = join(tmp, ".codex");
  process.env.CODEX_HOME = codexHome;
  process.env.KIMI_BOOST_HOME = join(tmp, "kboost");
  process.env.KIMI_CODE_HOME = join(tmp, ".kimi-code");
});

afterAll(() => {
  delete process.env.CODEX_HOME;
  delete process.env.KIMI_BOOST_HOME;
  delete process.env.KIMI_CODE_HOME;
  rmSync(tmp, { recursive: true, force: true });
});

describe("codex adapter", () => {
  it("installs skills and hooks into ~/.codex", async () => {
    const { codexAdapter } = await import("../src/adapters/codex.js");
    const { getPreset, presetSourceDir } = await import("../src/registry/presets.js");

    const preset = getPreset("python")!;
    const report = await codexAdapter.activate({
      tool: "codex",
      preset,
      sourceDir: presetSourceDir("python"),
      installDir: join(tmp, "preset"),
    });

    expect(report.ok).toBe(true);
    expect(existsSync(join(codexHome, "skills", "python", "python-best-practices", "SKILL.md"))).toBe(true);

    const config = readFileSync(join(codexHome, "config.toml"), "utf8");
    expect(config).toContain("[[hooks.PreToolUse]]");
    expect(config).toContain("matcher = \"^Bash$\"");
    expect(config).toContain("type = \"command\"");
    expect(config).toContain("block-dangerous.mjs");
  });

  it("is idempotent on re-activation", async () => {
    const { codexAdapter } = await import("../src/adapters/codex.js");
    const { getPreset, presetSourceDir } = await import("../src/registry/presets.js");

    const preset = getPreset("python")!;
    const report = await codexAdapter.activate({
      tool: "codex",
      preset,
      sourceDir: presetSourceDir("python"),
      installDir: join(tmp, "preset"),
    });
    const config = readFileSync(join(codexHome, "config.toml"), "utf8");
    expect(config.match(/block-dangerous\.mjs/g)).toHaveLength(1);
    expect(report.ok).toBe(true);
  });

  it("deactivates cleanly", async () => {
    const { codexAdapter } = await import("../src/adapters/codex.js");
    const report = await codexAdapter.deactivate("python");
    expect(report.ok).toBe(true);
    expect(existsSync(join(codexHome, "skills", "python"))).toBe(false);
    const config = readFileSync(join(codexHome, "config.toml"), "utf8");
    expect(config).not.toContain("block-dangerous.mjs");
  });

  it("blocks path traversal in preset ids", async () => {
    const { codexAdapter } = await import("../src/adapters/codex.js");
    await expect(codexAdapter.deactivate("../../etc/passwd")).rejects.toThrow();
  });
});
