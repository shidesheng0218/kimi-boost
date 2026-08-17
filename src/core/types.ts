export type ToolName = "kimi" | "claude" | "codex";

export type Platform = "darwin" | "win32" | "linux" | "unknown";

export interface ToolEnv {
  tool: ToolName;
  installed: boolean;
  version?: string;
  /** 配置主目录,如 ~/.kimi-code */
  homeDir: string;
  /** 用户级配置目录是否存在 */
  configured: boolean;
}

export interface DetectResult {
  platform: Platform;
  tools: Record<ToolName, ToolEnv>;
}

export interface PresetDefinition {
  id: string;
  name: string;
  description: string;
  /** 标签,如 vue, frontend */
  tags: string[];
  /** 面向的工具,默认全部支持 */
  tools?: ToolName[];
  /** 需要写入各工具配置的 hook 规则(纯数据,由 adapter 翻译) */
  hooks: PresetHook[];
  /** 技能/agent 相对路径(预设目录内) */
  skillsDir?: string;
  agentsDir?: string;
  /** 是否提供 kimi.plugin.json(插件形态) */
  asPlugin?: boolean;
  docs?: string;
}

export interface PresetHook {
  event: string;
  matcher?: string;
  /** 相对 preset 根目录的脚本路径 */
  script: string;
  timeout?: number;
}

export interface InstalledPreset {
  id: string;
  version: string;
  installedAt: string;
  tools: ToolName[];
}

export interface MarketplacePlugin {
  id: string;
  name: string;
  description: string;
  source: string;
  tags: string[];
  version?: string;
  tools?: ToolName[];
}
