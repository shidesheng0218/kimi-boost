import { existsSync, readFileSync, rmdirSync } from "node:fs";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";
import { copyDirIfWritable, ensureDir, removeIfWritable, setDryRun, writeFileIfWritable } from "./fsguard.js";
import { getPreset, listPresets, presetSourceDir } from "../registry/presets.js";
import type { ToolName } from "./types.js";
import type { InstallReport } from "../adapters/types.js";

/**
 * 项目级安装:把预设写进当前项目(.agents/、.claude/),产物可提交 git 供团队共享。
 *
 * 各端能力矩阵(2026-08 官方文档确认):
 * - Kimi Code: skills → .agents/skills/, agents → .agents/agents/;hooks 仅用户级(无项目级机制)
 * - Claude Code: skills → .claude/skills/, agents → .claude/agents/, hooks → .claude/settings.json
 * - Codex: 暂无项目级配置机制,跳过并提示
 */

export interface ProjectOptions {
  tool?: ToolName;
  dryRun?: boolean;
  /** 测试用:显式指定项目根,默认从 cwd 向上探测 */
  root?: string;
}

/** 项目级安装记录。v0.8 起为对象形态并带版本;旧版为数组(读取兼容,下次写入自然迁移) */
type ProjectPresetRecord = string[] | { files: string[]; version?: string };

interface ProjectManifest {
  presets: Record<string, ProjectPresetRecord>;
}

function filesOf(rec: ProjectPresetRecord | undefined): string[] {
  if (!rec) return [];
  return Array.isArray(rec) ? rec : rec.files;
}

function versionOf(rec: ProjectPresetRecord | undefined): string | undefined {
  return rec && !Array.isArray(rec) ? rec.version : undefined;
}

const MANIFEST_REL = join(".kimi-boost", "installed.json");

/** 项目根 = 从 cwd 向上最近的含 .git 的目录;找不到时退回 cwd */
export function findProjectRoot(cwd: string = process.cwd()): { root: string; isGitRoot: boolean } {
  let dir = resolve(cwd);
  for (;;) {
    if (existsSync(join(dir, ".git"))) return { root: dir, isGitRoot: true };
    const parent = dirname(dir);
    if (parent === dir) return { root: resolve(cwd), isGitRoot: false };
    dir = parent;
  }
}

function assertInsideProject(root: string, p: string): void {
  const rel = relative(root, p);
  if (!rel || rel.startsWith("..") || isAbsolute(rel)) {
    throw new Error(`refusing to touch path outside project: ${p}`);
  }
}

function readManifest(root: string): ProjectManifest {
  try {
    return JSON.parse(readFileSync(join(root, MANIFEST_REL), "utf8")) as ProjectManifest;
  } catch {
    return { presets: {} };
  }
}

/** 列出项目级已安装预设(含 manifest 记录的版本;旧格式版本为 undefined) */
export function projectInstalledPresets(cwd?: string): Array<{ id: string; version?: string }> {
  const { root } = findProjectRoot(cwd);
  const manifest = readManifest(root);
  return Object.entries(manifest.presets).map(([id, rec]) => ({ id, version: versionOf(rec) }));
}

function writeManifest(root: string, m: ProjectManifest): void {
  const p = join(root, MANIFEST_REL);
  ensureDir(dirname(p));
  writeFileIfWritable(p, JSON.stringify(m, null, 2) + "\n");
}

function rel(root: string, abs: string): string {
  return relative(root, abs);
}

interface ClaudeSettings {
  hooks?: Record<string, Array<{ matcher?: string; hooks: Array<{ type: string; command: string; timeout?: number }> }>>;
  [key: string]: unknown;
}

function readClaudeSettings(path: string): ClaudeSettings {
  try {
    return JSON.parse(readFileSync(path, "utf8")) as ClaudeSettings;
  } catch {
    return {};
  }
}

/** 往 .claude/settings.json 合并一条 hook(按 command 去重),返回是否有变更 */
function addClaudeHook(settings: ClaudeSettings, event: string, matcher: string | undefined, command: string, timeout?: number): boolean {
  const hooksByEvent = settings.hooks ?? {};
  const groups = hooksByEvent[event] ?? [];
  let group = matcher ? groups.find((g) => g.matcher === matcher) : groups[0];
  if (!group) {
    group = { ...(matcher ? { matcher } : {}), hooks: [] };
    hooksByEvent[event] = [...groups, group];
  }
  if (group.hooks.some((h) => h.command === command)) {
    settings.hooks = hooksByEvent;
    return false;
  }
  group.hooks.push({ type: "command", command, ...(timeout !== undefined ? { timeout } : {}) });
  settings.hooks = hooksByEvent;
  return true;
}

/** 从 .claude/settings.json 移除命令路径含 .kimi-boost/<id>/ 的 hook,返回是否有变更 */
function removeClaudeHooksFor(settings: ClaudeSettings, presetId: string): boolean {
  const hooksByEvent = settings.hooks ?? {};
  let removed = false;
  for (const event of Object.keys(hooksByEvent)) {
    const groups = hooksByEvent[event]
      .map((g) => ({
        ...g,
        hooks: g.hooks.filter((h) => !h.command.includes(`.kimi-boost/${presetId}/`)),
      }))
      .filter((g) => g.hooks.length > 0);
    if (groups.length !== hooksByEvent[event].length || groups.some((g, i) => g.hooks.length !== hooksByEvent[event][i].hooks.length)) {
      removed = true;
    }
    hooksByEvent[event] = groups;
  }
  settings.hooks = hooksByEvent;
  return removed;
}

function hookCommand(root: string, presetId: string, script: string): string {
  // $CLAUDE_PROJECT_DIR 由 Claude Code 运行时展开,保证路径随项目移动
  void root;
  return `node "$CLAUDE_PROJECT_DIR/.kimi-boost/${presetId}/hooks/${script}"`;
}

/** 在项目级安装预设;返回每端一份报告 */
export async function installProjectPreset(id: string, opts: ProjectOptions = {}): Promise<InstallReport[]> {
  const preset = getPreset(id);
  if (!preset) {
    const available = listPresets().map((p) => p.id).join(", ");
    throw new Error(`Preset '${id}' not found. Available: ${available}`);
  }
  const { root, isGitRoot } = opts.root ? { root: resolve(opts.root), isGitRoot: true } : findProjectRoot();
  const sourceDir = presetSourceDir(id);
  const targets = opts.tool ? [opts.tool] : (preset.tools ?? ["kimi", "claude", "codex"]);

  setDryRun(Boolean(opts.dryRun));
  const reports: InstallReport[] = [];
  const manifest = readManifest(root);
  const writtenAll = new Set(filesOf(manifest.presets[id]));

  try {
    for (const tool of targets) {
      if (tool === "codex") {
        reports.push({ tool, presetId: id, ok: true, message: "skipped: Codex 暂无项目级配置机制", changed: [] });
        continue;
      }
      if (tool !== "kimi" && tool !== "claude") {
        reports.push({ tool, presetId: id, ok: false, message: `unknown tool '${tool}'`, changed: [] });
        continue;
      }

      const changed: string[] = [];
      const skillsDest = join(root, tool === "kimi" ? join(".agents", "skills") : join(".claude", "skills"));
      const agentsDest = join(root, tool === "kimi" ? join(".agents", "agents") : join(".claude", "agents"));

      if (existsSync(join(sourceDir, "skills"))) {
        for (const f of copyDirIfWritable(join(sourceDir, "skills"), skillsDest)) {
          changed.push(rel(root, f));
          writtenAll.add(rel(root, f));
        }
      }
      if (existsSync(join(sourceDir, "agents"))) {
        for (const f of copyDirIfWritable(join(sourceDir, "agents"), agentsDest)) {
          changed.push(rel(root, f));
          writtenAll.add(rel(root, f));
        }
      }

      const notes: string[] = [];
      if (tool === "claude" && preset.hooks?.length && existsSync(join(sourceDir, "hooks"))) {
        const hooksDest = join(root, ".kimi-boost", id, "hooks");
        for (const f of copyDirIfWritable(join(sourceDir, "hooks"), hooksDest)) {
          changed.push(rel(root, f));
          writtenAll.add(rel(root, f));
        }
        const settingsPath = join(root, ".claude", "settings.json");
        const settings = readClaudeSettings(settingsPath);
        let touched = false;
        for (const h of preset.hooks) {
          if (!h.script) continue;
          touched = addClaudeHook(settings, h.event, h.matcher, hookCommand(root, id, h.script), h.timeout) || touched;
        }
        if (touched || !existsSync(settingsPath)) {
          writeFileIfWritable(settingsPath, JSON.stringify(settings, null, 2) + "\n");
          // 仅报告,不加入 manifest 删除清单——settings.json 可能含用户其他设置,
          // 卸载时只做外科式清理(removeClaudeHooksFor),绝不整文件删除
          changed.push(rel(root, settingsPath));
        }
      }
      if (tool === "kimi" && preset.hooks?.length) {
        notes.push("hooks 未装:Kimi Code 仅支持用户级 hook(需要可全局安装: kboost install " + id + ")");
      }

      manifest.presets[id] = { files: [...writtenAll], version: preset.version };
      writeManifest(root, manifest);

      const base = `${tool}: skills/agents → ${tool === "kimi" ? ".agents/" : ".claude/"}`;
      reports.push({
        tool,
        presetId: id,
        ok: true,
        message: notes.length ? `${base}; ${notes.join("; ")}` : base,
        changed,
      });
    }
  } finally {
    setDryRun(false);
  }

  if (!isGitRoot) {
    reports.push({
      tool: "kimi",
      presetId: id,
      ok: true,
      message: "note: 当前目录不在 git 仓库内,已按 cwd 写入;项目级预设建议配合 git 提交共享",
      changed: [],
    });
  }
  return reports;
}

/** 移除项目级预设 */
export async function removeProjectPreset(id: string, opts: ProjectOptions = {}): Promise<InstallReport[]> {
  const { root } = opts.root ? { root: resolve(opts.root) } : findProjectRoot();
  const manifest = readManifest(root);

  setDryRun(Boolean(opts.dryRun));
  try {
    const removed: string[] = [];
    const recorded = filesOf(manifest.presets[id]);
    for (const relPath of recorded) {
      const abs = join(root, relPath);
      assertInsideProject(root, abs);
      if (existsSync(abs)) {
        removeIfWritable(abs, { recursive: true, force: true });
        removed.push(relPath);
      }
    }

    // claude settings.json 里的 hook 命令清理
    const settingsPath = join(root, ".claude", "settings.json");
    if (existsSync(settingsPath)) {
      const settings = readClaudeSettings(settingsPath);
      if (removeClaudeHooksFor(settings, id)) {
        writeFileIfWritable(settingsPath, JSON.stringify(settings, null, 2) + "\n");
        removed.push(rel(root, settingsPath) + " (hooks 条目)");
      }
    }

    // 清理空目录(自底向上,只动我们创建的目录结构)
    const dirCandidates = new Set<string>();
    for (const relPath of removed) {
      let d = dirname(relPath);
      while (d && d !== "." && !d.startsWith("..")) {
        dirCandidates.add(d);
        d = dirname(d);
      }
    }
    for (const d of [...dirCandidates].sort((a, b) => b.length - a.length)) {
      if ([".agents", ".claude", ".kimi-boost"].includes(d)) continue;
      try {
        rmdirSync(join(root, d));
      } catch {
        /* 非空目录,跳过 */
      }
    }

    delete manifest.presets[id];
    if (Object.keys(manifest.presets).length === 0) {
      if (existsSync(join(root, MANIFEST_REL))) removeIfWritable(join(root, MANIFEST_REL));
    } else {
      writeManifest(root, manifest);
    }

    return [
      {
        tool: "kimi",
        presetId: id,
        ok: true,
        message: recorded.length ? `removed ${recorded.length} project file(s)` : "未在本项目中安装",
        changed: removed,
      },
    ];
  } finally {
    setDryRun(false);
  }
}
