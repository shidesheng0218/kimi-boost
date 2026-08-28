import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { parse } from "smol-toml";
import { kimiHomeDir } from "./detect.js";
import { copyFileIfWritable, ensureDir } from "./fsguard.js";

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

/** 本地预设存储(~/.kimi-boost/presets/<id>/preset.json)中记录的已安装版本 */
export function storedPresetVersion(id: string): string | undefined {
  const file = join(presetsDir(), id, "preset.json");
  if (!existsSync(file)) return undefined;
  try {
    return (JSON.parse(readFileSync(file, "utf8")) as { version?: string }).version;
  } catch {
    return undefined;
  }
}
