import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { boostHome } from "./config.js";
import { ensureDir, removeIfWritable, writeFileIfWritable } from "./fsguard.js";

/**
 * 护栏平台的数据层(CLI 侧):
 * - guards.json:运行时开关/模式/自定义拦截模式(hook 每次执行时读它,无需重装)
 * - guard-log.jsonl:拦截事件日志(hook 拦截时写入,guard 命令/stats 读它)
 *
 * 注意:hook 脚本(预设里的 .mjs)是独立副本,各自内联同构的运行时逻辑;
 * 这里是 CLI 命令侧的读写实现,两边格式必须一致。
 */

export type GuardMode = "block" | "warn";

export interface GuardsConfig {
  disabled: string[];
  /** 注入 block-dangerous 的自定义拦截正则 */
  customPatterns: string[];
  /** 每守卫的运行模式:block(默认,exit 2 阻断) | warn(记录+提示但放行) */
  modes: Record<string, GuardMode>;
}

export interface GuardEvent {
  ts: string;
  guard: string;
  tool?: string;
  /** 被拦内容的截断摘要(不含完整密钥) */
  preview?: string;
}

export interface GuardInfo {
  name: string;
  preset: string;
  description: string;
  /** explain:它具体拦什么 */
  blocks: string;
  /** explain:误伤时怎么办 */
  bypass: string;
  /** explain:直接关掉的风险 */
  risk: string;
}

/** 已知守卫注册表(名称 = hook 脚本里硬编码的 GUARD_NAME) */
export const GUARD_REGISTRY: GuardInfo[] = [
  {
    name: "protect-main",
    preset: "core",
    description: "拦截直推 main/master",
    blocks: "当前分支是 main/master 时的 git push",
    bypass: "改用特性分支,或 kimi-boost guard --disable protect-main",
    risk: "关掉后 agent 可以直接把未审查的改动推上主干",
  },
  {
    name: "block-dangerous",
    preset: "core",
    description: "拦截危险 shell 命令(rm -rf /、mkfs、dd、curl|sh)",
    blocks: "目标为 / 或 * 的递归删除、变量路径的 rm -rf、mkfs、写裸设备、curl|sh",
    bypass: "把命令写具体(如 rm -rf ./dist),或 guard --disable block-dangerous",
    risk: "关掉后一次误执行的 rm -rf 可能清空整个工作区",
  },
  {
    name: "secret-scan",
    preset: "core",
    description: "拦截写入硬编码密钥",
    blocks: "写入文件的内容含 AWS key、私钥块、GitHub/Slack token、api_key=\"...\" 这类赋值",
    bypass: "把密钥改从环境变量读取,或 guard --disable secret-scan",
    risk: "关掉后密钥可能被写进源码并随提交进入 git 历史(需吊销轮换才能补救)",
  },
  {
    name: "protect-credentials",
    preset: "core",
    description: "拦截把高敏凭证文件读进上下文(~/.ssh、~/.aws 等)",
    blocks: "读取 ~/.ssh/*、~/.aws/credentials、~/.gnupg、~/.netrc、id_rsa、*.pem、*.key",
    bypass: "让 agent 按名字引用环境变量而非读内容,或 guard --disable protect-credentials",
    risk: "关掉后凭证内容会进入模型上下文(等于外泄给模型提供方)",
  },
  {
    name: "git-destructive",
    preset: "core",
    description: "拦截丢弃工作区的 git 操作(reset --hard、clean -f 等)",
    blocks: "git reset --hard、git clean -f*、git checkout -- .、git restore .",
    bypass: "先 git stash 再操作,或 guard --disable git-destructive",
    risk: "关掉后未提交的工作可能被一条命令无声清空",
  },
  {
    name: "protect-guards",
    preset: "core",
    description: "自保护:拦截 agent 关闭护栏或改写护栏配置",
    blocks: "写 ~/.kimi-boost/** 与各 CLI 配置(settings.json/config.toml/项目 .claude/AGENTS.md);Bash 里执行 kimi-boost guard --disable 或直接改写这些路径",
    bypass: "由你本人执行 guard --disable / --warn(在终端里,而非让 agent 代劳)",
    risk: "关掉后 agent 可以自行摘掉所有护栏,再执行任何被拦的操作",
  },
  {
    name: "protect-paths",
    preset: "core",
    description: "拦截手改 lockfile 与生成物目录",
    blocks: "写 package-lock.json/yarn.lock/pnpm-lock.yaml/go.sum/Cargo.lock/poetry.lock 等锁文件,以及 node_modules/、dist/、.git/ 内部",
    bypass: "用包管理器生成 lockfile(npm install/go mod tidy),或 guard --disable protect-paths",
    risk: "关掉后 lockfile 被手改会破坏依赖可复现性,甚至引入不一致的依赖树",
  },
  {
    name: "secret-scan-post",
    preset: "core",
    description: "补扫:命令执行后检查刚写的文件是否含密钥(仅告知,不阻断)",
    blocks: "PostToolUse 通道:识别 Write/Edit/Bash(重定向/tee)刚落盘的文件,补扫密钥并提醒",
    bypass: "无需放行——它只记录与提醒,从不阻断操作",
    risk: "关掉后经由 shell 重定向写入的密钥不再被提醒(PreToolUse 只看得到 Write/Edit)",
  },
  {
    name: "block-force-push",
    preset: "security",
    description: "拦截 git push --force / --delete",
    blocks: "git push 带 --force/-f/--delete(--force-with-lease 放行)",
    bypass: "用 --force-with-lease,或 guard --disable block-force-push",
    risk: "关掉后强推可能覆盖他人的远程提交",
  },
];

export function guardsFile(): string {
  return join(boostHome(), "guards.json");
}

export function guardLogFile(): string {
  return join(boostHome(), "guard-log.jsonl");
}

export function readGuardsConfig(): GuardsConfig {
  try {
    const raw = JSON.parse(readFileSync(guardsFile(), "utf8")) as Partial<GuardsConfig>;
    const modes: Record<string, GuardMode> = {};
    if (raw.modes && typeof raw.modes === "object") {
      for (const [k, v] of Object.entries(raw.modes)) {
        if (v === "block" || v === "warn") modes[k] = v;
      }
    }
    return {
      disabled: Array.isArray(raw.disabled) ? raw.disabled.filter((x): x is string => typeof x === "string") : [],
      customPatterns: Array.isArray(raw.customPatterns) ? raw.customPatterns.filter((x): x is string => typeof x === "string") : [],
      modes,
    };
  } catch {
    return { disabled: [], customPatterns: [], modes: {} };
  }
}

function writeGuardsConfig(cfg: GuardsConfig): void {
  ensureDir(boostHome());
  writeFileIfWritable(guardsFile(), JSON.stringify(cfg, null, 2) + "\n");
}

export function setGuardDisabled(name: string, disabled: boolean): void {
  const cfg = readGuardsConfig();
  const set = new Set(cfg.disabled);
  if (disabled) set.add(name);
  else set.delete(name);
  writeGuardsConfig({ ...cfg, disabled: [...set].sort() });
}

/** 设置守卫模式:block(默认,硬拦) 或 warn(记录+提示但放行) */
export function setGuardMode(name: string, mode: GuardMode): void {
  const cfg = readGuardsConfig();
  const modes = { ...cfg.modes };
  if (mode === "block") delete modes[name]; // block 是默认值,不必落盘
  else modes[name] = mode;
  writeGuardsConfig({ ...cfg, modes });
}

export function addCustomPattern(pattern: string): void {
  const cfg = readGuardsConfig();
  if (!cfg.customPatterns.includes(pattern)) {
    writeGuardsConfig({ ...cfg, customPatterns: [...cfg.customPatterns, pattern] });
  }
}

export function readGuardLog(): GuardEvent[] {
  try {
    if (!existsSync(guardLogFile())) return [];
    return readFileSync(guardLogFile(), "utf8")
      .split("\n")
      .filter(Boolean)
      .map((line) => {
        try {
          return JSON.parse(line) as GuardEvent;
        } catch {
          return undefined;
        }
      })
      .filter((e): e is GuardEvent => Boolean(e));
  } catch {
    return [];
  }
}

/** 窗口内(近 N 天)的拦截数,以及按守卫的分布 */
export function guardStats(days: number): { total: number; byGuard: Array<{ guard: string; count: number }> } {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - days);
  const events = readGuardLog().filter((e) => {
    const t = Date.parse(e.ts);
    return !Number.isNaN(t) && t >= cutoff.getTime();
  });
  const by = new Map<string, number>();
  for (const e of events) by.set(e.guard, (by.get(e.guard) ?? 0) + 1);
  const byGuard = [...by.entries()].map(([guard, count]) => ({ guard, count })).sort((a, b) => b.count - a.count);
  return { total: events.length, byGuard };
}

// ---------------------------------------------------------------------------
// CI / git hook:把同一套密钥规则跑到文件上(与 hook 脚本里的模式保持一致)
// ---------------------------------------------------------------------------

export interface SecretPattern {
  name: string;
  re: RegExp;
}

/** 与 presets/core/hooks/secret-scan.mjs 保持一致的密钥模式表 */
export const SECRET_PATTERNS: SecretPattern[] = [
  { name: "AWS Access Key ID", re: /\bAKIA[0-9A-Z]{16}\b/ },
  { name: "private key block", re: /-----BEGIN (?:RSA |EC |OPENSSH |DSA |PGP |ENCRYPTED )?PRIVATE KEY(?: BLOCK)?-----/ },
  { name: "GitHub token", re: /\bgh[pousr]_[A-Za-z0-9]{20,}\b/ },
  { name: "Slack token", re: /\bxox[baprs]-[A-Za-z0-9-]{10,}\b/ },
  {
    name: "hardcoded credential",
    re: /\b(?:api[_-]?key|api[_-]?secret|client[_-]?secret|secret|access[_-]?token|auth[_-]?token|password|passwd)\b\s*[:=]\s*["'][A-Za-z0-9/_+=.-]{16,}["']/i,
  },
];

export interface SecretFinding {
  file: string;
  line: number;
  pattern: string;
}

function gitLines(args: string[]): string[] {
  try {
    return execFileSync("git", args, { encoding: "utf8" })
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean);
  } catch {
    return [];
  }
}

/** 扫描待提交(staged)或工作区变更文件里的密钥;用于 CI 与 git pre-commit */
export function scanChangedFiles(opts: { staged?: boolean } = {}): { files: string[]; findings: SecretFinding[] } {
  const diffArgs = opts.staged
    ? ["diff", "--cached", "--name-only", "--diff-filter=ACM"]
    : ["diff", "--name-only", "--diff-filter=ACM", "HEAD"];
  const files = gitLines(diffArgs);
  const findings: SecretFinding[] = [];
  for (const file of files) {
    let stat;
    try {
      stat = statSync(file);
    } catch {
      continue; // 已删除/不可读
    }
    if (!stat.isFile() || stat.size > 1_000_000) continue; // 跳过二进制/超大文件
    let text: string;
    try {
      text = readFileSync(file, "utf8");
    } catch {
      continue;
    }
    if (text.includes("\u0000")) continue; // 二进制
    text.split("\n").forEach((lineText, idx) => {
      for (const p of SECRET_PATTERNS) {
        if (p.re.test(lineText)) {
          findings.push({ file, line: idx + 1, pattern: p.name });
          break;
        }
      }
    });
  }
  return { files, findings };
}

// ---------------------------------------------------------------------------
// git pre-commit hook 安装/卸载(受管块,幂等)
// ---------------------------------------------------------------------------

const GIT_HOOK_BEGIN = "# >>> kimi-boost guard hook >>>";
const GIT_HOOK_END = "# <<< kimi-boost guard hook <<<";

export function gitHookPath(cwd: string = process.cwd()): string | undefined {
  const root = gitLines(["-C", cwd, "rev-parse", "--show-toplevel"])[0];
  return root ? join(root, ".git", "hooks", "pre-commit") : undefined;
}

/** 受管块内容:优先用已安装的 kimi-boost,否则 npx */
export function gitHookBlock(): string {
  return [
    GIT_HOOK_BEGIN,
    'if command -v kimi-boost >/dev/null 2>&1; then',
    "  kimi-boost guard --ci --staged || exit 1",
    "else",
    "  npx -y kimi-boost guard --ci --staged || exit 1",
    "fi",
    GIT_HOOK_END,
  ].join("\n");
}

function stripGitHookBlock(content: string): string {
  const lines = content.split("\n");
  const out: string[] = [];
  let skipping = false;
  for (const line of lines) {
    if (line.trim() === GIT_HOOK_BEGIN) {
      skipping = true;
      continue;
    }
    if (line.trim() === GIT_HOOK_END) {
      skipping = false;
      continue;
    }
    if (!skipping) out.push(line);
  }
  return out.join("\n").replace(/\n{3,}/g, "\n\n");
}

export function installGitHook(cwd: string = process.cwd()): { path: string; mode: "created" | "updated" } {
  const path = gitHookPath(cwd);
  if (!path) throw new Error("当前目录不在 git 仓库内(未找到 .git)。");
  const existing = existsSync(path) ? readFileSync(path, "utf8") : "";
  const hasBlock = existing.includes(GIT_HOOK_BEGIN);
  const block = gitHookBlock();
  let next: string;
  if (hasBlock) {
    next = stripGitHookBlock(existing).trimEnd() + "\n\n" + block + "\n";
  } else if (existing.trim()) {
    next = existing.trimEnd() + "\n\n" + block + "\n";
  } else {
    next = "#!/bin/sh\n\n" + block + "\n";
  }
  writeFileIfWritable(path, next);
  try {
    execFileSync("chmod", ["+x", path], { stdio: "ignore" });
  } catch {
    /* Windows: 不依赖可执行位 */
  }
  return { path, mode: hasBlock ? "updated" : existing.trim() ? "updated" : "created" };
}

export function uninstallGitHook(cwd: string = process.cwd()): { path: string; removed: boolean } {
  const path = gitHookPath(cwd);
  if (!path) throw new Error("当前目录不在 git 仓库内(未找到 .git)。");
  if (!existsSync(path)) return { path, removed: false };
  const existing = readFileSync(path, "utf8");
  if (!existing.includes(GIT_HOOK_BEGIN)) return { path, removed: false };
  const stripped = stripGitHookBlock(existing);
  // 仅剩 shebang/空白则整文件删除,否则保留其余内容
  if (stripped.replace(/^#!.*\n?/, "").trim() === "") {
    removeIfWritable(path);
  } else {
    writeFileIfWritable(path, stripped.trimEnd() + "\n");
  }
  return { path, removed: true };
}