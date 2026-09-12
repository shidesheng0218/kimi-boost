import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

let tmp: string;

beforeEach(() => {
  tmp = mkdtempSync(join(tmpdir(), "kboost-guards-"));
  process.env.KIMI_BOOST_HOME = tmp;
});

afterEach(() => {
  delete process.env.KIMI_BOOST_HOME;
  rmSync(tmp, { recursive: true, force: true });
});

describe("guards.json 配置", () => {
  it("默认配置为空(全部守卫启用)", async () => {
    const { readGuardsConfig } = await import("../src/core/guards.js");
    expect(readGuardsConfig()).toEqual({ disabled: [], customPatterns: [] });
  });

  it("setGuardDisabled 写入并读回;重复 disable 幂等", async () => {
    const { readGuardsConfig, setGuardDisabled } = await import("../src/core/guards.js");
    setGuardDisabled("protect-main", true);
    setGuardDisabled("protect-main", true);
    expect(readGuardsConfig().disabled).toEqual(["protect-main"]);
    setGuardDisabled("protect-main", false);
    expect(readGuardsConfig().disabled).toEqual([]);
  });

  it("addCustomPattern 去重", async () => {
    const { readGuardsConfig, addCustomPattern } = await import("../src/core/guards.js");
    addCustomPattern("docker\\s+system\\s+prune");
    addCustomPattern("docker\\s+system\\s+prune");
    expect(readGuardsConfig().customPatterns).toEqual(["docker\\s+system\\s+prune"]);
  });

  it("配置文件损坏时 fail-open 回默认", async () => {
    writeFileSync(join(tmp, "guards.json"), "{ not json", "utf8");
    const { readGuardsConfig } = await import("../src/core/guards.js");
    expect(readGuardsConfig()).toEqual({ disabled: [], customPatterns: [] });
  });
});

describe("guard-log 与统计", () => {
  function writeLog(events: Array<Record<string, unknown>>): void {
    writeFileSync(join(tmp, "guard-log.jsonl"), events.map((e) => JSON.stringify(e)).join("\n") + "\n", "utf8");
  }

  it("readGuardLog 解析 JSONL,坏行跳过", async () => {
    writeLog([
      { ts: new Date().toISOString(), guard: "protect-main", tool: "Bash", preview: "git push" },
    ]);
    const { readGuardLog } = await import("../src/core/guards.js");
    const events = readGuardLog();
    expect(events).toHaveLength(1);
    expect(events[0].guard).toBe("protect-main");
  });

  it("guardStats 只统计窗口内事件并按守卫聚合", async () => {
    const recent = new Date().toISOString();
    const old = new Date(Date.now() - 40 * 86400000).toISOString();
    writeLog([
      { ts: recent, guard: "protect-main", tool: "Bash" },
      { ts: recent, guard: "secret-scan", tool: "Write" },
      { ts: recent, guard: "protect-main", tool: "Bash" },
      { ts: old, guard: "protect-main", tool: "Bash" }, // 40 天前,超出 7 天窗口
    ]);
    const { guardStats } = await import("../src/core/guards.js");
    const s = guardStats(7);
    expect(s.total).toBe(3);
    expect(s.byGuard[0]).toEqual({ guard: "protect-main", count: 2 });
  });
});
