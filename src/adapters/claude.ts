import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import type { Adapter, AdapterContext, InstallReport } from "./types.js";
import { backupDir, backupFile } from "../core/config.js";
import { clearInstall, installedFilesFor, readHookRegistry, recordInstall, writeHookRegistry, recordDenyRules, installedDenyRulesFor } from "../core/manifest.js";
import { claimPresetHooks, fingerprintPresetHooks, hookCommandOwner, releasePresetRefs } from "../core/hookRegistry.js";
import { copyDirIfWritable, ensureDir as mkdirSyncSafe, isDryRun, removeIfWritable, writeFileIfWritable } from "../core/fsguard.js";
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
  /** Claude Code 原生强制层:permissions.deny(Tool(spec) 形式,harness 内强制,比 hook 更难绕过) */
  permissions?: { deny?: string[] };
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

/** 把 preset 的 deny 规则并入 settings.json 的 permissions.deny(保留用户已有规则,去重) */
function upsertClaudeDenyRules(data: ClaudeSettings, rules: string[]): boolean {
  const perms = data.permissions ?? {};
  const existing = perms.deny ?? [];
  const set = new Set(existing);
  let changed = false;
  for (const r of rules) {
    if (!set.has(r)) {
      set.add(r);
      changed = true;
    }
  }
  if (changed) {
    perms.deny = [...set];
    data.permissions = perms;
  }
  return changed;
}

/** 精准移除我们当初写入的 deny 规则(不动用户自己的);空了连 permissions.deny 一起清掉 */
function removeClaudeDenyRules(data: ClaudeSettings, rules: string[]): boolean {
  const deny = data.permissions?.deny;
  if (!deny || deny.length === 0) return false;
  const remove = new Set(rules);
  const next = deny.filter((r) => !remove.has(r));
  if (next.length === deny.length) return false;
  if (data.permissions) {
    if (next.length === 0) delete data.permissions.deny;
    else data.permissions.deny = next;
  }
  return true;
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
    const backups: Array<{ orig: string; bak: string }> = [];
    // 上次安装记录内的目标归本工具管理,直接覆盖;记录之外的用户文件先备份
    const prevInstalled = new Set(installedFilesFor(preset.id, "claude"));
    const denyRules = preset.denyRules ?? [];

    try {
      if (existsSync(join(sourceDir, "agents"))) {
        mkdirSyncSafe(CLAUDE_AGENTS);
        for (const file of readdirSync(join(sourceDir, "agents"))) {
          const dest = join(CLAUDE_AGENTS, file);
          if (existsSync(dest) && !prevInstalled.has(dest)) {
            const bak = backupFile(dest);
            if (bak) {
              backups.push({ orig: dest, bak });
              configChanges.push(bak);
            }
          }
          writeFileIfWritable(dest, readFileSync(join(sourceDir, "agents", file)));
          written.push(dest);
        }
      }

      if (existsSync(join(sourceDir, "skills"))) {
        const skillRoot = join(CLAUDE_SKILLS, preset.id);
        if (existsSync(skillRoot) && !prevInstalled.has(skillRoot)) {
          const bak = backupDir(skillRoot);
          if (bak) {
            backups.push({ orig: skillRoot, bak });
            configChanges.push(bak);
          }
        }
        removeIfWritable(skillRoot, { recursive: true, force: true });
        written.push(...copyDir(join(sourceDir, "skills"), skillRoot));
        written.push(skillRoot);
      }

      // hook 内容去重:释放本预设旧引用(keepFps 之外的)→ 重定向/清理 config 条目 → 重新认领。
      // 需要动 settings.json 的情况:本预设带 hooks,或带 deny 规则,或释放动作需要重定向/清理陈旧条目
      const registry = readHookRegistry();
      const fps = fingerprintPresetHooks(sourceDir, preset.hooks);
      const released = releasePresetRefs(registry, preset.id, new Set(fps.filter((f): f is string => Boolean(f))));

      if (preset.hooks.length > 0 || released.length > 0 || denyRules.length > 0) {
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

        // 原生强制层:permissions.deny(写入 settings;记录到 manifest 挪到 finally 之后,因为那里才有安装记录)
        if (denyRules.length > 0) {
          upsertClaudeDenyRules(data, denyRules);
        }

        writeFileIfWritable(path, JSON.stringify(data, null, 2));
        configChanges.push(path);
      }
    } finally {
      // 增量记录:即使中途抛错,本轮已写文件也进 manifest,保证 remove 总能清理干净
      recordInstall(preset.id, "claude", written, preset.version);
      // 记录本端写入的 deny 规则(必须在 recordInstall 之后——记录里要先有条目)
      if (denyRules.length > 0) recordDenyRules(preset.id, "claude", denyRules);
    }

    const all = [...written, ...configChanges];

    // 安装后自检:回读本轮记录的关键文件,缺失则标记失败
    if (!isDryRun()) {
      const missing = written.filter((p) => !existsSync(p));
      if (missing.length > 0) {
        return {
          tool: "claude",
          presetId: preset.id,
          ok: false,
          message: `Preset '${preset.id}' self-check failed for Claude Code — missing after install: ${missing.join(", ")}`,
          changed: all,
        };
      }
    }

    const backupText = backups.length
      ? " " + backups.map((b) => isDryRun()
          ? `would back up ${b.orig} → ${b.bak}`
          : `Backed up existing ${b.orig} → ${b.bak} (restore: mv '${b.bak}' '${b.orig}')`).join("; ")
      : "";
    return {
      tool: "claude",
      presetId: preset.id,
      ok: true,
      message: all.length
        ? `Installed preset '${preset.id}' into Claude Code (${all.length} changes). Restart claude to apply.${backupText}`
        : `Preset '${preset.id}' already active for Claude Code.${backupText}`,
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

    // 先取出本预设写入的 deny 规则——clearInstall 会把 manifest 记录(含 denyRules)删掉
    const ourDeny = installedDenyRulesFor(presetId, "claude");

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

    // 精准移除本预设写入的 deny 规则(不动用户自己的)
    const denyRemoved = ourDeny.length > 0 && removeClaudeDenyRules(data, ourDeny);
    if (denyRemoved) changed.push(`${path} (permissions.deny)`);

    const retargets = new Map(released.filter((r) => r.newCommand).map((r) => [r.oldCommand, r.newCommand!]));
    const removed = transformClaudeHooks(data, (cmd) => {
      const t = retargets.get(cmd);
      if (t) return t;
      return hookCommandOwner(cmd) === presetId ? undefined : cmd;
    });
    if (removed || denyRemoved) {
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
