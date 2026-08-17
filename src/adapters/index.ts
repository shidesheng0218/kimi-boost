import type { Adapter } from "./types.js";
import { kimiAdapter } from "./kimi.js";

const adapters: Record<string, Adapter> = {
  kimi: kimiAdapter,
};

export function getAdapter(tool: string): Adapter | undefined {
  return adapters[tool];
}

export function availableAdapters(): Adapter[] {
  return Object.values(adapters);
}
