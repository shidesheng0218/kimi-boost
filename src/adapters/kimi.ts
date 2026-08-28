import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { agentsDir, hooksDir, skillsDir, backupFile } from "../core/config.js";
import { copyDirIfWritable, removeIfWritable, writeFileIfWritable, ensureDir } from "../core/fsguard.js";
import { assertManagedPath } from "../core/safety.js";
import { removePresetHooks, retargetHookCommand, upsertDirArray, upsertManagedHooks, type ManagedHook } from "../core/kimiTextEdit.js";
import { parse as parseToml } from "smol-toml";
import { kimiHomeDir } from "../core/detect.js";
import { getPreset } from "../registry/presets.js";
import { readMcpFile, removeMcpServers, saveMcpFile, upsertMcpServers } from "../core/kimiMcp.js";
import { recordInstall, clearInstall, readHookRegistry, writeHookRegistry } from "../core/manifest.js";
import { claimPresetHooks, fingerprintPresetHooks, releasePresetRefs } from "../core/hookRegistry.js";
import type { PresetHook } from "../core/types.js";
import type { Adapter, AdapterContext, InstallReport } from "./types.js";

function getPresetSafe(id: string) {
  try {
    return getPreset(id);
  } catch {
    return undefined;
  }
}

function readRawConfig(): { path: string; text: string } {
  const path = join(kimiHomeDir(), "config.toml");
  return { path, text: existsSync(path) ? readFileSync(path, "utf8") : "" };
}

function buildHookCommand(hooksBase: string, h: PresetHook): string {
  return `node "${join(hooksBase, h.script)}"${h.args && h.args.length ? ` ${h.args.join(" ")}` : ""}`;
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

    const { skillsDir: sDir, agentsDir: aDir } = mergePresetFiles(preset.id, sourceDir);
    if (existsSync(join(sourceDir, "skills"))) changed.push(sDir);
    if (existsSync(join(sourceDir, "agents"))) changed.push(aDir);

    const { path, text } = readRawConfig();
    const backup = backupFile(path);
    if (backup) changed.push(backup);

    let result = upsertDirArray(text, "extra_skill_dirs", skillsDir());
    if (result.changed) changed.push("config.toml[extra_skill_dirs]");
    result = upsertDirArray(result.text, "extra_agent_dirs", agentsDir());
    if (result.changed) changed.push("config.toml[extra_agent_dirs]");

    // hook 内容去重:先释放本预设旧引用(keepFps 之外的,处理升级/内容变更),
    // 重定向仍被共享的条目,清掉 refs 耗尽的陈旧条目,再按指纹重新认领
    const registry = readHookRegistry();
    const fps = fingerprintPresetHooks(sourceDir, preset.hooks);
    const released = releasePresetRefs(registry, preset.id, new Set(fps.filter((f): f is string => Boolean(f))));
    let nextText = result.text;
    for (const r of released) {
      if (!r.newCommand) continue;
      const ret = retargetHookCommand(nextText, r.oldCommand, r.newCommand);
      if (ret.changed) {
        nextText = ret.text;
        changed.push("config.toml[[hooks]] (retargeted to shared owner)");
      }
    }
    if (released.length > 0) {
      const rm = removePresetHooks(nextText, preset.id);
      if (rm.removed > 0) changed.push(`config.toml[[hooks]] (-${rm.removed} stale)`);
      nextText = rm.text;
    }

    let sharedCount = 0;
    let registryChanged = released.length > 0;
    if (preset.hooks.length > 0) {
      const claim = claimPresetHooks(registry, preset.id, fps, preset.hooks, (pid, h) =>
        buildHookCommand(join(hooksDir(), pid), h),
      );
      sharedCount = claim.sharedCount;
      registryChanged = registryChanged || claim.registryChanged;
      const hooks: ManagedHook[] = claim.entries.map((h) => ({
        event: h.event,
        matcher: h.matcher,
        timeout: h.timeout,
        command: h.command,
      }));
      const up = upsertManagedHooks(nextText, hooks);
      if (up.added > 0) changed.push(`config.toml[[hooks]] (+${up.added})`);
      nextText = up.text;
    }
    if (registryChanged) writeHookRegistry(registry);

    if (preset.mcpServers && Object.keys(preset.mcpServers).length > 0) {
      const mcp = readMcpFile();
      const up = upsertMcpServers(mcp, preset.mcpServers);
      if (up.changed) {
        saveMcpFile(mcp);
        changed.push(`mcp.json mcpServers (+${up.added.length}: ${up.added.join(", ")})`);
      }
    }

    ensureDir(dirname(path));
    writeFileIfWritable(path, nextText);

    recordInstall(preset.id, "kimi", [sDir, aDir].filter((d) => existsSync(d)), preset.version);

    const sharedNote = sharedCount > 0 ? ` (${sharedCount} hook(s) shared with already-installed presets)` : "";
    const msg = changed.length
      ? `Installed preset '${preset.id}' into Kimi Code (${changed.join(", ")}). Run /reload or start a new session.${sharedNote}`
      : `Preset '${preset.id}' already active for Kimi Code.${sharedNote}`;
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

    // hook 共享注册表:先重定向仍被其他预设共享的条目(改指下一个共享者的脚本副本),
    // 再做路径级移除——顺序不能反,否则共享条目会被误删
    const registry = readHookRegistry();
    const released = releasePresetRefs(registry, presetId);
    let working = text;
    for (const r of released) {
      if (!r.newCommand) continue;
      const ret = retargetHookCommand(working, r.oldCommand, r.newCommand);
      if (ret.changed) {
        working = ret.text;
        changed.push("config.toml[[hooks]] (retargeted to shared owner)");
      }
    }
    if (released.length > 0) writeHookRegistry(registry);

    const result = removePresetHooks(working, presetId);
    if (result.removed > 0) changed.push(`config.toml[[hooks]] (-${result.removed})`);
    // 注意:extra_skill_dirs/extra_agent_dirs 是全局挂载(所有 preset 共享),
    // 卸载单个 preset 不移除它们;只有全部 preset 卸载后可由 doctor 提示清理。

    const presetDef = getPresetSafe(presetId);
    if (presetDef?.mcpServers) {
      const mcp = readMcpFile();
      const rm = removeMcpServers(mcp, Object.keys(presetDef.mcpServers));
      if (rm.changed) {
        saveMcpFile(mcp);
        changed.push(`mcp.json mcpServers (-${rm.removed.length})`);
      }
    }
    ensureDir(dirname(path));
    writeFileIfWritable(path, result.text);

    clearInstall(presetId, "kimi");

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
