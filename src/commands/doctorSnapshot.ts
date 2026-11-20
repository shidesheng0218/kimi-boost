import { knownIssueMatches, KNOWN_ISSUES_LAST_REVIEWED, type KnownIssue } from "../core/knownIssues.js";

export interface SnapshotIssue {
  level: "ok" | "warn" | "error";
  item: string;
  detail: string;
}

export interface DoctorSnapshot {
  generatedAt: string;
  platform: string;
  tools: Record<string, { installed: boolean; version?: string; home: string }>;
  plugins: { count: number; ids: string[] };
  hooks: { kimi: { byEvent: Record<string, number>; managed: number } };
  knownIssues: KnownIssue[];
  issues: SnapshotIssue[];
  redaction: { applied: boolean; replacements: number };
  lastReviewed: string;
}

export function buildDoctorSnapshot(input: {
  issues: SnapshotIssue[];
  platform: "darwin" | "linux" | "win32" | "unknown";
  tools: DoctorSnapshot["tools"];
  pluginIds: string[];
  hookEvents: string[];
  byEvent: Record<string, number>;
  now?: number;
}): DoctorSnapshot {
  const managed = Object.values(input.byEvent).reduce((a, n) => a + n, 0);
  const knownIssues = knownIssueMatches({
    platform: input.platform,
    kimiVersion: input.tools["kimi"]?.version,
    pluginCount: input.pluginIds.length,
    hookEvents: input.hookEvents,
  });
  return {
    generatedAt: new Date(input.now ?? Date.now()).toISOString(),
    platform: input.platform,
    tools: input.tools,
    plugins: { count: input.pluginIds.length, ids: [...input.pluginIds] },
    hooks: { kimi: { byEvent: { ...input.byEvent }, managed } },
    knownIssues,
    issues: input.issues,
    redaction: { applied: false, replacements: 0 },
    lastReviewed: KNOWN_ISSUES_LAST_REVIEWED,
  };
}

function redactString(value: string, homeDirs: string[]): { value: string; count: number } {
  let out = value;
  let count = 0;
  for (const home of homeDirs) {
    if (!home) continue;
    const parts = out.split(home);
    if (parts.length > 1) {
      count += parts.length - 1;
      out = parts.join("~");
    }
  }
  const patterns = [/\/Users\/[^/\s"']+/g, /\/home\/[^/\s"']+/g, /[A-Za-z]:\\Users\\[^\\\s"']+/g];
  for (const re of patterns) {
    out = out.replace(re, () => {
      count++;
      return "~";
    });
  }
  return { value: out, count };
}

function walk(value: unknown, homeDirs: string[], counter: { n: number }): unknown {
  if (typeof value === "string") {
    const r = redactString(value, homeDirs);
    counter.n += r.count;
    return r.value;
  }
  if (Array.isArray(value)) return value.map((v) => walk(v, homeDirs, counter));
  if (value !== null && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) out[k] = walk(v, homeDirs, counter);
    return out;
  }
  return value;
}

/** Recursively redact home/user-directory paths from every string in the snapshot. */
export function redactSnapshot(s: DoctorSnapshot, homeDirs: string[]): DoctorSnapshot {
  const counter = { n: 0 };
  const out = walk(s, homeDirs, counter) as DoctorSnapshot;
  out.redaction = { applied: true, replacements: counter.n };
  return out;
}