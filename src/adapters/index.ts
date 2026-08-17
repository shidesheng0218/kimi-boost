import type { Adapter } from "./types.js";
import { kimiAdapter } from "./kimi.js";
import { claudeAdapter } from "./claude.js";

const adapters: Record<string, Adapter> = {
  kimi: kimiAdapter,
  claude: claudeAdapter,
};

export function getAdapter(tool: string): Adapter | undefined {
  return adapters[tool];
}

export function availableAdapters(): Adapter[] {
  return Object.values(adapters);
}
