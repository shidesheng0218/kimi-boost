import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { agentsDir, hooksDir, skillsDir, backupFile } from "../core/config.js";
import { copyDirIfWritable, removeIfWritable, writeFileIfWritable, ensureDir } from "../core/fsguard.js";
import { assertManagedPath } from "../core/safety.js";
import { removePresetHooks, upsertDirArray, upsertManagedHooks, type ManagedHook } from "../core/kimiTextEdit.js";
import { parse as parseToml } from "smol-toml";
import { kimiHomeDir } from "../core/detect.js";
import type { Adapter, AdapterContext, InstallReport } from "./types.js";

function readRawConfig(): { path: string; text: string } {
  const path = join(kimiHomeDir(), "config.toml");
  return { path, text: existsSync(path) ? readFileSync(path, "utf8") : "" };
}

function mergePresetFiles(presetId: string, sourceDir: string): { skillsDir: string; agentsDir: string; hooksDir: string } {
  const sDir = join(skillsDir(), presetId);
  const aDir = join(agentsDir(), presetId);
  const hDir = join(hooksDir(), presetId);
  if (existsSync(join(sourceDir, "skills"))) copyDirIfWritable(join(sourceDir, "skills"), sDir);
  if (existsSync(join(sourceDir, "agents"))) copyDirIfWritable(join(sourceDir, "agents"), aDir);
  return { skillsDir: sDir, agentsDir: aDir, hooksDir: hDir };
}

export const kimiAdapter: Adapter = {
  tool: "kimi",

  async activate(ctx: AdapterContext): Promise<InstallReport> {
    const { preset, sourceDir } = ctx;
    const changed: string[] = [];

    const { skillsDir: sDir, agentsDir: aDir, hooksDir: hDir } = mergePresetFiles(preset.id, sourceDir);
    if (existsSync(join(sourceDir, "skills"))) changed.push(sDir);
    if (existsSync(join(sourceDir, "agents"))) changed.push(aDir);

    const { path, text } = readRawConfig();
    const backup = backupFile(path);
    if (backup) changed.push(backup);

    let result = upsertDirArray(text, "extra_skill_dirs", skillsDir());
    if (result.changed) changed.push("config.toml[extra_skill_dirs]");
    result = upsertDirArray(result.text, "extra_agent_dirs", agentsDir());
    if (result.changed) changed.push("config.toml[extra_agent_dirs]");

    if (preset.hooks.length > 0) {
      const hooks: ManagedHook[] = preset.hooks.map((h) => ({
        event: h.event,
        matcher: h.matcher,
        timeout: h.timeout,
        command: `node "${join(hDir, h.script)}"`,
      }));
      const up = upsertManagedHooks(result.text, hooks);
      if (up.added > 0) changed.push(`config.toml[[hooks]] (+${up.added})`);
      result.text = up.text;
    }

    ensureDir(dirname(path));
    writeFileIfWritable(path, result.text);

    const msg = changed.length
      ? `Installed preset '${preset.id}' into Kimi Code (${changed.join(", ")}). Run /reload or start a new session.`
      : `Preset '${preset.id}' already active for Kimi Code.`;
    return { tool: "kimi", presetId: preset.id, ok: true, message: msg, changed };
  },

  async listInstalled(): Promise<string[]> {
    const ids = new Set<string>();
    const { path, text } = readRawConfig();
    if (path) {
      try {
        const data = parseToml(text) as { hooks?: Array<{ command?: string }> };
        for (const h of data.hooks ?? []) {
          const m = (h.command ?? "").match(/hooks[\\/]([a-z0-9_-]+)[\\/]/i);
          if (m) ids.add(m[1]);
        }
      } catch {
        /* unparseable config: fall back to dir scan */
      }
    }
    for (const dir of [skillsDir(), agentsDir(), hooksDir()]) {
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

    const { path, text } = readRawConfig();
    const backup = backupFile(path);
    if (backup) changed.push(backup);

    let result = removePresetHooks(text, presetId);
    if (result.removed > 0) changed.push(`config.toml[[hooks]] (-${result.removed})`);
    // 注意:extra_skill_dirs/extra_agent_dirs 是全局挂载(所有 preset 共享),
    // 卸载单个 preset 不移除它们;只有全部 preset 卸载后可由 doctor 提示清理。
    ensureDir(dirname(path));
    writeFileIfWritable(path, result.text);

    for (const dir of [skillsDir(), agentsDir(), hooksDir()]) {
      const target = join(dir, presetId);
      assertManagedPath(target);
      if (existsSync(target)) {
        removeIfWritable(target, { recursive: true, force: true });
        changed.push(target);
      }
    }

    return {
      tool: "kimi",
      presetId,
      ok: true,
      message: changed.length ? `Removed preset '${presetId}' from Kimi Code.` : `Preset '${presetId}' was not installed.`,
      changed,
    };
  },
};
