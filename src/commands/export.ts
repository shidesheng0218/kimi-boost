import { cpSync, existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import * as tar from "tar";
import pc from "picocolors";
import { presetsDir } from "../core/config.js";
import { readManifest } from "../core/manifest.js";
import { readSources } from "../core/sources.js";
import { readUsage } from "../core/usage.js";
import type { ExportManifest, ExportPreset } from "../core/exportManifest.js";
import type { ToolName } from "../core/types.js";
import { getWatchState } from "./updateWatch.js";

/**
 * export 命令:把本机 kimi-boost 的安装状态(preset + 版本 + 社区来源 + watch)
 * 导出为单个文件,供在另一台机器上 `kimi-boost import` 一键复现。
 */

export interface ExportOptions {
  /** 输出文件路径 */
  out?: string;
  /** 打包 preset 内容为 tar.gz(离线精确复现,含本地修改) */
  embedContent?: boolean;
  /** 携带 usage.json 历史 */
  includeUsage?: boolean;
  cliVersion: string;
}

const DEFAULT_JSON = "kimi-boost-export.json";
const DEFAULT_TGZ = "kimi-boost-export.tar.gz";

export function buildExportManifest(opts: { includeUsage?: boolean; cliVersion: string }): ExportManifest {
  const manifest = readManifest();
  const presets: ExportPreset[] = Object.entries(manifest.presets)
    .map(([id, perTool]) => {
      const tools = (Object.keys(perTool) as ToolName[]).sort();
      const firstRec = Object.values(perTool)[0];
      const version = firstRec && !Array.isArray(firstRec) ? firstRec.version : undefined;
      return { id, version, tools };
    })
    .sort((a, b) => a.id.localeCompare(b.id));

  const allSources = readSources();
  const installedIds = new Set(presets.map((p) => p.id));
  // 只导出已安装 preset 的来源(孤儿来源条目无意义且会误导社区计数)
  const sources = Object.fromEntries(Object.entries(allSources).filter(([id]) => installedIds.has(id)));

  const out: ExportManifest = {
    schema: 1,
    exportedAt: new Date().toISOString(),
    cliVersion: opts.cliVersion,
    presets,
    sources,
    watch: getWatchState(),
  };
  if (opts.includeUsage) out.usage = readUsage();
  return out;
}

export async function runExport(opts: ExportOptions): Promise<void> {
  const manifest = buildExportManifest({ includeUsage: opts.includeUsage, cliVersion: opts.cliVersion });
  const communityCount = Object.keys(manifest.sources).length;

  if (opts.embedContent) {
    const out = resolve(opts.out ?? DEFAULT_TGZ);
    const stage = mkdtempSync(join(tmpdir(), "kboost-export-"));
    try {
      writeFileSync(join(stage, "manifest.json"), JSON.stringify(manifest, null, 2) + "\n", "utf8");
      const store = presetsDir();
      const entries = ["manifest.json"];
      if (existsSync(store)) {
        mkdirSync(join(stage, "presets"), { recursive: true });
        cpSync(store, join(stage, "presets"), { recursive: true });
        entries.push("presets");
      }
      await tar.c({ gzip: true, file: out, cwd: stage }, entries);
    } finally {
      rmSync(stage, { recursive: true, force: true });
    }
    console.log(`${pc.green("✓")} 已导出 ${out}`);
  } else {
    const out = resolve(opts.out ?? DEFAULT_JSON);
    writeFileSync(out, JSON.stringify(manifest, null, 2) + "\n", "utf8");
    console.log(`${pc.green("✓")} 已导出 ${out}`);
  }

  console.log(
    pc.dim(
      `  ${manifest.presets.length} 个 preset(其中 ${communityCount} 个社区 preset)` +
        `${manifest.watch?.enabled ? ",含后台检查" : ""}${manifest.usage ? ",含用量历史" : ""}`,
    ),
  );
  console.log(pc.dim(`  在另一台机器上运行 kimi-boost import ${opts.out ?? (opts.embedContent ? DEFAULT_TGZ : DEFAULT_JSON)} 即可复现。`));
}
