import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

let tmp: string;
let kimiHome: string;
let boostHome: string;

beforeAll(() => {
  tmp = mkdtempSync(join(tmpdir(), "kimi-boost-doctor-"));
  kimiHome = join(tmp, ".kimi-code");
  boostHome = join(tmp, "kboost");
  mkdirSync(kimiHome, { recursive: true });
  mkdirSync(boostHome, { recursive: true });
  process.env.KIMI_CODE_HOME = kimiHome;
  process.env.KIMI_BOOST_HOME = boostHome;
  process.env.CODEX_HOME = join(tmp, ".codex");
});

afterAll(() => {
  delete process.env.KIMI_CODE_HOME;
  delete process.env.KIMI_BOOST_HOME;
  delete process.env.CODEX_HOME;
  rmSync(tmp, { recursive: true, force: true });
});

describe("doctor", () => {
  it("reports missing hook scripts and missing mounted dirs", async () => {
    writeFileSync(
      join(kimiHome, "config.toml"),
      [
        `extra_skill_dirs = [ "${join(boostHome, "skills")}" ]`,
        "",
        "[[hooks]]",
        `event = "PreToolUse"`,
        `command = "node \\"${join(boostHome, "hooks", "vue3", "protect-main.mjs")}\\""`,
        'matcher = "Bash"',
      ].join("\n"),
      "utf8",
    );

    const { runDoctor } = await import("../src/commands/doctor.js");
    const issues = runDoctor(false);

    expect(issues.some((i) => i.item.includes("hook script missing"))).toBe(true);
    expect(issues.some((i) => i.item.includes("mounted dir") && i.level === "warn")).toBe(true);
  });

  it("--fix restores missing dirs and hook scripts", async () => {
    mkdirSync(join(boostHome, "presets", "vue3", "hooks"), { recursive: true });
    writeFileSync(
      join(boostHome, "presets", "vue3", "hooks", "protect-main.mjs"),
      "console.log('hook')",
      "utf8",
    );

    const { runDoctor } = await import("../src/commands/doctor.js");
    const fixed = runDoctor(true);

    expect(existsSync(join(boostHome, "skills"))).toBe(true);
    expect(existsSync(join(boostHome, "hooks", "vue3", "protect-main.mjs"))).toBe(true);
    expect(fixed.some((i) => i.item.includes("hook script restored"))).toBe(true);
    expect(fixed.some((i) => i.item.includes("mounted dir restored"))).toBe(true);
  });
});
