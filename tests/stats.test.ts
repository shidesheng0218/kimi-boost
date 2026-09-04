import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { StatsData } from "../src/core/stats.js";
import type { UsageData } from "../src/core/usage.js";

let tmp: string;

beforeEach(() => {
  tmp = mkdtempSync(join(tmpdir(), "kboost-stats-"));
  process.env.KIMI_BOOST_HOME = join(tmp, "kboost");
});

afterEach(() => {
  delete process.env.KIMI_BOOST_HOME;
  rmSync(tmp, { recursive: true, force: true });
});

function dayOffset(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}

function seedUsage(data: UsageData): void {
  const dir = join(tmp, "kboost");
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "usage.json"), JSON.stringify(data), "utf8");
}

function day(sessions: number, prompts: number, toolCalls: number, minutes = 30) {
  const start = new Date();
  const end = new Date(start.getTime() + minutes * 60000);
  return { sessions, prompts, toolCalls, startedAt: start.toISOString(), endedAt: end.toISOString() };
}

describe("computeStats", () => {
  it("computes totals, activeDays, bestDay and averages", async () => {
    seedUsage({
      days: {
        [dayOffset(0)]: day(1, 10, 40),
        [dayOffset(1)]: day(2, 30, 90),
        [dayOffset(3)]: day(1, 5, 10), // dayOffset(2) 无活动
      },
    });
    const { computeStats } = await import("../src/core/stats.js");
    const s = computeStats(7);
    expect(s.totals.prompts).toBe(45);
    expect(s.totals.sessions).toBe(4);
    expect(s.totals.toolCalls).toBe(140);
    expect(s.activeDays).toBe(3);
    expect(s.bestDay).toEqual({ day: dayOffset(1), prompts: 30 });
    expect(s.avgPromptsPerActiveDay).toBe(15);
    expect(s.series).toHaveLength(7);
  });

  it("streak counts consecutive active days including today", async () => {
    seedUsage({
      days: {
        [dayOffset(0)]: day(1, 5, 10),
        [dayOffset(1)]: day(1, 5, 10),
        [dayOffset(2)]: day(1, 5, 10),
        // dayOffset(3) 断开
        [dayOffset(4)]: day(1, 5, 10),
      },
    });
    const { computeStats } = await import("../src/core/stats.js");
    expect(computeStats(7).streak).toBe(3);
  });

  it("streak does not break when today has no activity yet", async () => {
    seedUsage({
      days: {
        [dayOffset(1)]: day(1, 5, 10),
        [dayOffset(2)]: day(1, 5, 10),
        // 今天(0)还没有活动
      },
    });
    const { computeStats } = await import("../src/core/stats.js");
    expect(computeStats(7).streak).toBe(2);
  });

  it("handles empty data", async () => {
    const { computeStats } = await import("../src/core/stats.js");
    const s = computeStats(7);
    expect(s.totals.prompts).toBe(0);
    expect(s.activeDays).toBe(0);
    expect(s.streak).toBe(0);
    expect(s.bestDay).toBeUndefined();
    expect(s.avgPromptsPerActiveDay).toBe(0);
  });
});

describe("renderBarChart", () => {
  it("scales bars to the max and marks today with *", async () => {
    const { renderBarChart } = await import("../src/commands/stats.js");
    const series = [
      { day: dayOffset(1), sessions: 1, prompts: 10, toolCalls: 0, minutes: 0 },
      { day: dayOffset(0), sessions: 1, prompts: 20, toolCalls: 0, minutes: 0 },
    ];
    const lines = renderBarChart(series, 10);
    expect(lines).toHaveLength(2);
    // 最大值(今天 20)应为满宽度 10 个 █;今天带 * 标记
    expect(lines[1]).toContain("█".repeat(10));
    expect(lines[1]).toContain("*");
    // 昨天 10 = 半宽 5 个 █
    expect(lines[0]).toContain("█".repeat(5));
  });

  it("renders zero-activity days without bars", async () => {
    const { renderBarChart } = await import("../src/commands/stats.js");
    const series = [{ day: dayOffset(0), sessions: 0, prompts: 0, toolCalls: 0, minutes: 0 }];
    const lines = renderBarChart(series, 10);
    expect(lines[0]).not.toContain("█");
  });
});

describe("generateSvg", () => {
  function fakeStats(): StatsData {
    return {
      days: 7,
      series: [
        { day: dayOffset(1), sessions: 1, prompts: 10, toolCalls: 50, minutes: 20 },
        { day: dayOffset(0), sessions: 2, prompts: 30, toolCalls: 90, minutes: 40 },
      ],
      totals: { sessions: 3, prompts: 40, toolCalls: 140, minutes: 60 },
      activeDays: 2,
      streak: 2,
      bestDay: { day: dayOffset(0), prompts: 30 },
      avgPromptsPerActiveDay: 20,
    };
  }

  it("produces a valid SVG document containing the key numbers", async () => {
    const { generateSvg } = await import("../src/commands/stats.js");
    const svg = generateSvg(fakeStats());
    expect(svg).toContain("<svg");
    expect(svg).toContain("</svg>");
    expect(svg).toContain("kimi-boost stats");
    expect(svg).toContain(">40<"); // prompts 大数字
    expect(svg).toContain(">140<"); // tool calls
    expect(svg).toContain(">2d<"); // streak
    expect(svg).toContain("<rect"); // 柱状图
  });

  it("escapes XML-sensitive content and handles empty series", async () => {
    const { generateSvg } = await import("../src/commands/stats.js");
    const svg = generateSvg({
      days: 7,
      series: [],
      totals: { sessions: 0, prompts: 0, toolCalls: 0, minutes: 0 },
      activeDays: 0,
      streak: 0,
      bestDay: undefined,
      avgPromptsPerActiveDay: 0,
    });
    expect(svg).toContain("<svg");
    expect(svg).toContain("</svg>");
    expect(svg).not.toContain("NaN");
    expect(svg).not.toContain("undefined");
  });
});
