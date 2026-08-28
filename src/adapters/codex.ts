import { existsSync, readFileSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { parse, stringify } from "smol-toml";
import type { Adapter, AdapterContext, InstallReport } from "./types.js";
import { backupFile } from "../core/config.js";
import { clearInstall, installedFilesFor, readHookRegistry, recordInstall, writeHookRegistry } from "../core/manifest.js";
import { claimPresetHooks, fingerprintPresetHooks, hookCommandOwner, releasePresetRefs } from "../core/hookRegistry.js";
import { copyDirIfWritable, removeIfWritable, writeFileIfWritable } from "../core/fsguard.js";
import { assertManagedPath } from "../core/safety.js";
import type { PresetHook } from "../core/types.js";

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

/** 对 config 中每条 hook command 应用变换:返回新 command 改写、undefined 删除、原值保留 */
function transformCodexHooks(data: Record<string, unknown>, fn: (command: string) => string | undefined): boolean {
  let changed = false;
  const hooks = hooksOf(data);
  for (const event of Object.keys(hooks)) {
    const groups = (hooks[event] ?? [])
      .map((g) => ({
        ...g,
        hooks: g.hooks.flatMap((h) => {
          const cmd = String(h.command);
          const next = fn(cmd);
          if (next === undefined) {
            changed = true;
            return [];
          }
          if (next !== cmd) {
            changed = true;
            return [{ ...h, command: next }];
          }
          return [h];
        }),
      }))
      .filter((g) => g.hooks.length > 0);
    if (groups.length !== (hooks[event] ?? []).length) changed = true;
    hooks[event] = groups;
  }
  if (changed) data.hooks = hooks;
  return changed;
}

function buildHookCommand(hooksBase: string, h: PresetHook): string {
  return `node "${join(hooksBase, h.script)}"${h.args && h.args.length ? ` ${h.args.join(" ")}` : ""}`;
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

    // hook 内容去重:与 claude adapter 相同的释放→重定向/清理→认领流程
    const registry = readHookRegistry();
    const fps = fingerprintPresetHooks(sourceDir, preset.hooks);
    const released = releasePresetRefs(registry, preset.id, new Set(fps.filter((f): f is string => Boolean(f))));

    if (preset.hooks.length > 0 || released.length > 0) {
      const { path, data } = readConfig();
      const backup = backupFile(path);
      if (backup) configChanges.push(backup);

      const retargets = new Map(released.filter((r) => r.newCommand).map((r) => [r.oldCommand, r.newCommand!]));
      transformCodexHooks(data, (cmd) => {
        const t = retargets.get(cmd);
        if (t) return t;
        return hookCommandOwner(cmd) === preset.id ? undefined : cmd;
      });

      const claim = claimPresetHooks(registry, preset.id, fps, preset.hooks, (pid, h) =>
        buildHookCommand(join(boostHooksDir(), pid), h),
      );
      for (const w of claim.entries) {
        upsertCodexHooks(data, w.event, w.matcher ?? "", w.command, w.timeout);
      }
      if (claim.registryChanged || released.length > 0) writeHookRegistry(registry);

      writeFileIfWritable(path, stringify(data));
      configChanges.push(path);
    }

    recordInstall(preset.id, "codex", written, preset.version);

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

    // hook 共享注册表:先重定向仍被共享的条目,再删除本预设拥有的条目(顺序不能反)
    const registry = readHookRegistry();
    const released = releasePresetRefs(registry, presetId);
    if (released.length > 0) writeHookRegistry(registry);

    const { path, data } = readConfig();
    const backup = backupFile(path);
    if (backup) changed.push(backup);
    const retargets = new Map(released.filter((r) => r.newCommand).map((r) => [r.oldCommand, r.newCommand!]));
    const removed = transformCodexHooks(data, (cmd) => {
      const t = retargets.get(cmd);
      if (t) return t;
      return hookCommandOwner(cmd) === presetId ? undefined : cmd;
    });
    if (removed) {
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
