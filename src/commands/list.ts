import { existsSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { HOOKS_DIR, SKILLS_DIR, AGENTS_DIR } from "../core/config.js";
import { getAdapter } from "../adapters/index.js";
import { detect } from "../core/detect.js";
import { listPresets } from "../registry/presets.js";

export interface ListItem {
  id: string;
  installed: boolean;
  tools: string[];
  description: string;
}

export async function listStatus(): Promise<{ presets: ListItem[]; installedOnly: string[] }> {
  const presets = listPresets();
  const env = detect();

  const installedOnly = new Set<string>();
  for (const tool of ["kimi", "claude", "codex"] as const) {
    if (!env.tools[tool].installed) continue;
    const adapter = getAdapter(tool);
    if (!adapter) continue;
    for (const id of await adapter.listInstalled()) installedOnly.add(id);
  }

  const items: ListItem[] = presets.map((p) => ({
    id: p.id,
    installed: installedOnly.has(p.id),
    tools: (p.tools ?? ["kimi", "claude", "codex"]).filter((t) => env.tools[t]?.installed),
    description: p.description,
  }));

  return { presets: items, installedOnly: [...installedOnly] };
}
