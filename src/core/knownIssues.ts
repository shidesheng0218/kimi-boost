export interface KnownIssueContext {
  platform: "darwin" | "linux" | "win32" | "unknown";
  kimiVersion?: string;
  pluginCount: number;
  hookEvents: string[];
}

export interface KnownIssue {
  id: string;
  url: string;
  title: string;
  severity: "warn";
  advice: string;
}

export const KNOWN_ISSUES_LAST_REVIEWED = "2026-11-20";

const KI_2553: KnownIssue = {
  id: "KI-2553",
  url: "https://github.com/MoonshotAI/kimi-cli/issues/2553",
  title: "/plugins crashes with TypeError when 2+ plugins are installed (v0.29.0, Windows)",
  severity: "warn",
  advice: "Upgrade kimi-code before managing plugins. On 0.29.0 Windows, avoid opening /plugins with two or more plugins installed.",
};

const KI_2564: KnownIssue = {
  id: "KI-2564",
  url: "https://github.com/MoonshotAI/kimi-cli/issues/2564",
  title: "PostToolUse / PostToolUseFailure hooks can be dropped by GC before completion",
  severity: "warn",
  advice: "PostToolUse guards (secret-scan-post, injection-scan) are best-effort on affected kimi-code builds. PreToolUse guardrails are unaffected. Upgrade, then re-check that PostToolUse hooks fire.",
};

function is029(version: string | undefined): boolean {
  return typeof version === "string" && /^0\.29(?:\.|$)/.test(version.trim());
}

export function knownIssueMatches(ctx: KnownIssueContext): KnownIssue[] {
  const out: KnownIssue[] = [];
  if (ctx.platform === "win32" && is029(ctx.kimiVersion) && ctx.pluginCount >= 2) out.push(KI_2553);
  if (ctx.hookEvents.includes("PostToolUse")) out.push(KI_2564);
  return out;
}