import { detect } from "../core/detect.js";
import { availableAdapters } from "../adapters/index.js";
import { listPresets } from "../registry/presets.js";

export interface StatusLine {
  platform: string;
  tools: Array<{ name: string; installed: boolean; version?: string; homeDir: string; configured: boolean }>;
}

export interface PresetMatrixEntry {
  id: string;
  /** 仓库内 preset.json 的最新版本(未知为 "?") */
  latest: string;
  /** 各端安装状态:kimi / claude / codex */
  tools: Record<string, boolean>;
}

const TOOL_ORDER = ["kimi", "claude", "codex"] as const;

export function getStatus(): StatusLine {
  const env = detect();
  return {
    platform: env.platform,
    tools: (["kimi", "claude", "codex"] as const).map((t) => ({
      name: t,
      installed: env.tools[t].installed,
      version: env.tools[t].version,
      homeDir: env.tools[t].homeDir,
      configured: env.tools[t].configured,
    })),
  };
}

/** 三端安装状态矩阵:行=任一端已安装的预设,列=各端是否安装 */
export async function getPresetMatrix(): Promise<PresetMatrixEntry[]> {
  const latest = new Map(listPresets().map((p) => [p.id, p.version ?? "0.0.0"]));
  const installedByTool: Record<string, Set<string>> = {};
  await Promise.all(
    availableAdapters().map(async (a) => {
      // 某端未安装/配置损坏时按"无安装"处理,不影响其他端的展示
      const ids = await a.listInstalled().catch(() => [] as string[]);
      installedByTool[a.tool] = new Set(ids);
    }),
  );
  const ids = new Set<string>();
  for (const s of Object.values(installedByTool)) {
    for (const id of s) ids.add(id);
  }
  return [...ids].sort().map((id) => ({
    id,
    latest: latest.get(id) ?? "?",
    tools: Object.fromEntries(TOOL_ORDER.map((t) => [t, installedByTool[t]?.has(id) ?? false])),
  }));
}

/** 渲染矩阵为等宽表格(供 CLI 直接打印) */
export function renderPresetMatrix(rows: PresetMatrixEntry[]): string {
  const headers = ["Preset", "Latest", "Kimi Code", "Claude Code", "Codex"];
  const cells = rows.map((r) => [
    r.id,
    r.latest,
    r.tools.kimi ? "✓" : "—",
    r.tools.claude ? "✓" : "—",
    r.tools.codex ? "✓" : "—",
  ]);
  const widths = headers.map((h, i) => Math.max(h.length, ...cells.map((c) => c[i].length)));
  const line = (cols: string[]) => cols.map((c, i) => c.padEnd(widths[i])).join("  ").trimEnd();
  return [line(headers), ...cells.map(line)].join("\n");
}
