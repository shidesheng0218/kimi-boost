import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { PresetDefinition } from "../core/types.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

/** 预设内容目录:兼容打包后(dist/vue3/…)与仓库源(presets/vue3)两种布局 */
export function presetsRoot(): string {
  const candidates = [
    join(__dirname),
    join(__dirname, "..", "presets"),
    join(__dirname, "..", "..", "presets"),
  ];
  for (const c of candidates) {
    try {
      for (const entry of readdirSync(c)) {
        if (existsSync(join(c, entry, "preset.json"))) return c;
      }
    } catch {
      /* not a directory */
    }
  }
  throw new Error("presets directory not found");
}

export function listPresets(): PresetDefinition[] {
  const root = presetsRoot();
  const out: PresetDefinition[] = [];
  for (const entry of readdirSync(root)) {
    const dir = join(root, entry);
    if (!statSync(dir).isDirectory()) continue;
    const file = join(dir, "preset.json");
    if (!existsSync(file)) continue;
    const def = JSON.parse(readFileSync(file, "utf8")) as PresetDefinition;
    out.push(def);
  }
  return out;
}

export function getPreset(id: string): PresetDefinition | undefined {
  return listPresets().find((p) => p.id === id);
}

export function presetSourceDir(id: string): string {
  return join(presetsRoot(), id);
}
