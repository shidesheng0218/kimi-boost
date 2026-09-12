import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

let tmp: string;

beforeEach(() => {
  tmp = mkdtempSync(join(tmpdir(), "kboost-guardcmd-"));
  process.env.KIMI_BOOST_HOME = tmp;
});

afterEach(() => {
  delete process.env.KIMI_BOOST_HOME;
  rmSync(tmp, { recursive: true, force: true });
  vi.restoreAllMocks();
});

describe("runGuard", () => {
  it("默认列出全部守卫及其启用状态", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    const { runGuard } = await import("../src/commands/guard.js");
    runGuard({});
    const out = log.mock.calls.map((c) => String(c[0])).join("\n");
    expect(out).toContain("protect-main");
    expect(out).toContain("block-dangerous");
    expect(out).toContain("启用中");
    expect(out).toContain("近 30 天共拦截 0 次");
  });

  it("disable 后 list 显示已停用,enable 恢复", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    const { runGuard } = await import("../src/commands/guard.js");
    runGuard({ disable: "protect-main" });
    runGuard({});
    let out = log.mock.calls.map((c) => String(c[0])).join("\n");
    expect(out).toContain("已停用");
    runGuard({ enable: "protect-main" });
    log.mockClear();
    runGuard({});
    out = log.mock.calls.map((c) => String(c[0])).join("\n");
    expect(out).not.toContain("○ 已停用");
  });

  it("add-pattern 校验非法正则", async () => {
    const { runGuard } = await import("../src/commands/guard.js");
    expect(() => runGuard({ addPattern: "([" })).toThrow("非法正则");
    runGuard({ addPattern: "docker\\s+system" });
    const { readGuardsConfig } = await import("../src/core/guards.js");
    expect(readGuardsConfig().customPatterns).toContain("docker\\s+system");
  });

  it("--log 渲染拦截事件;无记录时给引导文案", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    const { runGuard } = await import("../src/commands/guard.js");
    runGuard({ log: true });
    expect(log.mock.calls.map((c) => String(c[0])).join("\n")).toContain("还没有拦截记录");

    writeFileSync(
      join(tmp, "guard-log.jsonl"),
      JSON.stringify({ ts: new Date().toISOString(), guard: "protect-main", tool: "Bash", preview: "git push" }) + "\n",
      "utf8",
    );
    log.mockClear();
    runGuard({ log: true });
    const out = log.mock.calls.map((c) => String(c[0])).join("\n");
    expect(out).toContain("protect-main");
    expect(out).toContain("git push");
  });
});
