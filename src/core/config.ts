import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { parse, stringify } from "smol-toml";
import { kimiHomeDir } from "./detect.js";
import { copyFileIfWritable, ensureDir, writeFileIfWritable } from "./fsguard.js";

/**
 * kimi-boost 管理的各目录。全部惰性求值(函数形式),以便测试环境在运行时
 * 通过环境变量覆盖 KIMI_BOOST_HOME 等路径,而不受模块加载顺序影响。
 */
export function boostHome(): string {
  return process.env.KIMI_BOOST_HOME ?? join(homedir(), ".kimi-boost");
}
export function presetsDir(): string {
  return join(boostHome(), "presets");
}
export function agentsDir(): string {
  return join(boostHome(), "agents");
}
export function skillsDir(): string {
  return join(boostHome(), "skills");
}
export function hooksDir(): string {
  return join(boostHome(), "hooks");
}

export function ensureBoostDirs(): void {
  for (const d of [boostHome(), presetsDir(), agentsDir(), skillsDir(), hooksDir()]) {
    ensureDir(d);
  }
}

export function backupFile(file: string): string | undefined {
  if (!existsSync(file)) return undefined;
  const bak = `${file}.kboost.bak`;
  copyFileIfWritable(file, bak);
  return bak;
}

export type TomlObject = Record<string, unknown>;

export interface KimiConfig {
  path: string;
  data: TomlObject;
}

export function readKimiConfig(): KimiConfig {
  const path = join(kimiHomeDir(), "config.toml");
  const data = existsSync(path)
    ? (parse(readFileSync(path, "utf8")) as TomlObject)
    : {};
  return { path, data };
}

function asStringArray(v: unknown): string[] {
  return Array.isArray(v) ? (v as unknown[]).filter((x): x is string => typeof x === "string") : [];
}

/**
 * 把 kboost 的 skills/agents 目录挂到 Kimi 配置上(extra_skill_dirs / extra_agent_dirs)。
 * 返回是否发生了变更。
 */
export function mountBoostDirs(config: KimiConfig): boolean {
  const data = config.data;
  const skillDirs = new Set(asStringArray(data.extra_skill_dirs));
  const agentDirs = new Set(asStringArray(data.extra_agent_dirs));
  const changed = !skillDirs.has(skillsDir()) || !agentDirs.has(agentsDir());
  skillDirs.add(skillsDir());
  agentDirs.add(agentsDir());
  data.extra_skill_dirs = [...skillDirs];
  data.extra_agent_dirs = [...agentDirs];
  return changed;
}

export interface HookEntry {
  event: string;
  matcher?: string;
  command: string;
  timeout?: number;
}

export function listKimiHooks(config: KimiConfig): HookEntry[] {
  const raw = config.data.hooks;
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((h): h is Record<string, unknown> => typeof h === "object" && h !== null)
    .map((h) => ({
      event: String(h.event ?? ""),
      matcher: typeof h.matcher === "string" ? h.matcher : undefined,
      command: String(h.command ?? ""),
      timeout: typeof h.timeout === "number" ? h.timeout : undefined,
    }));
}

/**
 * 追加/去重 hook 规则。重复判定:同 event + 同 command。
 */
export function upsertKimiHooks(config: KimiConfig, hooks: HookEntry[]): boolean {
  const existing = listKimiHooks(config);
  let changed = false;
  for (const hook of hooks) {
    const dup = existing.some((e) => e.event === hook.event && e.command === hook.command);
    if (!dup) {
      existing.push(hook);
      changed = true;
    }
  }
  if (changed) {
    config.data.hooks = existing.map((h) => {
      const entry: Record<string, unknown> = { event: h.event, command: h.command };
      if (h.matcher) entry.matcher = h.matcher;
      if (h.timeout !== undefined) entry.timeout = h.timeout;
      return entry;
    });
  }
  return changed;
}

export function saveKimiConfig(config: KimiConfig): void {
  ensureBoostDirs();
  ensureDir(dirname(config.path));
  writeFileIfWritable(config.path, stringify(config.data));
}

export function writeJson(file: string, data: unknown): void {
  ensureBoostDirs();
  writeFileIfWritable(file, JSON.stringify(data, null, 2));
}

export function readJson<T>(file: string): T | undefined {
  if (!existsSync(file)) return undefined;
  return JSON.parse(readFileSync(file, "utf8")) as T;
}
