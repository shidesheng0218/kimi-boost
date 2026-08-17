import type { PresetDefinition, ToolName } from "../core/types.js";

export interface AdapterContext {
  tool: ToolName;
  preset: PresetDefinition;
  /** preset 源目录 */
  sourceDir: string;
  /** 安装目标目录(已拷贝) */
  installDir: string;
}

export interface InstallReport {
  tool: ToolName;
  presetId: string;
  ok: boolean;
  message: string;
  changed: string[];
}

export interface Adapter {
  tool: ToolName;
  /** 把已拷贝到 installDir 的 preset 激活到该工具 */
  activate(ctx: AdapterContext): Promise<InstallReport>;
  /** 列出该工具当前安装的 preset */
  listInstalled(): Promise<string[]>;
  deactivate(presetId: string): Promise<InstallReport>;
}
