import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";

export interface UsageDay {
  sessions: number;
  prompts: number;
  toolCalls: number;
  startedAt?: string;
  endedAt?: string;
}

export interface UsageData {
  days: Record<string, UsageDay>;
}

export function usageFile(): string {
  const home = process.env.KIMI_BOOST_HOME ?? join(homedir(), ".kimi-boost");
  return join(home, "usage.json");
}

export function readUsage(): UsageData {
  if (!existsSync(usageFile())) return { days: {} };
  try {
    return JSON.parse(readFileSync(usageFile(), "utf8")) as UsageData;
  } catch {
    return { days: {} };
  }
}

export function today(): string {
  return new Date().toISOString().slice(0, 10);
}

export interface UsageSummary {
  day: string;
  sessions: number;
  prompts: number;
  toolCalls: number;
  minutes: number;
}

/** 近 N 天汇总(含今天) */
export function summarize(days: number): UsageSummary[] {
  const data = readUsage();
  const out: UsageSummary[] = [];
  const now = new Date();
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    const key = d.toISOString().slice(0, 10);
    const day = data.days[key];
    out.push({
      day: key,
      sessions: day?.sessions ?? 0,
      prompts: day?.prompts ?? 0,
      toolCalls: day?.toolCalls ?? 0,
      minutes: day?.startedAt && day?.endedAt
        ? Math.max(1, Math.round((Date.parse(day.endedAt) - Date.parse(day.startedAt)) / 60000))
        : 0,
    });
  }
  return out;
}
