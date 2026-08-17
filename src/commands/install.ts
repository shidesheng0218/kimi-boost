import { copyFileSync, mkdirSync, readdirSync, statSync, existsSync } from "node:fs";
import { join } from "node:path";
import { getPreset, listPresets, presetSourceDir } from "../registry/presets.js";
import { PRESETS_DIR } from "../core/config.js";
import { detect } from "../core/detect.js";
import { getAdapter } from "../adapters/index.js";
import type { ToolName } from "../core/types.js";
import type { InstallReport } from "../adapters/types.js";

export interface InstallOptions {
  tool?: ToolName;
  force?: boolean;
}

function copyDir(src: string, dest: string): void {
  mkdirSync(dest, { recursive: true });
  for (const entry of readdirSync(src)) {
    const s = join(src, entry);
    const d = join(dest, entry);
    if (statSync(s).isDirectory()) copyDir(s, d);
    else copyFileSync(s, d);
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
  if (explicit.length === 0) {
    throw new Error(
      "No supported CLI detected. Install Kimi Code (curl -fsSL https://code.kimi.com/kimi-code/install.sh | bash) first, or pass --tool.",
    );
  }

  const reports: InstallReport[] = [];
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

    const installDir = join(PRESETS_DIR, id);
    mkdirSync(PRESETS_DIR, { recursive: true });
    copyDir(presetSourceDir(id), installDir);

    try {
      reports.push(await adapter.activate({ tool, preset, sourceDir: presetSourceDir(id), installDir }));
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
  return reports;
}
