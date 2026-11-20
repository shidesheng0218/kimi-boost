import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { getPreset, presetSourceDir } from "../src/registry/presets.js";

let tmp: string;
let kimiHome: string;
let claudeHome: string;
let boostHome: string;
let kimiConfig: string;
let claudeSettings: string;

const kimiGuardFixture = join(import.meta.dirname, "fixtures", "coexistence", "kimi-guard-block.toml");
const claudeGuardFixture = join(import.meta.dirname, "fixtures", "coexistence", "claude-agentguard-hooks.json");

beforeAll(() => {
  tmp = mkdtempSync(join(tmpdir(), "kboost-coexist-"));
  kimiHome = join(tmp, "kimi-code");
  claudeHome = join(tmp, "claude");
  boostHome = join(tmp, "kboost");
  kimiConfig = join(kimiHome, "config.toml");
  claudeSettings = join(claudeHome, "settings.json");
  process.env.KIMI_CODE_HOME = kimiHome;
  process.env.KIMI_BOOST_HOME = boostHome;
  process.env.CLAUDE_CODE_HOME = claudeHome;
  process.env.CODEX_HOME = join(tmp, "codex");
  delete process.env.KIMI_CONFIG_PATH;
  delete process.env.CLAUDE_SETTINGS_PATH;
  delete process.env.CODEX_HOOKS_PATH;
});

beforeEach(() => {
  rmSync(kimiHome, { recursive: true, force: true });
  rmSync(claudeHome, { recursive: true, force: true });
  rmSync(boostHome, { recursive: true, force: true });
  mkdirSync(kimiHome, { recursive: true });
  mkdirSync(claudeHome, { recursive: true });
  mkdirSync(boostHome, { recursive: true });
  writeFileSync(kimiConfig, "", "utf8");
  writeFileSync(claudeSettings, "{}", "utf8");
});

async function activate(tool: "kimi" | "claude") {
  const preset = getPreset("core")!;
  if (tool === "kimi") {
    const { kimiAdapter } = await import("../src/adapters/kimi.js");
    await kimiAdapter.activate({
      tool: "kimi",
      preset,
      sourceDir: presetSourceDir("core"),
      installDir: join(tmp, "install", "core"),
    });
    return kimiAdapter;
  }
  const { claudeAdapter } = await import("../src/adapters/claude.js");
  await claudeAdapter.activate({
    tool: "claude",
    preset,
    sourceDir: presetSourceDir("core"),
    installDir: join(tmp, "install", "core"),
  });
  return claudeAdapter;
}

describe("kimi coexists with agentguard", () => {
  it("installing core preserves the agentguard Kimi block byte-for-byte", async () => {
    const original = readFileSync(kimiGuardFixture, "utf8");
    writeFileSync(kimiConfig, original, "utf8");
    await activate("kimi");
    const text = readFileSync(kimiConfig, "utf8");
    expect(text).toContain(original.trim());
    expect(text).toContain("# >>> kimi-boost managed >>>");
  });

  it("removing core preserves the agentguard Kimi block", async () => {
    const original = readFileSync(kimiGuardFixture, "utf8");
    writeFileSync(kimiConfig, original, "utf8");
    const adapter = await activate("kimi");
    await adapter.deactivate("core");
    const text = readFileSync(kimiConfig, "utf8");
    expect(text).toContain(original.trim());
    expect(text).toContain("kguard hook PreToolUse");
  });

  it("installing core preserves agentguard Claude hooks", async () => {
    const original = readFileSync(claudeGuardFixture, "utf8");
    writeFileSync(claudeSettings, original, "utf8");
    await activate("claude");
    const text = readFileSync(claudeSettings, "utf8");
    expect(text).toContain("agentguard hook PreToolUse --harness claude");
  });

  it("removing core preserves agentguard Claude hooks", async () => {
    const original = readFileSync(claudeGuardFixture, "utf8");
    writeFileSync(claudeSettings, original, "utf8");
    const adapter = await activate("claude");
    await adapter.deactivate("core");
    const text = readFileSync(claudeSettings, "utf8");
    expect(text).toContain("agentguard hook PreToolUse --harness claude");
  });
});