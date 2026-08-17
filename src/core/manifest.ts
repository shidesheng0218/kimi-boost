import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { boostHome, ensureBoostDirs } from "./config.js";
import { writeFileIfWritable } from "./fsguard.js";

export interface InstallManifest {
  /** presetId -> tool -> 安装时写入的绝对路径列表 */
  presets: Record<string, Record<string, string[]>>;
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

export function recordInstall(presetId: string, tool: string, files: string[]): void {
  const m = readManifest();
  m.presets[presetId] = m.presets[presetId] ?? {};
  m.presets[presetId][tool] = [...new Set([...(m.presets[presetId][tool] ?? []), ...files])];
  saveManifest(m);
}

export function installedFilesFor(presetId: string, tool: string): string[] {
  return readManifest().presets[presetId]?.[tool] ?? [];
}

export function clearInstall(presetId: string, tool: string): void {
  const m = readManifest();
  delete m.presets[presetId]?.[tool];
  if (m.presets[presetId] && Object.keys(m.presets[presetId]).length === 0) delete m.presets[presetId];
  saveManifest(m);
}
