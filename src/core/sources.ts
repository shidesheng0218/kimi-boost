import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { boostHome } from "./config.js";
import { ensureDir, writeFileIfWritable } from "./fsguard.js";

/**
 * 社区 preset 的来源登记:install github:owner/repo 安装的 preset 记录其来源,
 * update/outdated 据此从源仓库(而非官方 registry)检查更新。
 * 存储在 ~/.kimi-boost/sources.json,独立于 installed.json manifest。
 */

export interface SourceInfo {
  /** "owner/repo" */
  repo: string;
  ref: string;
}

type SourcesMap = Record<string, SourceInfo>;

function sourcesFile(): string {
  return join(boostHome(), "sources.json");
}

export function readSources(): SourcesMap {
  try {
    const raw = JSON.parse(readFileSync(sourcesFile(), "utf8")) as unknown;
    if (raw && typeof raw === "object") return raw as SourcesMap;
  } catch {
    /* 不存在或损坏时按空处理 */
  }
  return {};
}

export function getSource(id: string): SourceInfo | undefined {
  return readSources()[id];
}

export function writeSource(id: string, info: SourceInfo): void {
  const map = readSources();
  map[id] = info;
  const file = sourcesFile();
  ensureDir(dirname(file));
  writeFileIfWritable(file, JSON.stringify(map, null, 2) + "\n");
}

export function removeSource(id: string): void {
  const map = readSources();
  if (!(id in map)) return;
  delete map[id];
  const file = sourcesFile();
  ensureDir(dirname(file));
  writeFileIfWritable(file, JSON.stringify(map, null, 2) + "\n");
}

/** 仅供测试/诊断:来源登记文件路径 */
export function sourcesFilePath(): string {
  return sourcesFile();
}
