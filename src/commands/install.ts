import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { getPreset, listPresets, presetSourceDir } from "../registry/presets.js";
import { hooksDir, presetsDir } from "../core/config.js";
import { copyDirIfWritable, copyFileIfWritable, ensureDir, setDryRun } from "../core/fsguard.js";
import { detect } from "../core/detect.js";
import { kimiPluginInstalled } from "../core/kimiPlugins.js";
import { getAdapter } from "../adapters/index.js";
import type { PresetDefinition, ToolName } from "../core/types.js";
import type { InstallReport } from "../adapters/types.js";

export interface InstallOptions {
  tool?: ToolName;
  force?: boolean;
  dryRun?: boolean;
  /** 即使检测到官方 /plugins 已安装同 id,也强制写入 config.toml hooks */
  withHooks?: boolean;
  /** 覆盖 preset 来源目录(update 流程用远端解包目录替代内置 presets/),preset 定义从 <sourceDir>/preset.json 读取 */
  sourceDir?: string;
}

/** 公共步骤:把 preset 的 hooks 脚本复制到共享的 HOOKS_DIR/<id>,所有 adapter 的 hook 命令都指向这里 */
function syncHooks(preset: PresetDefinition, sourceDir: string): void {
  const srcHooks = join(sourceDir, "hooks");
  if (!existsSync(srcHooks)) return;
  const dest = join(hooksDir(), preset.id);
  ensureDir(dest);
  for (const entry of readdirSync(srcHooks)) {
    const s = join(srcHooks, entry);
    if (statSync(s).isDirectory()) continue;
    copyFileIfWritable(s, join(dest, entry));
  }
}

export async function installPreset(id: string, opts: InstallOptions = {}): Promise<InstallReport[]> {
  let preset: PresetDefinition | undefined;
  if (opts.sourceDir) {
    try {
      preset = JSON.parse(readFileSync(join(opts.sourceDir, "preset.json"), "utf8")) as PresetDefinition;
    } catch {
      throw new Error(`preset.json not readable in sourceDir: ${opts.sourceDir}`);
    }
  } else {
    preset = getPreset(id);
  }
  if (!preset) {
    const available = listPresets().map((p) => p.id).join(", ");
    throw new Error(`Preset '${id}' not found. Available: ${available}`);
  }

  const env = detect();
  const targets = (preset.tools ?? ["kimi", "claude", "codex"]).filter(
    (t) => env.tools[t]?.installed,
  );
  const explicit = opts.tool ? [opts.tool] : targets;
  if (opts.tool && !env.tools[opts.tool]?.installed) {
    console.warn(
      `[warn] '${opts.tool}' was not detected on this machine. Installing anyway — ` +
        "your config will be modified and backed up before changes.",
    );
  }
  if (explicit.length === 0) {
    throw new Error(
      "No supported CLI detected. Install Kimi Code (curl -fsSL https://code.kimi.com/kimi-code/install.sh | bash) first, or pass --tool.",
    );
  }

  const sourceDir = opts.sourceDir ?? presetSourceDir(id);

  // 双通道防护:Kimi 官方 /plugins 已装同 id 时,默认跳过 config.toml hooks
  // (plugin 自身声明 hooks),避免重复触发。--with-hooks 可强制写入。
  const viaPlugin = kimiPluginInstalled(id);
  if (viaPlugin && !opts.withHooks) {
    console.warn(
      `[warn] preset '${id}' is already installed via Kimi Code '/plugins'. ` +
        "Skipping config.toml hooks to avoid duplication. Use --with-hooks to force.",
    );
    preset = { ...preset, hooks: [] };
  }

  setDryRun(Boolean(opts.dryRun));
  const reports: InstallReport[] = [];
  try {
    syncHooks(preset, sourceDir);

    for (const tool of explicit) {
      const adapter = getAdapter(tool);
      if (!adapter) {
        reports.push({
          tool,
          presetId: id,
          ok: false,
          message: `Adapter for '${tool}' not implemented yet (coming in v0.2).`,
          changed: [],
        });
        continue;
      }

      const installDir = join(presetsDir(), id);
      ensureDir(presetsDir());
      copyDirIfWritable(sourceDir, installDir);

      try {
        reports.push(await adapter.activate({ tool, preset, sourceDir, installDir }));
      } catch (err) {
        reports.push({
          tool,
          presetId: id,
          ok: false,
          message: err instanceof Error ? err.message : String(err),
          changed: [],
        });
      }
    }
  } finally {
    setDryRun(false);
  }
  return reports;
}
