import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

/**
 * 测试 core 的两个新守卫(protect-credentials / git-destructive)的行为矩阵,
 * 以及守卫平台的两个横切行为:guards.json 停用放行、拦截写 guard-log.jsonl。
 * 每个 spawn 都设 KIMI_BOOST_HOME 到临时目录——hook 会写 guard-log,绝不能碰真机。
 */

const HOOKS = join(dirname(fileURLToPath(import.meta.url)), "..", "presets", "core", "hooks");
const PROTECT_CREDS = join(HOOKS, "protect-credentials.mjs");
const GIT_DESTRUCTIVE = join(HOOKS, "git-destructive.mjs");
const BLOCK_DANGEROUS = join(HOOKS, "block-dangerous.mjs");

let home: string;

beforeEach(() => {
  home = mkdtempSync(join(tmpdir(), "kboost-guardhook-"));
});

afterEach(() => {
  rmSync(home, { recursive: true, force: true });
});

function runHook(script: string, payload: unknown, args: string[] = []): number | null {
  const res = spawnSync(process.execPath, [script, ...args], {
    input: JSON.stringify(payload),
    encoding: "utf8",
    env: { ...process.env, KIMI_BOOST_HOME: home },
  });
  return res.status;
}

function readLog(): Array<{ guard: string; preview?: string }> {
  const f = join(home, "guard-log.jsonl");
  if (!existsSync(f)) return [];
  return readFileSync(f, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l));
}

describe("core/protect-credentials.mjs", () => {
  it("Read 拦截读 ~/.ssh/id_rsa", () => {
    expect(runHook(PROTECT_CREDS, { tool_input: { file_path: "/home/u/.ssh/id_rsa" } }, ["--tool=read"])).toBe(2);
  });

  it("Read 拦截读 ~/.aws/credentials", () => {
    expect(runHook(PROTECT_CREDS, { tool_input: { file_path: "/home/u/.aws/credentials" } }, ["--tool=read"])).toBe(2);
  });

  it("Read 放行普通文件与 .env.example", () => {
    expect(runHook(PROTECT_CREDS, { tool_input: { file_path: "/home/u/proj/index.ts" } }, ["--tool=read"])).toBe(0);
    expect(runHook(PROTECT_CREDS, { tool_input: { file_path: "/home/u/proj/.env.example" } }, ["--tool=read"])).toBe(0);
  });

  it("Bash 拦截 cat ~/.ssh/id_rsa", () => {
    expect(runHook(PROTECT_CREDS, { tool_input: { command: "cat ~/.ssh/id_rsa" } }, ["--tool=bash"])).toBe(2);
  });

  it("Bash 放行普通命令", () => {
    expect(runHook(PROTECT_CREDS, { tool_input: { command: "ls ~/.config" } }, ["--tool=bash"])).toBe(0);
  });
});

describe("core/git-destructive.mjs", () => {
  it("拦截 git reset --hard", () => {
    expect(runHook(GIT_DESTRUCTIVE, { tool_input: { command: "git reset --hard HEAD~1" } })).toBe(2);
  });

  it("拦截 git clean -fd", () => {
    expect(runHook(GIT_DESTRUCTIVE, { tool_input: { command: "git clean -fd" } })).toBe(2);
  });

  it("拦截 git checkout -- .", () => {
    expect(runHook(GIT_DESTRUCTIVE, { tool_input: { command: "git checkout -- ." } })).toBe(2);
  });

  it("放行普通 git 操作", () => {
    expect(runHook(GIT_DESTRUCTIVE, { tool_input: { command: "git reset --soft HEAD~1" } })).toBe(0);
    expect(runHook(GIT_DESTRUCTIVE, { tool_input: { command: "git status" } })).toBe(0);
    expect(runHook(GIT_DESTRUCTIVE, { tool_input: { command: "git checkout -b feat/x" } })).toBe(0);
  });
});

describe("守卫平台横切行为", () => {
  it("guards.json 里 disabled 的守卫放行", () => {
    writeFileSync(join(home, "guards.json"), JSON.stringify({ disabled: ["git-destructive"] }), "utf8");
    expect(runHook(GIT_DESTRUCTIVE, { tool_input: { command: "git reset --hard" } })).toBe(0);
  });

  it("拦截时写入 guard-log.jsonl(脱敏摘要)", () => {
    runHook(GIT_DESTRUCTIVE, { tool_input: { command: "git reset --hard" } });
    const log = readLog();
    expect(log).toHaveLength(1);
    expect(log[0].guard).toBe("git-destructive");
    expect(log[0].preview).toContain("git reset --hard");
  });

  it("customPatterns 注入 block-dangerous 生效", () => {
    writeFileSync(join(home, "guards.json"), JSON.stringify({ customPatterns: ["docker\\s+system\\s+prune"] }), "utf8");
    expect(runHook(BLOCK_DANGEROUS, { tool_input: { command: "docker system prune -a" } })).toBe(2);
  });

  it("customPatterns 里的非法正则被忽略(不崩)", () => {
    writeFileSync(join(home, "guards.json"), JSON.stringify({ customPatterns: ["([invalid"] }), "utf8");
    expect(runHook(BLOCK_DANGEROUS, { tool_input: { command: "ls" } })).toBe(0);
  });
});
