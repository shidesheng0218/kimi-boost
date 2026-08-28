import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { parse as parseToml } from "smol-toml";
import { detect } from "../core/detect.js";
import { readKimiConfig, presetsDir, hooksDir } from "../core/config.js";
import { copyFileIfWritable } from "../core/fsguard.js";
import { readManifest } from "../core/manifest.js";
import { fingerprintHook, hookCommandOwner } from "../core/hookRegistry.js";
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

  // hook 重复/冲突检测(kimi + claude + codex 三端)
  checkHookConflicts(
    issues,
    "kimi",
    rawHooks.map((h) => ({ event: String(h.event ?? ""), matcher: h.matcher === undefined ? undefined : String(h.matcher), command: String(h.command ?? "") })),
  );
  checkHookConflicts(issues, "claude", collectClaudeHookTriples(env.tools.claude.homeDir));
  checkHookConflicts(issues, "codex", collectCodexHookTriples(env.tools.codex.homeDir));

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

/**
 * 跨预设 hook 重复/冲突检测(仅诊断,不自动合并——真正的收敛发生在 install/update 时):
 *  - 重复:不同预设安装了内容完全相同的脚本 → 功能冗余,warn
 *  - 分叉:同事件+同名脚本但内容不同 → 行为可能不一致,warn
 */
function checkHookConflicts(issues: DoctorIssue[], tool: string, hooks: HookTriple[]): void {
  const byFingerprint = new Map<string, string[]>();
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

    const fps = byFingerprint.get(fp) ?? [];
    fps.push(owner);
    byFingerprint.set(fp, fps);

    const identity = `${h.event}|${h.matcher ?? ""}|${script.split(/[\\/]/).pop() ?? script}`;
    const variants = byIdentity.get(identity) ?? new Map<string, string[]>();
    const owners = variants.get(fp) ?? [];
    owners.push(owner);
    variants.set(fp, owners);
    byIdentity.set(identity, variants);
  }

  for (const owners of byFingerprint.values()) {
    const distinct = [...new Set(owners)].filter((o) => o !== "(external)");
    if (distinct.length > 1) {
      issues.push({
        level: "warn",
        item: `${tool}: duplicate hook content (${distinct.join(", ")})`,
        detail: "多个预设安装了内容相同的 hook,功能冗余。运行 'kimi-boost update' 可收敛为单条共享条目。",
      });
    }
  }

  for (const [identity, variants] of byIdentity) {
    if (variants.size < 2) continue;
    const script = identity.split("|").pop() ?? identity;
    const owners = [...new Set([...variants.values()].flat())].filter((o) => o !== "(external)");
    issues.push({
      level: "warn",
      item: `${tool}: diverging copies of ${script} (${owners.join(", ")})`,
      detail: "同事件挂载了同名但内容不同的脚本,行为可能不一致。请更新相关预设到最新版本。",
    });
  }
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
