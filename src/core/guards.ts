import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { boostHome } from "./config.js";
import { ensureDir, writeFileIfWritable } from "./fsguard.js";

/**
 * 护栏平台的数据层(CLI 侧):
 * - guards.json:运行时开关 + 自定义拦截模式(hook 每次执行时读它,无需重装)
 * - guard-log.jsonl:拦截事件日志(hook 拦截时写入,guard 命令/stats 读它)
 *
 * 注意:hook 脚本(预设里的 .mjs)是独立副本,各自内联同构的运行时逻辑;
 * 这里是 CLI 命令侧的读写实现,两边格式必须一致。
 */

export interface GuardsConfig {
  disabled: string[];
  /** 注入 block-dangerous 的自定义拦截正则 */
  customPatterns: string[];
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
}

/** 已知守卫注册表(名称 = hook 脚本里硬编码的 GUARD_NAME) */
export const GUARD_REGISTRY: GuardInfo[] = [
  { name: "protect-main", preset: "core", description: "拦截直推 main/master" },
  { name: "block-dangerous", preset: "core", description: "拦截危险 shell 命令(rm -rf /、mkfs、dd、curl|sh)" },
  { name: "secret-scan", preset: "core", description: "拦截写入硬编码密钥" },
  { name: "protect-credentials", preset: "core", description: "拦截把高敏凭证文件读进上下文(~/.ssh、~/.aws 等)" },
  { name: "git-destructive", preset: "core", description: "拦截丢弃工作区的 git 操作(reset --hard、clean -f 等)" },
  { name: "block-force-push", preset: "security", description: "拦截 git push --force / --delete" },
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
    return {
      disabled: Array.isArray(raw.disabled) ? raw.disabled.filter((x): x is string => typeof x === "string") : [],
      customPatterns: Array.isArray(raw.customPatterns) ? raw.customPatterns.filter((x): x is string => typeof x === "string") : [],
    };
  } catch {
    return { disabled: [], customPatterns: [] };
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
