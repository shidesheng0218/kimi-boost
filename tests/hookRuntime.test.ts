import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { readGuardLog } from "../src/core/guards.js";

/**
 * hook 运行时(由 scripts/hook-runtime/guard-runtime.tpl 生成到各 hook 里)的横切行为:
 * 并行写日志不丢行、超限轮转、模板与各预设副本一致。
 */

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const BLOCK_DANGEROUS = join(ROOT, "presets", "core", "hooks", "block-dangerous.mjs");

let home: string;

beforeEach(() => {
  home = mkdtempSync(join(tmpdir(), "kboost-runtime-"));
});

afterEach(() => {
  rmSync(home, { recursive: true, force: true });
});

function runHookAsync(script: string, payload: unknown): Promise<number | null> {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [script], {
      env: { ...process.env, KIMI_BOOST_HOME: home },
      stdio: ["pipe", "ignore", "ignore"],
    });
    child.on("close", (code) => resolve(code));
    child.stdin.end(JSON.stringify(payload));
  });
}

describe("guard runtime: logging", () => {
  it("并行触发的拦截全部落盘,不互相覆盖", async () => {
    const N = 24;
    const codes = await Promise.all(
      Array.from({ length: N }, (_, i) => runHookAsync(BLOCK_DANGEROUS, { tool_input: { command: `rm -rf / # ${i}` } })),
    );
    expect(codes.every((c) => c === 2)).toBe(true);
    const lines = readFileSync(join(home, "guard-log.jsonl"), "utf8").split("\n").filter(Boolean);
    expect(lines).toHaveLength(N);
    for (const l of lines) expect(JSON.parse(l).guard).toBe("block-dangerous");
  });

  it("日志超过上限时轮转为 .1,新日志继续写入", () => {
    const log = join(home, "guard-log.jsonl");
    const filler = JSON.stringify({ ts: new Date().toISOString(), guard: "old", tool: "Bash", preview: "x" }) + "\n";
    writeFileSync(log, filler.repeat(Math.ceil((256 * 1024 + 1) / filler.length)));

    const res = spawnSync(process.execPath, [BLOCK_DANGEROUS], {
      input: JSON.stringify({ tool_input: { command: "rm -rf /" } }),
      env: { ...process.env, KIMI_BOOST_HOME: home },
    });
    expect(res.status).toBe(2);

    expect(existsSync(log + ".1")).toBe(true);
    const fresh = readFileSync(log, "utf8").split("\n").filter(Boolean);
    expect(fresh).toHaveLength(1);
    expect(JSON.parse(fresh[0]).guard).toBe("block-dangerous");
  });

  it("CLI 侧 readGuardLog 同时读取轮转文件,统计不因轮转突然变少", () => {
    const prev = process.env.KIMI_BOOST_HOME;
    process.env.KIMI_BOOST_HOME = home;
    try {
      const ev = (guard: string) => JSON.stringify({ ts: new Date().toISOString(), guard }) + "\n";
      writeFileSync(join(home, "guard-log.jsonl.1"), ev("a") + ev("b"));
      writeFileSync(join(home, "guard-log.jsonl"), ev("c"));
      expect(readGuardLog().map((e) => e.guard)).toEqual(["a", "b", "c"]);
    } finally {
      if (prev === undefined) delete process.env.KIMI_BOOST_HOME;
      else process.env.KIMI_BOOST_HOME = prev;
    }
  });
});

describe("guard runtime: single source of truth", () => {
  it("各预设 hook 的运行时段与模板一致(npm run build:hooks 可修复)", () => {
    const res = spawnSync(process.execPath, [join(ROOT, "scripts", "build-hooks.mjs"), "--check"], {
      encoding: "utf8",
    });
    expect(res.stderr).toBe("");
    expect(res.status).toBe(0);
  });
});
