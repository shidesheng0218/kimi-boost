import type { Adapter } from "./types.js";
import { kimiAdapter } from "./kimi.js";
import { claudeAdapter } from "./claude.js";
import { codexAdapter } from "./codex.js";

const adapters: Record<string, Adapter> = {
  kimi: kimiAdapter,
  claude: claudeAdapter,
  codex: codexAdapter,
};

export function getAdapter(tool: string): Adapter | undefined {
  return adapters[tool];
}

export function availableAdapters(): Adapter[] {
  return Object.values(adapters);
}
