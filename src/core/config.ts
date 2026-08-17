import { existsSync, mkdirSync, readFileSync, writeFileSync, copyFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { parse, stringify } from "smol-toml";
import { kimiHomeDir } from "./detect.js";

export const BOOST_HOME = process.env.KIMI_BOOST_HOME ?? join(homedir(), ".kimi-boost");
export const PRESETS_DIR = join(BOOST_HOME, "presets");
export const AGENTS_DIR = join(BOOST_HOME, "agents");
export const SKILLS_DIR = join(BOOST_HOME, "skills");
export const HOOKS_DIR = join(BOOST_HOME, "hooks");

export function ensureBoostDirs(): void {
  for (const d of [BOOST_HOME, PRESETS_DIR, AGENTS_DIR, SKILLS_DIR, HOOKS_DIR]) {
    mkdirSync(d, { recursive: true });
  }
}

export function backupFile(file: string): string | undefined {
  if (!existsSync(file)) return undefined;
  const bak = `${file}.kboost.bak`;
  copyFileSync(file, bak);
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
  const changed = !skillDirs.has(SKILLS_DIR) || !agentDirs.has(AGENTS_DIR);
  skillDirs.add(SKILLS_DIR);
  agentDirs.add(AGENTS_DIR);
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
  writeFileSync(config.path, stringify(config.data), "utf8");
}

export function writeJson(file: string, data: unknown): void {
  ensureBoostDirs();
  writeFileSync(file, JSON.stringify(data, null, 2), "utf8");
}

export function readJson<T>(file: string): T | undefined {
  if (!existsSync(file)) return undefined;
  return JSON.parse(readFileSync(file, "utf8")) as T;
}
