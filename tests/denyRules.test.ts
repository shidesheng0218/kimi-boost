import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { mkdtempSync, readFileSync, rmSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

let tmp: string;
let claudeHome: string;

beforeAll(() => {
  tmp = mkdtempSync(join(tmpdir(), "kimi-boost-deny-"));
  claudeHome = join(tmp, ".claude");
  mkdirSync(claudeHome, { recursive: true });
  process.env.CLAUDE_CODE_HOME = claudeHome;
  process.env.KIMI_BOOST_HOME = join(tmp, "kboost");
  process.env.KIMI_CODE_HOME = join(tmp, ".kimi-code");
});

afterAll(() => {
  delete process.env.CLAUDE_CODE_HOME;
  delete process.env.KIMI_BOOST_HOME;
  delete process.env.KIMI_CODE_HOME;
  rmSync(tmp, { recursive: true, force: true });
});

function readDeny(): string[] {
  const s = JSON.parse(readFileSync(join(claudeHome, "settings.json"), "utf8"));
  return s.permissions?.deny ?? [];
}

describe("claude 原生 deny 规则", () => {
  it("安装 core 时把 denyRules 写进 permissions.deny,并保留用户已有规则", async () => {
    // 用户已有自己的 deny 规则
    writeFileSync(
      join(claudeHome, "settings.json"),
      JSON.stringify({ permissions: { deny: ["Read(**/my-custom/**)"] } }),
      "utf8",
    );
    const { claudeAdapter } = await import("../src/adapters/claude.js");
    const { getPreset, presetSourceDir } = await import("../src/registry/presets.js");
    const preset = getPreset("core")!;
    await claudeAdapter.activate({ tool: "claude", preset, sourceDir: presetSourceDir("core"), installDir: join(tmp, "preset") });

    const deny = readDeny();
    expect(deny).toContain("Read(~/.ssh/**)");
    expect(deny).toContain("Bash(rm -rf *)");
    expect(deny).toContain("Edit(~/.claude/settings.json)");
    // 用户自己的规则被保留
    expect(deny).toContain("Read(**/my-custom/**)");
  });

  it("重复安装不产生重复 deny 规则(幂等)", async () => {
    const { claudeAdapter } = await import("../src/adapters/claude.js");
    const { getPreset, presetSourceDir } = await import("../src/registry/presets.js");
    const preset = getPreset("core")!;
    await claudeAdapter.activate({ tool: "claude", preset, sourceDir: presetSourceDir("core"), installDir: join(tmp, "preset") });
    const deny = readDeny();
    const count = deny.filter((r) => r === "Bash(rm -rf *)").length;
    expect(count).toBe(1);
  });

  it("卸载时精准移除我们加的规则,用户自己的保留", async () => {
    const { claudeAdapter } = await import("../src/adapters/claude.js");
    await claudeAdapter.deactivate("core");
    const deny = readDeny();
    expect(deny).not.toContain("Bash(rm -rf *)");
    expect(deny).not.toContain("Read(~/.ssh/**)");
    expect(deny).toContain("Read(**/my-custom/**)"); // 用户的规则还在
  });

  it("denyRules 记录进了安装 manifest(供精准移除)", async () => {
    // 重新安装一次,确认 manifest 里有 denyRules
    const { claudeAdapter } = await import("../src/adapters/claude.js");
    const { getPreset, presetSourceDir } = await import("../src/registry/presets.js");
    const preset = getPreset("core")!;
    await claudeAdapter.activate({ tool: "claude", preset, sourceDir: presetSourceDir("core"), installDir: join(tmp, "preset") });
    const { readManifest } = await import("../src/core/manifest.js");
    const rec = readManifest().presets["core"]?.["claude"];
    expect(rec && !Array.isArray(rec) ? rec.denyRules : undefined).toBeDefined();
    expect((rec as { denyRules?: string[] }).denyRules).toContain("Bash(sudo *)");
  });
});
