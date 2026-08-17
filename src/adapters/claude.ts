import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import type { Adapter, AdapterContext, InstallReport } from "./types.js";
import { backupFile } from "../core/config.js";
import { clearInstall, installedFilesFor, recordInstall } from "../core/manifest.js";
import { assertManagedPath } from "../core/safety.js";

const CLAUDE_HOME = process.env.CLAUDE_CODE_HOME ?? join(homedir(), ".claude");
const CLAUDE_AGENTS = join(CLAUDE_HOME, "agents");
const CLAUDE_SKILLS = join(CLAUDE_HOME, "skills");
const HOOKS_DIR = process.env.KIMI_BOOST_HOME ? join(process.env.KIMI_BOOST_HOME, "hooks") : join(homedir(), ".kimi-boost", "hooks");

type ClaudeSettings = {
  hooks?: Record<string, Array<{ matcher?: string; hooks: Array<{ type: string; command: string; timeout?: number }> }>>;
};

function readSettings(): { path: string; data: ClaudeSettings } {
  const path = join(CLAUDE_HOME, "settings.json");
  const data = existsSync(path)
    ? (JSON.parse(readFileSync(path, "utf8")) as ClaudeSettings)
    : {};
  return { path, data };
}

function upsertClaudeHooks(data: ClaudeSettings, event: string, matcher: string | undefined, command: string, timeout?: number): boolean {
  const hooksByEvent = data.hooks ?? {};
  const matcherEntry = (hooksByEvent[event] ?? []).find((m) => m.matcher === matcher);
  if (!matcherEntry) {
    hooksByEvent[event] = [
      ...(hooksByEvent[event] ?? []),
      { matcher, hooks: [{ type: "command", command, ...(timeout !== undefined ? { timeout } : {}) }] },
    ];
    data.hooks = hooksByEvent;
    return true;
  }
  if (matcherEntry.hooks.some((h) => h.command === command)) return false;
  matcherEntry.hooks.push({ type: "command", command, ...(timeout !== undefined ? { timeout } : {}) });
  data.hooks = hooksByEvent;
  return true;
}

function copyDir(src: string, dest: string): string[] {
  const written: string[] = [];
  mkdirSync(dest, { recursive: true });
  for (const entry of readdirSync(src)) {
    const s = join(src, entry);
    const d = join(dest, entry);
    if (statSync(s).isDirectory()) {
      written.push(...copyDir(s, d));
    } else {
      writeFileSync(d, readFileSync(s));
      written.push(d);
    }
  }
  return written;
}

export const claudeAdapter: Adapter = {
  tool: "claude",

  async activate(ctx: AdapterContext): Promise<InstallReport> {
    const { preset, sourceDir } = ctx;
    const written: string[] = [];
    const configChanges: string[] = [];

    if (existsSync(join(sourceDir, "agents"))) {
      mkdirSync(CLAUDE_AGENTS, { recursive: true });
      for (const file of readdirSync(join(sourceDir, "agents"))) {
        const dest = join(CLAUDE_AGENTS, file);
        writeFileSync(dest, readFileSync(join(sourceDir, "agents", file)));
        written.push(dest);
      }
    }

    if (existsSync(join(sourceDir, "skills"))) {
      const skillRoot = join(CLAUDE_SKILLS, preset.id);
      rmSync(skillRoot, { recursive: true, force: true });
      written.push(...copyDir(join(sourceDir, "skills"), skillRoot));
      written.push(skillRoot);
    }

    if (preset.hooks.length > 0) {
      const { path, data } = readSettings();
      const backup = backupFile(path);
      if (backup) configChanges.push(backup);
      let any = false;
      for (const h of preset.hooks) {
        const scriptPath = join(HOOKS_DIR, preset.id, h.script);
        if (upsertClaudeHooks(data, h.event, h.matcher, `node "${scriptPath}"`, h.timeout)) any = true;
      }
      if (any) {
        writeFileSync(path, JSON.stringify(data, null, 2), "utf8");
        configChanges.push(path);
      }
    }

    recordInstall(preset.id, "claude", written);

    const all = [...written, ...configChanges];
    return {
      tool: "claude",
      presetId: preset.id,
      ok: true,
      message: all.length
        ? `Installed preset '${preset.id}' into Claude Code (${all.length} changes). Restart claude to apply.`
        : `Preset '${preset.id}' already active for Claude Code.`,
      changed: all,
    };
  },

  async listInstalled(): Promise<string[]> {
    const { readManifest } = await import("../core/manifest.js");
    const m = readManifest();
    return Object.keys(m.presets).filter((id) => m.presets[id]?.["claude"]);
  },

  async deactivate(presetId: string): Promise<InstallReport> {
    if (!/^[a-z0-9][a-z0-9_-]*$/.test(presetId)) {
      throw new Error(`Invalid preset id '${presetId}' (kebab-case only).`);
    }
    const changed: string[] = [];

    for (const file of installedFilesFor(presetId, "claude")) {
      if (existsSync(file)) {
        assertManagedPath(file);
        if (statSync(file).isDirectory()) rmSync(file, { recursive: true, force: true });
        else rmSync(file, { force: true });
        changed.push(file);
      }
    }
    clearInstall(presetId, "claude");

    const { path, data } = readSettings();
    const backup = backupFile(path);
    if (backup) changed.push(backup);
    const hooksByEvent = data.hooks ?? {};
    let removed = false;
    for (const event of Object.keys(hooksByEvent)) {
      const groups = hooksByEvent[event]
        .map((g) => ({
          ...g,
          hooks: g.hooks.filter((h) => !h.command.includes(`hooks${process.platform === "win32" ? "\\" : "/"}${presetId}${process.platform === "win32" ? "\\" : "/"}`)),
        }))
        .filter((g) => g.hooks.length > 0);
      if (groups.length !== hooksByEvent[event].length) removed = true;
      hooksByEvent[event] = groups;
    }
    if (removed) {
      data.hooks = hooksByEvent;
      writeFileSync(path, JSON.stringify(data, null, 2), "utf8");
      changed.push(path);
    }

    return {
      tool: "claude",
      presetId,
      ok: true,
      message: changed.length ? `Removed preset '${presetId}' from Claude Code.` : `Preset '${presetId}' was not installed for Claude Code.`,
      changed,
    };
  },
};
