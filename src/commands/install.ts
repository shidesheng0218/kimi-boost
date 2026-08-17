import { existsSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { getPreset, listPresets, presetSourceDir } from "../registry/presets.js";
import { hooksDir, presetsDir } from "../core/config.js";
import { copyDirIfWritable, copyFileIfWritable, ensureDir, setDryRun } from "../core/fsguard.js";
import { detect } from "../core/detect.js";
import { getAdapter } from "../adapters/index.js";
import type { PresetDefinition, ToolName } from "../core/types.js";
import type { InstallReport } from "../adapters/types.js";

export interface InstallOptions {
  tool?: ToolName;
  force?: boolean;
  dryRun?: boolean;
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
  const preset = getPreset(id);
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

  const sourceDir = presetSourceDir(id);

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
