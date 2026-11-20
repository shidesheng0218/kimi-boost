import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { kimiHomeDir } from "./detect.js";

/** Read-only view of the other tool. Detection never writes and never throws. */
export interface RelatedToolStatus {
  /** The other tool's home/state directory exists. */
  present: boolean;
  /** At least one managed marker or marker command exists in a harness config. */
  active: boolean;
  home?: string;
  markers: { kimi: boolean; claude: boolean; codex: boolean };
  problem?: string;
}

export const AGENT_GUARD_MARKER = "# >>> kimi-guard managed >>>";
export const AGENT_GUARD_COMMAND_RE = /\b(?:agentguard|kguard|kimi-guard)\s+hook\b/;

const BOOST_BEGIN = "# >>> kimi-boost managed >>>";
const BOOST_END = "# <<< kimi-boost managed <<<";

function agentGuardHome(): string {
  // An explicit override is authoritative even when the directory does not
  // exist yet — otherwise a test sandbox would fall through to the real home.
  const override = process.env.AGENT_GUARD_HOME ?? process.env.KIMI_GUARD_HOME;
  if (override && override.trim()) return override;
  const fresh = join(homedir(), ".agent-guard");
  const legacy = join(homedir(), ".kimi-guard");
  if (existsSync(fresh)) return fresh;
  if (existsSync(legacy)) return legacy;
  return fresh;
}

function kimiConfigPath(): string {
  return process.env.KIMI_CONFIG_PATH ?? join(kimiHomeDir(), "config.toml");
}

function claudeSettingsPath(): string {
  return process.env.CLAUDE_SETTINGS_PATH ?? join(process.env.CLAUDE_CODE_HOME ?? join(homedir(), ".claude"), "settings.json");
}

function codexHooksPath(): string {
  return process.env.CODEX_HOOKS_PATH ?? join(process.env.CODEX_HOME ?? join(homedir(), ".codex"), "hooks.json");
}

function readText(file: string): string {
  try {
    return readFileSync(file, "utf8");
  } catch {
    return "";
  }
}

/** Walk the Claude/Codex hook JSON shape and collect every command string. */
function commandEntries(raw: string): string[] {
  const out: string[] = [];
  if (!raw.trim()) return out;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return out;
  }
  const hooks = (parsed as { hooks?: unknown } | null)?.hooks;
  if (!hooks || typeof hooks !== "object") return out;
  for (const groups of Object.values(hooks as Record<string, unknown>)) {
    if (!Array.isArray(groups)) continue;
    for (const group of groups) {
      const handlers = (group as { hooks?: unknown } | null)?.hooks;
      if (!Array.isArray(handlers)) continue;
      for (const handler of handlers) {
        const command = (handler as { command?: unknown } | null)?.command;
        if (typeof command === "string") out.push(command);
      }
    }
  }
  return out;
}

export function detectAgentGuard(): RelatedToolStatus {
  const home = agentGuardHome();
  const markers = { kimi: false, claude: false, codex: false };
  try {
    markers.kimi = readText(kimiConfigPath()).includes(AGENT_GUARD_MARKER);
    markers.claude = commandEntries(readText(claudeSettingsPath())).some((c) => AGENT_GUARD_COMMAND_RE.test(c));
    markers.codex = commandEntries(readText(codexHooksPath())).some((c) => AGENT_GUARD_COMMAND_RE.test(c));
    return {
      present: existsSync(home),
      active: markers.kimi || markers.claude || markers.codex,
      home,
      markers,
    };
  } catch (err) {
    return {
      present: false,
      active: false,
      home,
      markers,
      problem: err instanceof Error ? err.message : String(err),
    };
  }
}

/**
 * A guard block written inside boost's managed block means one tool appended
 * without seeing the other's boundaries. Doctor reports this as an error.
 */
export function agentGuardBlockNestedInBoost(configText: string): boolean {
  const begin = configText.indexOf(BOOST_BEGIN);
  const end = configText.indexOf(BOOST_END, begin + 1);
  if (begin < 0 || end < 0) return false;
  const guard = configText.indexOf(AGENT_GUARD_MARKER, begin + 1);
  return guard > begin && guard < end;
}