import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parse as parseToml } from "smol-toml";

let tmp: string;
let kimiHome: string;
let claudeHome: string;

function writeHookScript(dir: string, content: string): string {
  mkdirSync(dir, { recursive: true });
  const file = join(dir, "guard.mjs");
  writeFileSync(file, content, "utf8");
  return file;
}

beforeAll(() => {
  tmp = mkdtempSync(join(tmpdir(), "kimi-boost-doctorconflict-"));
  kimiHome = join(tmp, "kimi-code");
  claudeHome = join(tmp, "claude");
  process.env.KIMI_CODE_HOME = kimiHome;
  process.env.CLAUDE_CODE_HOME = claudeHome;
  mkdirSync(kimiHome, { recursive: true });
  mkdirSync(claudeHome, { recursive: true });
});

afterAll(() => {
  delete process.env.KIMI_CODE_HOME;
  delete process.env.CLAUDE_CODE_HOME;
  rmSync(tmp, { recursive: true, force: true });
});

describe("doctor --fix: exact-duplicate hook merge (kimi config.toml)", () => {
  it("keeps one entry and removes the byte-identical duplicate", async () => {
    const scriptA = writeHookScript(join(tmp, "hooks", "vue3"), "console.log('guard')");
    const scriptB = writeHookScript(join(tmp, "hooks", "nextjs"), "console.log('guard')");
    const configPath = join(kimiHome, "config.toml");
    writeFileSync(
      configPath,
      [
        "# >>> kimi-boost managed >>>",
        "[[hooks]]",
        'event = "PreToolUse"',
        `command = "node \\"${scriptA.replace(/\\/g, "\\\\")}\\""`,
        'matcher = "Bash"',
        "",
        "[[hooks]]",
        'event = "PreToolUse"',
        `command = "node \\"${scriptB.replace(/\\/g, "\\\\")}\\""`,
        'matcher = "Bash"',
        "# <<< kimi-boost managed <<<",
        "",
      ].join("\n"),
      "utf8",
    );

    const { runDoctor } = await import("../src/commands/doctor.js");
    let issues = runDoctor(false);
    expect(issues.some((i) => i.level === "warn" && i.item.includes("duplicate hook content"))).toBe(true);

    issues = runDoctor(true);
    expect(issues.some((i) => i.item.includes("merged duplicate hook"))).toBe(true);

    const data = parseToml(readFileSync(configPath, "utf8")) as { hooks?: Array<{ command: string }> };
    expect(data.hooks ?? []).toHaveLength(1);
  });
});

describe("doctor --fix: diverging copies stay diagnose-only", () => {
  it("does not remove either entry when content differs", async () => {
    const scriptA = writeHookScript(join(tmp, "hooks", "go"), "console.log('go-guard')");
    const scriptB = writeHookScript(join(tmp, "hooks", "rust"), "console.log('rust-guard')");
    // rename to same basename so identity (event+matcher+script-name) matches
    const dirA = join(tmp, "hooks", "diverge-a");
    const dirB = join(tmp, "hooks", "diverge-b");
    mkdirSync(dirA, { recursive: true });
    mkdirSync(dirB, { recursive: true });
    writeFileSync(join(dirA, "protect-main.mjs"), "console.log('a')", "utf8");
    writeFileSync(join(dirB, "protect-main.mjs"), "console.log('b')", "utf8");
    void scriptA;
    void scriptB;

    const configPath = join(kimiHome, "config.toml");
    writeFileSync(
      configPath,
      [
        "# >>> kimi-boost managed >>>",
        "[[hooks]]",
        'event = "PreToolUse"',
        `command = "node \\"${join(dirA, "protect-main.mjs").replace(/\\/g, "\\\\")}\\""`,
        'matcher = "Bash"',
        "",
        "[[hooks]]",
        'event = "PreToolUse"',
        `command = "node \\"${join(dirB, "protect-main.mjs").replace(/\\/g, "\\\\")}\\""`,
        'matcher = "Bash"',
        "# <<< kimi-boost managed <<<",
        "",
      ].join("\n"),
      "utf8",
    );

    const { runDoctor } = await import("../src/commands/doctor.js");
    const issues = runDoctor(true);
    expect(issues.some((i) => i.level === "warn" && i.item.includes("diverging copies"))).toBe(true);
    expect(issues.some((i) => i.item.includes("merged duplicate hook"))).toBe(false);

    const data = parseToml(readFileSync(configPath, "utf8")) as { hooks?: Array<{ command: string }> };
    expect(data.hooks ?? []).toHaveLength(2);
  });
});

describe("doctor --fix: exact-duplicate hook merge (claude settings.json)", () => {
  it("keeps one entry and removes the byte-identical duplicate", async () => {
    const scriptA = writeHookScript(join(tmp, "chooks", "vue3"), "console.log('claude-guard')");
    const scriptB = writeHookScript(join(tmp, "chooks", "nextjs"), "console.log('claude-guard')");
    const settingsPath = join(claudeHome, "settings.json");
    writeFileSync(
      settingsPath,
      JSON.stringify({
        hooks: {
          PreToolUse: [
            {
              matcher: "Bash",
              hooks: [
                { type: "command", command: `node "${scriptA}"` },
                { type: "command", command: `node "${scriptB}"` },
              ],
            },
          ],
        },
      }),
      "utf8",
    );

    const { runDoctor } = await import("../src/commands/doctor.js");
    const issues = runDoctor(true);
    expect(issues.some((i) => i.item.includes("merged duplicate hook"))).toBe(true);

    const data = JSON.parse(readFileSync(settingsPath, "utf8")) as {
      hooks: { PreToolUse: Array<{ hooks: Array<{ command: string }> }> };
    };
    expect(data.hooks.PreToolUse[0].hooks).toHaveLength(1);
  });
});
