import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { BOOST_HOME, ensureBoostDirs } from "./config.js";

export interface InstallManifest {
  /** presetId -> tool -> 安装时写入的绝对路径列表 */
  presets: Record<string, Record<string, string[]>>;
}

const MANIFEST_FILE = join(BOOST_HOME, "installed.json");

export function readManifest(): InstallManifest {
  if (!existsSync(MANIFEST_FILE)) return { presets: {} };
  try {
    return JSON.parse(readFileSync(MANIFEST_FILE, "utf8")) as InstallManifest;
  } catch {
    return { presets: {} };
  }
}

function saveManifest(m: InstallManifest): void {
  ensureBoostDirs();
  writeFileSync(MANIFEST_FILE, JSON.stringify(m, null, 2), "utf8");
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
