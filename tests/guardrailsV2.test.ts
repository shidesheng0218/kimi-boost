import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

/**
 * 0.15.0 护栏 v2:三个新守卫的行为矩阵 + mode(block/warn)语义 +
 * git hook 安装/卸载 + CI 扫描。所有 hook 调用都沙箱化 KIMI_BOOST_HOME。
 */

const CORE_HOOKS = join(dirname(fileURLToPath(import.meta.url)), "..", "presets", "core", "hooks");
const PROTECT_GUARDS = join(CORE_HOOKS, "protect-guards.mjs");
const PROTECT_PATHS = join(CORE_HOOKS, "protect-paths.mjs");
const SECRET_SCAN_POST = join(CORE_HOOKS, "secret-scan-post.mjs");
const PROTECT_MAIN = join(CORE_HOOKS, "protect-main.mjs");
const GIT_DESTRUCTIVE = join(CORE_HOOKS, "git-destructive.mjs");

const AWS_KEY = ["AKIA", "IOSFODNN7EXAMPLE"].join("");

let home: string;

beforeEach(() => {
  home = mkdtempSync(join(tmpdir(), "kboost-v2-"));
});

afterEach(() => {
  rmSync(home, { recursive: true, force: true });
});

function runHook(script: string, payload: unknown, args: string[] = [], cwd?: string): number | null {
  const res = spawnSync(process.execPath, [script, ...args], {
    input: JSON.stringify(payload),
    encoding: "utf8",
    cwd,
    env: { ...process.env, KIMI_BOOST_HOME: home },
  });
  return res.status;
}

function setConfig(cfg: Record<string, unknown>): void {
  writeFileSync(join(home, "guards.json"), JSON.stringify(cfg), "utf8");
}

function readLog(): Array<{ guard: string; preview?: string }> {
  const f = join(home, "guard-log.jsonl");
  if (!existsSync(f)) return [];
  return readFileSync(f, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l));
}

describe("protect-guards(自保护)", () => {
  it("拦写 ~/.kimi-boost/guards.json", () => {
    expect(runHook(PROTECT_GUARDS, { tool_input: { file_path: "/home/u/.kimi-boost/guards.json" } }, ["--tool=write"])).toBe(2);
  });

  it("拦写 ~/.claude/settings.json 与项目 .claude/", () => {
    expect(runHook(PROTECT_GUARDS, { tool_input: { file_path: "/home/u/.claude/settings.json" } }, ["--tool=edit"])).toBe(2);
    expect(runHook(PROTECT_GUARDS, { tool_input: { file_path: "/proj/.claude/settings.json" } }, ["--tool=write"])).toBe(2);
  });

  it("拦 Bash 里执行 kimi-boost guard --disable", () => {
    expect(runHook(PROTECT_GUARDS, { tool_input: { command: "kimi-boost guard --disable protect-main" } }, ["--tool=bash"])).toBe(2);
  });

  it("拦 Bash 重定向改写护栏配置", () => {
    expect(runHook(PROTECT_GUARDS, { tool_input: { command: "echo '{}' > ~/.kimi-boost/guards.json" } }, ["--tool=bash"])).toBe(2);
  });

  it("放行普通文件写入与正常命令", () => {
    expect(runHook(PROTECT_GUARDS, { tool_input: { file_path: "/proj/src/index.ts" } }, ["--tool=write"])).toBe(0);
    expect(runHook(PROTECT_GUARDS, { tool_input: { command: "npm test" } }, ["--tool=bash"])).toBe(0);
  });
});

describe("protect-paths(lockfile/生成物)", () => {
  it("拦手改 package-lock.json / go.sum / Cargo.lock", () => {
    expect(runHook(PROTECT_PATHS, { tool_input: { file_path: "/proj/package-lock.json" } })).toBe(2);
    expect(runHook(PROTECT_PATHS, { tool_input: { file_path: "/proj/go.sum" } })).toBe(2);
    expect(runHook(PROTECT_PATHS, { tool_input: { file_path: "/proj/Cargo.lock" } })).toBe(2);
  });

  it("拦写 node_modules/ 与 .git/ 内部", () => {
    expect(runHook(PROTECT_PATHS, { tool_input: { file_path: "/proj/node_modules/x/index.js" } })).toBe(2);
    expect(runHook(PROTECT_PATHS, { tool_input: { file_path: "/proj/.git/hooks/pre-commit" } })).toBe(2);
  });

  it("放行普通源码与 package.json", () => {
    expect(runHook(PROTECT_PATHS, { tool_input: { file_path: "/proj/src/app.ts" } })).toBe(0);
    expect(runHook(PROTECT_PATHS, { tool_input: { file_path: "/proj/package.json" } })).toBe(0);
  });

  it("拦 Bash 重定向写 lockfile", () => {
    expect(runHook(PROTECT_PATHS, { tool_input: { command: "echo x > package-lock.json" } }, ["--tool=bash"])).toBe(2);
  });
});

describe("secret-scan-post(PostToolUse 补扫)", () => {
  it("补扫 Write 落盘的文件,命中则提醒(exit 2)并记录", () => {
    const f = join(home, "written.env");
    writeFileSync(f, `KEY=${AWS_KEY}\n`, "utf8");
    expect(runHook(SECRET_SCAN_POST, { tool_input: { file_path: f } })).toBe(2);
    expect(readLog().some((e) => e.guard === "secret-scan-post")).toBe(true);
  });

  it("补扫 Bash 重定向写的文件", () => {
    const f = join(home, "out.txt");
    writeFileSync(f, `token = "${AWS_KEY}"\n`, "utf8");
    expect(runHook(SECRET_SCAN_POST, { tool_input: { command: `echo x > ${f}` } })).toBe(2);
  });

  it("干净文件放行;不存在的文件放行", () => {
    const clean = join(home, "clean.txt");
    writeFileSync(clean, "hello\n", "utf8");
    expect(runHook(SECRET_SCAN_POST, { tool_input: { file_path: clean } })).toBe(0);
    expect(runHook(SECRET_SCAN_POST, { tool_input: { file_path: join(home, "nope.txt") } })).toBe(0);
  });
});

describe("mode 语义(block vs warn)", () => {
  it("warn 模式:记录+提示但放行(exit 0)", () => {
    setConfig({ modes: { "git-destructive": "warn" } });
    expect(runHook(GIT_DESTRUCTIVE, { tool_input: { command: "git reset --hard" } })).toBe(0);
    expect(readLog().some((e) => e.guard === "git-destructive")).toBe(true); // 仍被记录
  });

  it("默认 block 模式:命中即 exit 2", () => {
    expect(runHook(GIT_DESTRUCTIVE, { tool_input: { command: "git reset --hard" } })).toBe(2);
  });

  it("warn 模式对 protect-main 同样生效", () => {
    setConfig({ modes: { "protect-main": "warn" } });
    const repo = mkdtempSync(join(tmpdir(), "kboost-v2-git-"));
    try {
      spawnSync("git", ["init", "-b", "main"], { cwd: repo, stdio: "ignore" });
      expect(runHook(PROTECT_MAIN, { tool_input: { command: "git push" } }, [], repo)).toBe(0);
    } finally {
      rmSync(repo, { recursive: true, force: true });
    }
  });

  it("disabled 优先于 mode:停用的守卫直接放行", () => {
    setConfig({ disabled: ["git-destructive"], modes: { "git-destructive": "block" } });
    expect(runHook(GIT_DESTRUCTIVE, { tool_input: { command: "git reset --hard" } })).toBe(0);
  });
});

describe("guard --ci 扫描与 git hook", () => {
  function gitRepo(): string {
    const repo = mkdtempSync(join(tmpdir(), "kboost-v2-repo-"));
    spawnSync("git", ["init", "-b", "main"], { cwd: repo, stdio: "ignore" });
    spawnSync("git", ["config", "user.email", "t@t"], { cwd: repo, stdio: "ignore" });
    spawnSync("git", ["config", "user.name", "t"], { cwd: repo, stdio: "ignore" });
    return repo;
  }

  it("scanChangedFiles 在暂存区发现密钥并给出 文件:行号", async () => {
    const repo = gitRepo();
    try {
      spawnSync("git", ["add", "package.json"], { cwd: repo, stdio: "ignore" }); // 空仓先有内容
      writeFileSync(join(repo, "config.ts"), `const k = "${AWS_KEY}";\n`, "utf8");
      spawnSync("git", ["add", "config.ts"], { cwd: repo, stdio: "ignore" });
      const { scanChangedFiles } = await import("../src/core/guards.js");
      const cwd0 = process.cwd();
      process.chdir(repo);
      try {
        const { findings } = scanChangedFiles({ staged: true });
        expect(findings.length).toBeGreaterThan(0);
        expect(findings[0].file).toBe("config.ts");
        expect(findings[0].line).toBe(1);
      } finally {
        process.chdir(cwd0);
      }
    } finally {
      rmSync(repo, { recursive: true, force: true });
    }
  });

  it("installGitHook/uninstallGitHook:受管块幂等可逆", async () => {
    const repo = gitRepo();
    const cwd0 = process.cwd();
    try {
      process.chdir(repo);
      const { installGitHook, uninstallGitHook } = await import("../src/core/guards.js");
      const p1 = installGitHook();
      expect(p1.mode).toBe("created");
      const content1 = readFileSync(p1.path, "utf8");
      expect(content1).toContain("kimi-boost guard --ci --staged");

      // 再装一次:幂等(仍是同一受管块,不重复堆叠)
      const p2 = installGitHook();
      expect(p2.mode).toBe("updated");
      const content2 = readFileSync(p2.path, "utf8");
      expect(content2.split("kimi-boost guard hook >>>").length - 1).toBe(1);

      // 用户已有的 hook 内容要保留
      writeFileSync(p2.path, "#!/bin/sh\necho user-hook\n\n" + content2.replace(/^#!/, ""), "utf8");
      const r = uninstallGitHook();
      expect(r.removed).toBe(true);
      const after = existsSync(r.path) ? readFileSync(r.path, "utf8") : "";
      expect(after).toContain("echo user-hook");
      expect(after).not.toContain("kimi-boost guard --ci");
    } finally {
      process.chdir(cwd0);
      rmSync(repo, { recursive: true, force: true });
    }
  });

  it("非 git 目录下 installGitHook 报错", async () => {
    const notRepo = mkdtempSync(join(tmpdir(), "kboost-v2-nogit-"));
    const cwd0 = process.cwd();
    try {
      process.chdir(notRepo);
      const { installGitHook } = await import("../src/core/guards.js");
      expect(() => installGitHook()).toThrow("git");
    } finally {
      process.chdir(cwd0);
      rmSync(notRepo, { recursive: true, force: true });
    }
  });
});