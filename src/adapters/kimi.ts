import { existsSync, mkdirSync, rmSync, statSync, copyFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import {
  AGENTS_DIR,
  HOOKS_DIR,
  SKILLS_DIR,
  backupFile,
  mountBoostDirs,
  readKimiConfig,
  saveKimiConfig,
  upsertKimiHooks,
} from "../core/config.js";
import { assertManagedPath } from "../core/safety.js";
import type { Adapter, AdapterContext, InstallReport } from "./types.js";

function copyDir(src: string, dest: string): void {
  mkdirSync(dest, { recursive: true });
  for (const entry of readdirSync(src)) {
    const s = join(src, entry);
    const d = join(dest, entry);
    if (statSync(s).isDirectory()) copyDir(s, d);
    else copyFileSync(s, d);
  }
}

function mergePresetFiles(presetId: string, sourceDir: string): { skillsDir: string; agentsDir: string; hooksDir: string } {
  const skillsDir = join(SKILLS_DIR, presetId);
  const agentsDir = join(AGENTS_DIR, presetId);
  const hooksDir = join(HOOKS_DIR, presetId);
  if (existsSync(join(sourceDir, "skills"))) copyDir(join(sourceDir, "skills"), skillsDir);
  if (existsSync(join(sourceDir, "agents"))) copyDir(join(sourceDir, "agents"), agentsDir);
  return { skillsDir, agentsDir, hooksDir };
}

export const kimiAdapter: Adapter = {
  tool: "kimi",

  async activate(ctx: AdapterContext): Promise<InstallReport> {
    const { preset, sourceDir } = ctx;
    const changed: string[] = [];

    const { hooksDir } = mergePresetFiles(preset.id, sourceDir);
    changed.push(hooksDir);

    const config = readKimiConfig();
    const backup = backupFile(config.path);
    if (backup) changed.push(backup);

    if (mountBoostDirs(config)) changed.push("config.toml[extra_skill_dirs/extra_agent_dirs]");

    if (preset.hooks.length > 0) {
      const hookEntries = preset.hooks.map((h) => ({
        event: h.event,
        matcher: h.matcher,
        timeout: h.timeout,
        command: `node "${join(hooksDir, h.script)}"`,
      }));
      if (upsertKimiHooks(config, hookEntries)) changed.push(`config.toml[[hooks]] (${preset.hooks.length})`);
    }

    saveKimiConfig(config);

    const msg = changed.length
      ? `Installed preset '${preset.id}' into Kimi Code (${changed.join(", ")}). Run /reload or start a new session.`
      : `Preset '${preset.id}' already active for Kimi Code.`;
    return { tool: "kimi", presetId: preset.id, ok: true, message: msg, changed };
  },

  async listInstalled(): Promise<string[]> {
    const config = readKimiConfig();
    const hooks = config.data.hooks as Array<Record<string, unknown>> | undefined;
    const ids = new Set<string>();
    for (const h of hooks ?? []) {
      const cmd = String(h.command ?? "");
      const m = cmd.match(/hooks[\\/]([a-z0-9_-]+)[\\/]/i);
      if (m) ids.add(m[1]);
    }
    const dirs = [SKILLS_DIR, AGENTS_DIR, HOOKS_DIR];
    for (const dir of dirs) {
      if (existsSync(dir)) {
        for (const entry of readdirSync(dir)) {
          if (statSync(join(dir, entry)).isDirectory()) ids.add(entry);
        }
      }
    }
    return [...ids];
  },

  async deactivate(presetId: string): Promise<InstallReport> {
    if (!/^[a-z0-9][a-z0-9_-]*$/.test(presetId)) {
      throw new Error(`Invalid preset id '${presetId}' (kebab-case only).`);
    }
    const changed: string[] = [];
    const config = readKimiConfig();
    const backup = backupFile(config.path);
    if (backup) changed.push(backup);

    const before = new Set((config.data.hooks as Array<Record<string, unknown>> | undefined)?.map((h) => String(h.command)) ?? []);
    const remaining = (config.data.hooks as Array<Record<string, unknown>> | undefined)?.filter(
      (h) => !String(h.command).includes(`hooks${process.platform === "win32" ? "\\" : "/"}${presetId}${process.platform === "win32" ? "\\" : "/"}`),
    ) ?? [];
    const after = new Set(remaining.map((h) => String(h.command)));
    if (remaining.length !== before.size) {
      config.data.hooks = remaining;
      changed.push(`config.toml[[hooks]] (${before.size - after.size} removed)`);
    }

    for (const dir of [SKILLS_DIR, AGENTS_DIR, HOOKS_DIR]) {
      const target = join(dir, presetId);
      assertManagedPath(target);
      if (existsSync(target)) {
        rmSync(target, { recursive: true, force: true });
        changed.push(target);
      }
    }

    saveKimiConfig(config);

    return {
      tool: "kimi",
      presetId,
      ok: true,
      message: changed.length ? `Removed preset '${presetId}' from Kimi Code.` : `Preset '${presetId}' was not installed.`,
      changed,
    };
  },
};
