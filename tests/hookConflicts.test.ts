import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

/** doctor 的跨预设 hook 重复/分叉检测 */
let tmp: string;
let kimiHome: string;
let boostHome: string;

const GUARD_A = 'process.stdin.on("end", () => process.exit(0));\n';
const GUARD_B = 'process.stdin.on("end", () => process.exit(0)); // different\n';

function writeHook(id: string, file: string, content: string): string {
  const dir = join(boostHome, "hooks", id);
  mkdirSync(dir, { recursive: true });
  const p = join(dir, file);
  writeFileSync(p, content, "utf8");
  return p;
}

function writeConfig(hooks: Array<{ scriptPath: string; timeout?: number }>): void {
  // Windows 路径含反斜杠,写进 TOML 字符串必须转义
  const managed = hooks
    .map(
      (h) =>
        `[[hooks]]\nevent = "PreToolUse"\nmatcher = "Bash"\ncommand = "node \\"${h.scriptPath.replace(/\\/g, "\\\\")}\\""\ntimeout = 5\n`,
    )
    .join("\n");
  writeFileSync(
    join(kimiHome, "config.toml"),
    `# user config\ndefault_model = "k3"\n\n# >>> kimi-boost managed >>>\n${managed}\n# <<< kimi-boost managed <<<\n`,
    "utf8",
  );
}

beforeAll(() => {
  tmp = mkdtempSync(join(tmpdir(), "kimi-boost-conflict-"));
  kimiHome = join(tmp, ".kimi-code");
  boostHome = join(tmp, "kboost");
  mkdirSync(kimiHome, { recursive: true });
  process.env.KIMI_CODE_HOME = kimiHome;
  process.env.KIMI_BOOST_HOME = boostHome;
});

afterAll(() => {
  delete process.env.KIMI_CODE_HOME;
  delete process.env.KIMI_BOOST_HOME;
  rmSync(tmp, { recursive: true, force: true });
});

describe("doctor hook conflict detection", () => {
  it("warns when two presets installed identical hook content", async () => {
    const { runDoctor } = await import("../src/commands/doctor.js");
    const a = writeHook("dupa", "protect.mjs", GUARD_A);
    const b = writeHook("dupb", "protect.mjs", GUARD_A);
    writeConfig([{ scriptPath: a }, { scriptPath: b }]);

    const issues = runDoctor(false);
    const dup = issues.find((i) => i.item.includes("duplicate hook content"));
    expect(dup).toBeDefined();
    expect(dup!.item).toContain("dupa, dupb");
    expect(dup!.level).toBe("warn");
  });

  it("warns when same-name scripts diverge in content", async () => {
    const { runDoctor } = await import("../src/commands/doctor.js");
    const a = writeHook("diva", "protect.mjs", GUARD_A);
    const b = writeHook("divb", "protect.mjs", GUARD_B);
    writeConfig([{ scriptPath: a }, { scriptPath: b }]);

    const issues = runDoctor(false);
    const div = issues.find((i) => i.item.includes("diverging copies of protect.mjs"));
    expect(div).toBeDefined();
    expect(div!.item).toContain("diva, divb");
  });

  it("no conflict warnings for a single preset's hooks", async () => {
    const { runDoctor } = await import("../src/commands/doctor.js");
    const a = writeHook("solo", "protect.mjs", GUARD_A);
    writeConfig([{ scriptPath: a }]);

    const issues = runDoctor(false);
    expect(issues.some((i) => i.item.includes("duplicate hook content"))).toBe(false);
    expect(issues.some((i) => i.item.includes("diverging copies"))).toBe(false);
  });
});
