import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { parse as parseToml, stringify as stringifyToml } from "smol-toml";
import { detect } from "../core/detect.js";
import { readKimiConfig, presetsDir, hooksDir, backupFile } from "../core/config.js";
import { copyFileIfWritable, writeFileIfWritable } from "../core/fsguard.js";
import { readManifest } from "../core/manifest.js";
import { fingerprintHook, hookCommandOwner } from "../core/hookRegistry.js";
import { removeHookByCommand } from "../core/kimiTextEdit.js";
import type { ToolName } from "../core/types.js";

export interface DoctorIssue {
  level: "ok" | "warn" | "error";
  item: string;
  detail: string;
}

export function runDoctor(fix = false): DoctorIssue[] {
  const issues: DoctorIssue[] = [];
  const env = detect();

  for (const tool of ["kimi", "claude", "codex"] as ToolName[]) {
    const t = env.tools[tool];
    if (!t.installed) {
      issues.push({
        level: "warn",
        item: `${tool}: CLI not detected`,
        detail: `Install ${tool} or ignore if you don't use it (config dir: ${t.homeDir}).`,
      });
    } else {
      issues.push({ level: "ok", item: `${tool}: detected`, detail: t.version ? `version ${t.version}` : "" });
    }
  }

  checkTomlSyntax(issues, "kimi", env.tools.kimi.homeDir);
  checkJsonSyntax(issues, "claude", join(env.tools.claude.homeDir, "settings.json"));
  checkTomlSyntax(issues, "codex", env.tools.codex.homeDir);

  const kimi = readKimiConfig();

  const mounted = [
    ...(Array.isArray(kimi.data.extra_skill_dirs) ? (kimi.data.extra_skill_dirs as string[]) : []),
    ...(Array.isArray(kimi.data.extra_agent_dirs) ? (kimi.data.extra_agent_dirs as string[]) : []),
  ];
  for (const dir of new Set(mounted)) {
    if (!existsSync(dir)) {
      if (fix) safeMkdir(dir);
      issues.push({
        level: existsSync(dir) ? "ok" : "warn",
        item: `kimi: mounted dir ${existsSync(dir) ? "restored" : "missing"}`,
        detail: dir,
      });
    } else {
      issues.push({ level: "ok", item: "kimi: mounted dir present", detail: dir });
    }
  }

  const rawHooks = Array.isArray(kimi.data.hooks) ? (kimi.data.hooks as Array<Record<string, unknown>>) : [];
  for (const h of rawHooks) {
    const command = String(h.command ?? "");
    const script = extractScriptPath(command);
    if (!script) {
      issues.push({ level: "warn", item: "kimi: hook has no script path", detail: command });
      continue;
    }
    if (!existsSync(script)) {
      let restored = false;
      if (fix) restored = restoreHookScript(script);
      issues.push({
        level: restored ? "ok" : "error",
        item: `kimi: hook script ${restored ? "restored" : "missing"}`,
        detail: script,
      });
      continue;
    }
    try {
      execFileSync(process.execPath, ["--check", script], { stdio: "ignore" });
      issues.push({ level: "ok", item: "kimi: hook script valid", detail: script });
    } catch {
      issues.push({ level: "error", item: "kimi: hook script has syntax errors", detail: script });
    }
  }

  // hook 重复/冲突检测(kimi + claude + codex 三端);fix 时自动合并完全重复的条目
  checkHookConflicts(
    issues,
    "kimi",
    rawHooks.map((h) => ({ event: String(h.event ?? ""), matcher: h.matcher === undefined ? undefined : String(h.matcher), command: String(h.command ?? "") })),
    fix ? { kind: "kimi-toml", path: join(env.tools.kimi.homeDir, "config.toml") } : undefined,
  );
  checkHookConflicts(
    issues,
    "claude",
    collectClaudeHookTriples(env.tools.claude.homeDir),
    fix ? { kind: "json", path: join(env.tools.claude.homeDir, "settings.json") } : undefined,
  );
  checkHookConflicts(
    issues,
    "codex",
    collectCodexHookTriples(env.tools.codex.homeDir),
    fix ? { kind: "codex-toml", path: join(env.tools.codex.homeDir, "config.toml") } : undefined,
  );

  const manifest = readManifest();
  for (const [id, tools] of Object.entries(manifest.presets)) {
    for (const tool of Object.keys(tools)) {
      if (!existsSync(join(presetsDir(), id))) {
        issues.push({
          level: "warn",
          item: `manifest: preset '${id}' missing from local store`,
          detail: `reinstall with 'kimi-boost install ${id} --tool ${tool}'`,
        });
      }
    }
  }

  if (env.platform === "win32") {
    issues.push({
      level: "warn",
      item: "windows: shell notes",
      detail: "Kimi Code uses Git Bash on Windows; ensure node is on PATH inside Git Bash.",
    });
  }

  return issues;
}

function checkTomlSyntax(issues: DoctorIssue[], tool: string, homeDir: string): void {
  const file = join(homeDir, "config.toml");
  if (!existsSync(file)) return;
  try {
    parseToml(readFileSync(file, "utf8"));
    issues.push({ level: "ok", item: `${tool}: config.toml parses`, detail: file });
  } catch (err) {
    issues.push({ level: "error", item: `${tool}: config.toml is invalid`, detail: err instanceof Error ? err.message : String(err) });
  }
}

function checkJsonSyntax(issues: DoctorIssue[], tool: string, file: string): void {
  if (!existsSync(file)) return;
  try {
    JSON.parse(readFileSync(file, "utf8"));
    issues.push({ level: "ok", item: `${tool}: settings.json parses`, detail: file });
  } catch (err) {
    issues.push({ level: "error", item: `${tool}: settings.json is invalid`, detail: err instanceof Error ? err.message : String(err) });
  }
}

function extractScriptPath(command: string): string | undefined {
  const m = command.match(/(?:^|\s)(?:node|python3?)\s+"?([^"\s]+)"?/);
  return m ? m[1] : undefined;
}

interface HookTriple {
  event: string;
  matcher?: string;
  command: string;
}

function collectClaudeHookTriples(homeDir: string): HookTriple[] {
  const file = join(homeDir, "settings.json");
  if (!existsSync(file)) return [];
  try {
    const data = JSON.parse(readFileSync(file, "utf8")) as {
      hooks?: Record<string, Array<{ matcher?: string; hooks: Array<{ command?: string }> }>>;
    };
    const out: HookTriple[] = [];
    for (const [event, groups] of Object.entries(data.hooks ?? {})) {
      for (const g of groups ?? []) {
        for (const h of g.hooks ?? []) {
          out.push({ event, matcher: g.matcher, command: String(h.command ?? "") });
        }
      }
    }
    return out;
  } catch {
    return [];
  }
}

function collectCodexHookTriples(homeDir: string): HookTriple[] {
  const file = join(homeDir, "config.toml");
  if (!existsSync(file)) return [];
  try {
    const data = parseToml(readFileSync(file, "utf8")) as {
      hooks?: Record<string, Array<{ matcher?: string; hooks: Array<{ command?: string }> }>>;
    };
    const out: HookTriple[] = [];
    for (const [event, groups] of Object.entries(data.hooks ?? {})) {
      for (const g of groups ?? []) {
        for (const h of g.hooks ?? []) {
          out.push({ event, matcher: g.matcher, command: String(h.command ?? "") });
        }
      }
    }
    return out;
  } catch {
    return [];
  }
}

interface HookFixTarget {
  /** kimi 的 config.toml 用 [[hooks]] 数组块(文本级编辑);codex 的 hooks 是按 event 分组的嵌套表(TOML 序列化,结构同 claude) */
  kind: "kimi-toml" | "codex-toml" | "json";
  path: string;
}

interface ClaudeSettingsHooks {
  hooks?: Record<string, Array<{ matcher?: string; hooks: Array<{ command?: string }> }>>;
  [key: string]: unknown;
}

function removeClaudeHookCommands(data: ClaudeSettingsHooks, commands: Set<string>): number {
  let removed = 0;
  const hooksByEvent = data.hooks ?? {};
  for (const event of Object.keys(hooksByEvent)) {
    hooksByEvent[event] = hooksByEvent[event]
      .map((g) => ({
        ...g,
        hooks: g.hooks.filter((h) => {
          if (h.command !== undefined && commands.has(h.command)) {
            removed++;
            return false;
          }
          return true;
        }),
      }))
      .filter((g) => g.hooks.length > 0);
  }
  data.hooks = hooksByEvent;
  return removed;
}

/**
 * 跨预设 hook 重复/冲突检测:
 *  - 重复:不同预设安装了内容完全相同的脚本 → 功能冗余。fix 时保留首个 command,
 *    从配置中删除其余完全重复的条目(字节级相同,收敛无损)。
 *  - 分叉:同事件+同名脚本但内容不同 → 行为可能不一致,始终仅诊断,不猜测哪份是"正确"版本。
 */
function checkHookConflicts(issues: DoctorIssue[], tool: string, hooks: HookTriple[], fixTarget?: HookFixTarget): void {
  const byFingerprint = new Map<string, Array<{ owner: string; command: string }>>();
  const byIdentity = new Map<string, Map<string, string[]>>();

  for (const h of hooks) {
    const script = extractScriptPath(h.command);
    if (!script || !existsSync(script)) continue;
    let content: string;
    try {
      content = readFileSync(script, "utf8");
    } catch {
      continue;
    }
    const fp = fingerprintHook(h.event, h.matcher, content);
    const owner = hookCommandOwner(h.command) ?? "(external)";

    const entries = byFingerprint.get(fp) ?? [];
    entries.push({ owner, command: h.command });
    byFingerprint.set(fp, entries);

    const identity = `${h.event}|${h.matcher ?? ""}|${script.split(/[\\/]/).pop() ?? script}`;
    const variants = byIdentity.get(identity) ?? new Map<string, string[]>();
    const owners = variants.get(fp) ?? [];
    owners.push(owner);
    variants.set(fp, owners);
    byIdentity.set(identity, variants);
  }

  for (const entries of byFingerprint.values()) {
    const distinctOwners = [...new Set(entries.map((e) => e.owner))].filter((o) => o !== "(external)");
    if (distinctOwners.length <= 1) continue;

    // 去重同一 command 出现多次的情况(同一预设装了两遍),真正要合并的是"不同 command、相同内容"的条目
    const distinctCommands = [...new Set(entries.map((e) => e.command))];
    if (fixTarget && distinctCommands.length > 1) {
      const [keep, ...drop] = distinctCommands;
      const removed = mergeExactDuplicates(fixTarget, new Set(drop));
      if (removed > 0) {
        issues.push({
          level: "ok",
          item: `${tool}: merged duplicate hook (${distinctOwners.join(", ")})`,
          detail: `保留 ${keep};移除了 ${removed} 条完全重复的条目`,
        });
        continue;
      }
    }
    issues.push({
      level: "warn",
      item: `${tool}: duplicate hook content (${distinctOwners.join(", ")})`,
      detail: "多个预设安装了内容相同的 hook,功能冗余。运行 'kimi-boost update' 可收敛为单条共享条目,或用 'doctor --fix' 立即合并。",
    });
  }

  for (const [identity, variants] of byIdentity) {
    if (variants.size < 2) continue;
    const script = identity.split("|").pop() ?? identity;
    const owners = [...new Set([...variants.values()].flat())].filter((o) => o !== "(external)");
    issues.push({
      level: "warn",
      item: `${tool}: diverging copies of ${script} (${owners.join(", ")})`,
      detail: `${owners.join(" / ")} 携带了同事件+同名但内容不同的脚本,行为可能不一致。请对其中过时的一方运行 'kimi-boost update <preset-id>'——内容不同,doctor 不会自动选择保留哪份。`,
    });
  }
}

/** 从配置里删除 commands 中列出的完全重复条目,返回实际删除数 */
function mergeExactDuplicates(target: HookFixTarget, commands: Set<string>): number {
  if (target.kind === "kimi-toml") {
    const text = existsSync(target.path) ? readFileSync(target.path, "utf8") : "";
    let removed = 0;
    let next = text;
    for (const cmd of commands) {
      const r = removeHookByCommand(next, cmd);
      next = r.text;
      removed += r.removed;
    }
    if (removed > 0) {
      backupFile(target.path);
      writeFileIfWritable(target.path, next);
    }
    return removed;
  }

  if (!existsSync(target.path)) return 0;

  if (target.kind === "codex-toml") {
    let data: ClaudeSettingsHooks;
    try {
      data = parseToml(readFileSync(target.path, "utf8")) as ClaudeSettingsHooks;
    } catch {
      return 0;
    }
    const removed = removeClaudeHookCommands(data, commands);
    if (removed > 0) {
      backupFile(target.path);
      writeFileIfWritable(target.path, stringifyToml(data as Record<string, unknown>));
    }
    return removed;
  }

  let data: ClaudeSettingsHooks;
  try {
    data = JSON.parse(readFileSync(target.path, "utf8")) as ClaudeSettingsHooks;
  } catch {
    return 0;
  }
  const removed = removeClaudeHookCommands(data, commands);
  if (removed > 0) {
    backupFile(target.path);
    writeFileIfWritable(target.path, JSON.stringify(data, null, 2));
  }
  return removed;
}

function safeMkdir(dir: string): void {
  try {
    mkdirSync(dir, { recursive: true });
  } catch {
    /* ignore */
  }
}

function restoreHookScript(scriptPath: string): boolean {
  // scriptPath: <hooksDir>/<id>/<file> — restore from the local preset copy
  const m = scriptPath.match(/([a-z0-9_-]+)[\\/][a-z0-9_.-]+$/);
  if (!m) return false;
  const id = m[1];
  const file = scriptPath.split(/[\\/]/).pop()!;
  const localHook = join(presetsDir(), id, "hooks", file);
  if (!existsSync(localHook)) return false;
  mkdirSync(join(hooksDir(), id), { recursive: true });
  copyFileIfWritable(localHook, scriptPath);
  return existsSync(scriptPath);
}
