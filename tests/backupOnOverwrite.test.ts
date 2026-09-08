import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

let tmp: string;
let claudeHome: string;
let codexHome: string;

beforeAll(() => {
  tmp = mkdtempSync(join(tmpdir(), "kimi-boost-backup-"));
  claudeHome = join(tmp, ".claude");
  codexHome = join(tmp, ".codex");
  process.env.CLAUDE_CODE_HOME = claudeHome;
  process.env.CODEX_HOME = codexHome;
  process.env.KIMI_BOOST_HOME = join(tmp, "kboost");
  process.env.KIMI_CODE_HOME = join(tmp, ".kimi-code");
});

afterAll(() => {
  delete process.env.CLAUDE_CODE_HOME;
  delete process.env.CODEX_HOME;
  delete process.env.KIMI_BOOST_HOME;
  delete process.env.KIMI_CODE_HOME;
  rmSync(tmp, { recursive: true, force: true });
});

async function activateClaude(presetId: string) {
  const { claudeAdapter } = await import("../src/adapters/claude.js");
  const { getPreset, presetSourceDir } = await import("../src/registry/presets.js");
  const preset = getPreset(presetId)!;
  return claudeAdapter.activate({
    tool: "claude",
    preset,
    sourceDir: presetSourceDir(presetId),
    installDir: join(tmp, "preset", presetId),
  });
}

async function activateCodex(presetId: string) {
  const { codexAdapter } = await import("../src/adapters/codex.js");
  const { getPreset, presetSourceDir } = await import("../src/registry/presets.js");
  const preset = getPreset(presetId)!;
  return codexAdapter.activate({
    tool: "codex",
    preset,
    sourceDir: presetSourceDir(presetId),
    installDir: join(tmp, "preset", presetId),
  });
}

describe("覆盖/删除用户已有文件前备份", () => {
  it("claude: 覆盖已有 agents 文件前备份为 .kboost.bak,并在报告中说明恢复方式", async () => {
    const agentsDirPath = join(claudeHome, "agents");
    mkdirSync(agentsDirPath, { recursive: true });
    writeFileSync(join(agentsDirPath, "vue3-reviewer.md"), "my-own-reviewer", "utf8");

    const report = await activateClaude("vue3");

    expect(report.ok).toBe(true);
    const bak = join(agentsDirPath, "vue3-reviewer.md.kboost.bak");
    expect(readFileSync(bak, "utf8")).toBe("my-own-reviewer");
    expect(readFileSync(join(agentsDirPath, "vue3-reviewer.md"), "utf8")).not.toBe("my-own-reviewer");
    expect(report.message).toContain("Backed up existing");
    expect(report.message).toContain(bak);
    expect(report.message).toContain("mv");
  });

  it("claude: rm -rf 已有 skills 目录前整体备份为 <dir>.kboost.bak", async () => {
    const skillRoot = join(claudeHome, "skills", "python");
    mkdirSync(skillRoot, { recursive: true });
    writeFileSync(join(skillRoot, "USER-NOTES.md"), "keep me", "utf8");

    const report = await activateClaude("python");

    expect(report.ok).toBe(true);
    expect(readFileSync(join(`${skillRoot}.kboost.bak`, "USER-NOTES.md"), "utf8")).toBe("keep me");
    expect(existsSync(join(skillRoot, "python-best-practices", "SKILL.md"))).toBe(true);
  });

  it("claude: 目标在上次安装记录内时不备份(我们自己的文件直接覆盖)", async () => {
    await activateClaude("go");
    const agentBak = join(claudeHome, "agents", "go-reviewer.md.kboost.bak");
    const skillBak = `${join(claudeHome, "skills", "go")}.kboost.bak`;
    // 首次安装无预置用户文件,不产生备份
    expect(existsSync(skillBak)).toBe(false);

    // 再次安装:agents/skills 已在 manifest 记录内,仍不备份
    const report = await activateClaude("go");
    expect(report.ok).toBe(true);
    expect(existsSync(skillBak)).toBe(false);
    expect(existsSync(agentBak)).toBe(false);
    expect(report.message).not.toContain("Backed up existing");
  });

  it("codex: rm -rf 已有 skills 目录前整体备份", async () => {
    const skillRoot = join(codexHome, "skills", "rust");
    mkdirSync(skillRoot, { recursive: true });
    writeFileSync(join(skillRoot, "USER-NOTES.md"), "keep me", "utf8");

    const report = await activateCodex("rust");

    expect(report.ok).toBe(true);
    expect(readFileSync(join(`${skillRoot}.kboost.bak`, "USER-NOTES.md"), "utf8")).toBe("keep me");
    expect(existsSync(join(skillRoot, "rust-best-practices", "SKILL.md"))).toBe(true);
    expect(report.message).toContain("Backed up existing");
  });

  it("dry-run: 只报告 would back up,不写备份也不动原文件", async () => {
    const { presetSourceDir } = await import("../src/registry/presets.js");
    const agentFileName = readdirSync(join(presetSourceDir("nextjs"), "agents"))[0];
    const agentsDirPath = join(claudeHome, "agents");
    mkdirSync(agentsDirPath, { recursive: true });
    const agentFile = join(agentsDirPath, agentFileName);
    writeFileSync(agentFile, "my-own-agent", "utf8");

    const { setDryRun } = await import("../src/core/fsguard.js");
    setDryRun(true);
    let message: string;
    try {
      const report = await activateClaude("nextjs");
      message = report.message;
    } finally {
      setDryRun(false);
    }

    expect(message).toContain("would back up");
    expect(existsSync(`${agentFile}.kboost.bak`)).toBe(false);
    expect(readFileSync(agentFile, "utf8")).toBe("my-own-agent");
  });
});
