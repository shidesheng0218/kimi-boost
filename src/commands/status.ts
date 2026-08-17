import { detect } from "../core/detect.js";

export interface StatusLine {
  platform: string;
  tools: Array<{ name: string; installed: boolean; version?: string; homeDir: string; configured: boolean }>;
}

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
