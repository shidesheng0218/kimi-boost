import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, rmSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

let tmp: string;

beforeAll(() => {
  tmp = mkdtempSync(join(tmpdir(), "kimi-boost-usage-"));
  process.env.KIMI_BOOST_HOME = join(tmp, "kboost");
});

afterAll(() => {
  delete process.env.KIMI_BOOST_HOME;
  rmSync(tmp, { recursive: true, force: true });
});

function feedEvent(event: string, extra = ""): void {
  const payload = JSON.stringify({ hook_event_name: event, ...(extra ? JSON.parse(extra) : {}) });
  execFileSync(process.execPath, [join(process.cwd(), "presets", "usage", "hooks", "usage-track.mjs")], {
    input: payload,
    encoding: "utf8",
  });
}

describe("usage tracking", () => {
  it("counts sessions, prompts and tool calls per day", () => {
    feedEvent("SessionStart");
    feedEvent("UserPromptSubmit");
    feedEvent("PreToolUse");

    const file = join(tmp, "kboost", "usage.json");
    expect(existsSync(file)).toBe(true);
    const data = JSON.parse(readFileSync(file, "utf8"));
    const day = new Date().toISOString().slice(0, 10);
    expect(data.days[day].sessions).toBe(1);
    expect(data.days[day].prompts).toBe(1);
    expect(data.days[day].toolCalls).toBe(1);
  });

  it("summarize() produces N rows including today", () => {
    const { summarize } = require("../src/core/usage.js") as typeof import("../src/core/usage.js");
    const rows = summarize(7);
    expect(rows).toHaveLength(7);
    expect(rows[6].day).toBe(new Date().toISOString().slice(0, 10));
    expect(rows[6].prompts).toBe(1);
  });
});
