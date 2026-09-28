import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { boostHome, ensureBoostDirs } from "./config.js";
import { writeFileIfWritable } from "./fsguard.js";

/** 单端安装记录。v0.8 起为对象形态并带版本;旧版为数组(读取时兼容,下次写入自然迁移) */
export type ToolInstallRecord = string[] | { files: string[]; version?: string; denyRules?: string[] };

export interface HookRegistryEntry {
  event: string;
  matcher?: string;
  timeout?: number;
  args?: string[];
  /** 脚本文件名(不含路径),用于诊断输出 */
  script: string;
  /** 当前生效的 config 条目 command(指向首个安装者的脚本路径) */
  command: string;
  /** 共享该条目的 preset id 列表 */
  refs: string[];
}

export interface InstallManifest {
  /** presetId -> tool -> 安装时写入的绝对路径列表(旧版)或 { files, version } */
  presets: Record<string, Record<string, ToolInstallRecord>>;
  /** hook 内容共享注册表(指纹 -> 条目),见 hookRegistry.ts */
  hooks?: Record<string, HookRegistryEntry>;
}

function manifestFile() {
  return join(boostHome(), "installed.json");
}

export function readManifest(): InstallManifest {
  if (!existsSync(manifestFile())) return { presets: {} };
  try {
    return JSON.parse(readFileSync(manifestFile(), "utf8")) as InstallManifest;
  } catch {
    return { presets: {} };
  }
}

function saveManifest(m: InstallManifest): void {
  ensureBoostDirs();
  writeFileIfWritable(manifestFile(), JSON.stringify(m, null, 2));
}

export function recordInstall(presetId: string, tool: string, files: string[], version?: string): void {
  const m = readManifest();
  m.presets[presetId] = m.presets[presetId] ?? {};
  const prev = m.presets[presetId][tool];
  const prevFiles = Array.isArray(prev) ? prev : (prev?.files ?? []);
  m.presets[presetId][tool] = {
    files: [...new Set([...prevFiles, ...files])],
    ...(version ? { version } : {}),
  };
  saveManifest(m);
}

export function installedFilesFor(presetId: string, tool: string): string[] {
  const rec = readManifest().presets[presetId]?.[tool];
  if (!rec) return [];
  return Array.isArray(rec) ? rec : rec.files;
}

/** 记录本端写入的原生 deny 规则(供 deactivate 精准移除,不动用户自己的规则) */
export function recordDenyRules(presetId: string, tool: string, rules: string[]): void {
  const m = readManifest();
  const rec = m.presets[presetId]?.[tool];
  if (!rec) return; // 应先有 install 记录;recordInstall 在 activate 里先跑
  if (Array.isArray(rec)) return; // 旧数组形态不含此字段,跳过(下次 recordInstall 自然迁移)
  rec.denyRules = [...new Set([...(rec.denyRules ?? []), ...rules])];
  saveManifest(m);
}

/** 本端安装时写入的 deny 规则(无记录为 []) */
export function installedDenyRulesFor(presetId: string, tool: string): string[] {
  const rec = readManifest().presets[presetId]?.[tool];
  if (!rec || Array.isArray(rec)) return [];
  return rec.denyRules ?? [];
}

/** manifest 中记录的安装版本(任一端;无记录为 undefined) */
export function recordedVersion(presetId: string): string | undefined {
  const recs = readManifest().presets[presetId] ?? {};
  for (const rec of Object.values(recs)) {
    if (rec && !Array.isArray(rec) && rec.version) return rec.version;
  }
  return undefined;
}

export function clearInstall(presetId: string, tool: string): void {
  const m = readManifest();
  delete m.presets[presetId]?.[tool];
  if (m.presets[presetId] && Object.keys(m.presets[presetId]).length === 0) delete m.presets[presetId];
  saveManifest(m);
}

// ---------------------------------------------------------------------------
// hook 共享注册表(与安装清单同文件存储)
// ---------------------------------------------------------------------------

export function readHookRegistry(): Record<string, HookRegistryEntry> {
  return readManifest().hooks ?? {};
}

export function writeHookRegistry(hooks: Record<string, HookRegistryEntry>): void {
  const m = readManifest();
  if (Object.keys(hooks).length === 0) delete m.hooks;
  else m.hooks = hooks;
  saveManifest(m);
}
