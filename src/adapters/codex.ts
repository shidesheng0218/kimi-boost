import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { parse, stringify } from "smol-toml";
import type { Adapter, AdapterContext, InstallReport } from "./types.js";
import { backupFile } from "../core/config.js";
import { clearInstall, installedFilesFor, recordInstall } from "../core/manifest.js";
import { copyDirIfWritable, removeIfWritable, writeFileIfWritable } from "../core/fsguard.js";
import { assertManagedPath } from "../core/safety.js";

const CODEX_HOME = process.env.CODEX_HOME ?? join(homedir(), ".codex");
const CODEX_SKILLS = join(CODEX_HOME, "skills");
function boostHooksDir() {
  return process.env.KIMI_BOOST_HOME ? join(process.env.KIMI_BOOST_HOME, "hooks") : join(homedir(), ".kimi-boost", "hooks");
}

interface CodexConfig {
  path: string;
  data: Record<string, unknown>;
}

function readConfig(): CodexConfig {
  const path = join(CODEX_HOME, "config.toml");
  const data = existsSync(path) ? (parse(readFileSync(path, "utf8")) as Record<string, unknown>) : {};
  return { path, data };
}

type HooksToml = Record<string, Array<{ matcher?: string; hooks: Array<Record<string, unknown>> }>>;

function hooksOf(data: Record<string, unknown>): HooksToml {
  const h = data.hooks;
  return h && typeof h === "object" && !Array.isArray(h) ? (h as HooksToml) : {};
}

function upsertCodexHooks(data: Record<string, unknown>, event: string, matcher: string, command: string, timeout?: number): boolean {
  const hooks = hooksOf(data);
  const groups = hooks[event] ?? [];
  const matcherRe = `^${matcher}$`;
  let group = groups.find((g) => g.matcher === matcherRe);
  if (!group) {
    group = { matcher: matcherRe, hooks: [] };
    hooks[event] = [...groups, group];
  }
  if (group.hooks.some((h) => h.command === command)) return false;
  group.hooks.push({ type: "command", command, ...(timeout !== undefined ? { timeout } : {}) });
  data.hooks = hooks;
  return true;
}

function copyDir(src: string, dest: string): string[] {
  return copyDirIfWritable(src, dest);
}

export const codexAdapter: Adapter = {
  tool: "codex",

  async activate(ctx: AdapterContext): Promise<InstallReport> {
    const { preset, sourceDir } = ctx;
    const written: string[] = [];
    const configChanges: string[] = [];

    if (existsSync(join(sourceDir, "skills"))) {
      const skillRoot = join(CODEX_SKILLS, preset.id);
      removeIfWritable(skillRoot, { recursive: true, force: true });
      written.push(...copyDir(join(sourceDir, "skills"), skillRoot));
      written.push(skillRoot);
    }

    if (preset.hooks.length > 0) {
      const { path, data } = readConfig();
      const backup = backupFile(path);
      if (backup) configChanges.push(backup);
      let any = false;
      for (const h of preset.hooks) {
        const scriptPath = join(boostHooksDir(), preset.id, h.script);
        if (upsertCodexHooks(data, h.event, h.matcher ?? "", `node "${scriptPath}"`, h.timeout)) any = true;
      }
      if (any) {
        writeFileIfWritable(path, stringify(data));
        configChanges.push(path);
      }
    }

    recordInstall(preset.id, "codex", written);

    const all = [...written, ...configChanges];
    return {
      tool: "codex",
      presetId: preset.id,
      ok: true,
      message: all.length
        ? `Installed preset '${preset.id}' into Codex CLI (${all.length} changes). Restart codex to apply.`
        : `Preset '${preset.id}' already active for Codex CLI.`,
      changed: all,
    };
  },

  async listInstalled(): Promise<string[]> {
    const { readManifest } = await import("../core/manifest.js");
    const m = readManifest();
    return Object.keys(m.presets).filter((id) => m.presets[id]?.["codex"]);
  },

  async deactivate(presetId: string): Promise<InstallReport> {
    if (!/^[a-z0-9][a-z0-9_-]*$/.test(presetId)) {
      throw new Error(`Invalid preset id '${presetId}' (kebab-case only).`);
    }
    const changed: string[] = [];

    for (const file of installedFilesFor(presetId, "codex")) {
      if (existsSync(file)) {
        assertManagedPath(file);
        if (statSync(file).isDirectory()) removeIfWritable(file, { recursive: true, force: true });
        else removeIfWritable(file, { force: true });
        changed.push(file);
      }
    }
    clearInstall(presetId, "codex");

    const { path, data } = readConfig();
    const backup = backupFile(path);
    if (backup) changed.push(backup);
    const hooks = hooksOf(data);
    let removed = false;
    for (const event of Object.keys(hooks)) {
      const groups = hooks[event]
        .map((g) => ({
          ...g,
          hooks: g.hooks.filter((h) => !String(h.command).includes(`hooks${process.platform === "win32" ? "\\" : "/"}${presetId}${process.platform === "win32" ? "\\" : "/"}`)),
        }))
        .filter((g) => g.hooks.length > 0);
      if (groups.length !== hooks[event].length) removed = true;
      hooks[event] = groups;
    }
    if (removed) {
      data.hooks = hooks;
      writeFileIfWritable(path, stringify(data));
      changed.push(path);
    }

    return {
      tool: "codex",
      presetId,
      ok: true,
      message: changed.length ? `Removed preset '${presetId}' from Codex CLI.` : `Preset '${presetId}' was not installed for Codex CLI.`,
      changed,
    };
  },
};
