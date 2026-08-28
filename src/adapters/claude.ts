import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import type { Adapter, AdapterContext, InstallReport } from "./types.js";
import { backupFile } from "../core/config.js";
import { clearInstall, installedFilesFor, readHookRegistry, recordInstall, writeHookRegistry } from "../core/manifest.js";
import { claimPresetHooks, fingerprintPresetHooks, hookCommandOwner, releasePresetRefs } from "../core/hookRegistry.js";
import { copyDirIfWritable, ensureDir as mkdirSyncSafe, removeIfWritable, writeFileIfWritable } from "../core/fsguard.js";
import { assertManagedPath } from "../core/safety.js";
import type { PresetHook } from "../core/types.js";

const CLAUDE_HOME = process.env.CLAUDE_CODE_HOME ?? join(homedir(), ".claude");
const CLAUDE_AGENTS = join(CLAUDE_HOME, "agents");
const CLAUDE_SKILLS = join(CLAUDE_HOME, "skills");
function boostHooksDir() {
  return process.env.KIMI_BOOST_HOME ? join(process.env.KIMI_BOOST_HOME, "hooks") : join(homedir(), ".kimi-boost", "hooks");
}

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

/** 对 settings.json 中每条 hook command 应用变换:返回新 command 改写、undefined 删除、原值保留 */
function transformClaudeHooks(data: ClaudeSettings, fn: (command: string) => string | undefined): boolean {
  let changed = false;
  const hooksByEvent = data.hooks ?? {};
  for (const event of Object.keys(hooksByEvent)) {
    const groups = (hooksByEvent[event] ?? [])
      .map((g) => ({
        ...g,
        hooks: g.hooks.flatMap((h) => {
          const next = fn(h.command);
          if (next === undefined) {
            changed = true;
            return [];
          }
          if (next !== h.command) {
            changed = true;
            return [{ ...h, command: next }];
          }
          return [h];
        }),
      }))
      .filter((g) => g.hooks.length > 0);
    if (groups.length !== (hooksByEvent[event] ?? []).length) changed = true;
    hooksByEvent[event] = groups;
  }
  if (changed) data.hooks = hooksByEvent;
  return changed;
}

function buildHookCommand(hooksBase: string, h: PresetHook): string {
  return `node "${join(hooksBase, h.script)}"${h.args && h.args.length ? ` ${h.args.join(" ")}` : ""}`;
}

function copyDir(src: string, dest: string): string[] {
  return copyDirIfWritable(src, dest);
}

export const claudeAdapter: Adapter = {
  tool: "claude",

  async activate(ctx: AdapterContext): Promise<InstallReport> {
    const { preset, sourceDir } = ctx;
    const written: string[] = [];
    const configChanges: string[] = [];

    if (existsSync(join(sourceDir, "agents"))) {
      mkdirSyncSafe(CLAUDE_AGENTS);
      for (const file of readdirSync(join(sourceDir, "agents"))) {
        const dest = join(CLAUDE_AGENTS, file);
        writeFileIfWritable(dest, readFileSync(join(sourceDir, "agents", file)));
        written.push(dest);
      }
    }

    if (existsSync(join(sourceDir, "skills"))) {
      const skillRoot = join(CLAUDE_SKILLS, preset.id);
      removeIfWritable(skillRoot, { recursive: true, force: true });
      written.push(...copyDir(join(sourceDir, "skills"), skillRoot));
      written.push(skillRoot);
    }

    // hook 内容去重:释放本预设旧引用(keepFps 之外的)→ 重定向/清理 config 条目 → 重新认领。
    // 需要动 settings.json 的两种情况:本预设带 hooks,或释放动作需要重定向/清理陈旧条目
    const registry = readHookRegistry();
    const fps = fingerprintPresetHooks(sourceDir, preset.hooks);
    const released = releasePresetRefs(registry, preset.id, new Set(fps.filter((f): f is string => Boolean(f))));

    if (preset.hooks.length > 0 || released.length > 0) {
      const { path, data } = readSettings();
      const backup = backupFile(path);
      if (backup) configChanges.push(backup);

      const retargets = new Map(released.filter((r) => r.newCommand).map((r) => [r.oldCommand, r.newCommand!]));
      transformClaudeHooks(data, (cmd) => {
        const t = retargets.get(cmd);
        if (t) return t;
        return hookCommandOwner(cmd) === preset.id ? undefined : cmd;
      });

      const claim = claimPresetHooks(registry, preset.id, fps, preset.hooks, (pid, h) =>
        buildHookCommand(join(boostHooksDir(), pid), h),
      );
      for (const w of claim.entries) {
        upsertClaudeHooks(data, w.event, w.matcher, w.command, w.timeout);
      }
      if (claim.registryChanged || released.length > 0) writeHookRegistry(registry);

      writeFileIfWritable(path, JSON.stringify(data, null, 2));
      configChanges.push(path);
    }

    recordInstall(preset.id, "claude", written, preset.version);

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
        if (statSync(file).isDirectory()) removeIfWritable(file, { recursive: true, force: true });
        else removeIfWritable(file, { force: true });
        changed.push(file);
      }
    }
    clearInstall(presetId, "claude");

    // hook 共享注册表:先重定向仍被共享的条目,再删除本预设拥有的条目(顺序不能反)
    const registry = readHookRegistry();
    const released = releasePresetRefs(registry, presetId);
    if (released.length > 0) writeHookRegistry(registry);

    const { path, data } = readSettings();
    const backup = backupFile(path);
    if (backup) changed.push(backup);
    const retargets = new Map(released.filter((r) => r.newCommand).map((r) => [r.oldCommand, r.newCommand!]));
    const removed = transformClaudeHooks(data, (cmd) => {
      const t = retargets.get(cmd);
      if (t) return t;
      return hookCommandOwner(cmd) === presetId ? undefined : cmd;
    });
    if (removed) {
      writeFileIfWritable(path, JSON.stringify(data, null, 2));
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
