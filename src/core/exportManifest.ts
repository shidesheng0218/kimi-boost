import type { SourceInfo } from "./sources.js";
import type { ToolName } from "./types.js";
import type { UsageData } from "./usage.js";

/**
 * export/import 的文件格式(schema 1)。
 * 一个自包含的 JSON 清单,描述一台机器上的 kimi-boost 安装状态,
 * 供在另一台机器上一键复现。--embed-content 时该 JSON 作为
 * manifest.json 与 presets/ 内容一起打进 tar.gz。
 */

export interface ExportPreset {
  id: string;
  /** 安装时记录的版本(未记录为 undefined) */
  version?: string;
  /** 安装到哪些工具 */
  tools: ToolName[];
}

export interface ExportWatch {
  enabled: boolean;
  intervalHours?: number;
}

export interface ExportManifest {
  schema: 1;
  exportedAt: string;
  /** 导出时的 kimi-boost 版本 */
  cliVersion: string;
  presets: ExportPreset[];
  /** 社区 preset 来源(id -> repo@ref),import 时据此精确重装 */
  sources: Record<string, SourceInfo>;
  watch?: ExportWatch;
  /** 可选:usage.json 历史(--include-usage) */
  usage?: UsageData;
}

export const EXPORT_SCHEMA = 1 as const;
