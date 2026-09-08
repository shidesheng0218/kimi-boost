import { mkdtempSync, rmSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";

let tmp: string;

beforeEach(() => {
  tmp = mkdtempSync(join(tmpdir(), "kboost-tools-"));
  process.env.KIMI_BOOST_HOME = tmp;
});

afterEach(() => {
  delete process.env.KIMI_BOOST_HOME;
  rmSync(tmp, { recursive: true, force: true });
});

const HOOK = join(process.cwd(), "presets", "usage", "hooks", "usage-track.mjs");

function feed(payload: object, args: string[] = []): void {
  execFileSync(process.execPath, [HOOK, ...args], { input: JSON.stringify(payload), encoding: "utf8" });
}

function readData(): { days: Record<string, { toolCalls: number; tools?: Record<string, number> }> } {
  return JSON.parse(readFileSync(join(tmp, "usage.json"), "utf8"));
}

describe("usage-track 分工具计数", () => {
  it("无 --tool 的 PreToolUse 只记总量,不写 tools 字段", () => {
    feed({ hook_event_name: "PreToolUse", tool_input: { command: "ls" } });
    const d = readData().days[new Date().toISOString().slice(0, 10)];
    expect(d.toolCalls).toBe(1);
    expect(d.tools).toBeUndefined();
  });

  it("--tool=edit 只记分工具,不记总量(避免与无 matcher 的注册重复计数)", () => {
    feed({ hook_event_name: "PreToolUse", tool_input: {} }, ["--event=PreToolUse", "--tool=edit"]);
    feed({ hook_event_name: "PreToolUse", tool_input: {} }, ["--event=PreToolUse", "--tool=edit"]);
    const d = readData().days[new Date().toISOString().slice(0, 10)];
    expect(d.toolCalls).toBe(0);
    expect(d.tools).toEqual({ edit: 2 });
  });

  it("工具名大小写归一", () => {
    feed({ hook_event_name: "PreToolUse", tool_input: {} }, ["--tool=Bash"]);
    const d = readData().days[new Date().toISOString().slice(0, 10)];
    expect(d.tools).toEqual({ bash: 1 });
  });

  it("兼容旧格式 usage.json(无 tools 字段),在其上继续累计", () => {
    const day = new Date().toISOString().slice(0, 10);
    writeFileSync(join(tmp, "usage.json"), JSON.stringify({ days: { [day]: { sessions: 1, prompts: 1, toolCalls: 1 } } }));
    feed({ hook_event_name: "PreToolUse", tool_input: {} }, ["--tool=write"]);
    const d = readData().days[day];
    expect(d.toolCalls).toBe(1); // 旧值保留
    expect(d.tools).toEqual({ write: 1 });
  });
});

describe("computeStats.topTools", () => {
  it("聚合窗口内工具计数并降序取前 5", async () => {
    const day = new Date().toISOString().slice(0, 10);
    writeFileSync(
      join(tmp, "usage.json"),
      JSON.stringify({
        days: {
          [day]: {
            sessions: 1,
            prompts: 1,
            toolCalls: 20,
            tools: { bash: 9, edit: 5, write: 3, read: 2, glob: 1, grep: 1 },
          },
        },
      }),
    );
    const { computeStats } = await import("../src/core/stats.js");
    const s = computeStats(7);
    expect(s.topTools).toEqual([
      { tool: "bash", count: 9 },
      { tool: "edit", count: 5 },
      { tool: "write", count: 3 },
      { tool: "read", count: 2 },
      { tool: "glob", count: 1 },
    ]);
  });

  it("无分工具数据时 topTools 为空", async () => {
    const day = new Date().toISOString().slice(0, 10);
    writeFileSync(join(tmp, "usage.json"), JSON.stringify({ days: { [day]: { sessions: 1, prompts: 1, toolCalls: 5 } } }));
    const { computeStats } = await import("../src/core/stats.js");
    expect(computeStats(7).topTools).toEqual([]);
  });
});
