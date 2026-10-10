import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync, rmdirSync, statSync } from "node:fs";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { copyDirIfWritable, ensureDir, isDryRun, removeIfWritable, setDryRun, writeFileIfWritable } from "./fsguard.js";
import { getPreset, listPresets, presetSourceDir } from "../registry/presets.js";
import type { PresetDefinition, ToolName } from "./types.js";
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
  /** 来源标记。默认 builtin;社区 preset 传 github:owner/repo@ref */
  source?: ProjectPresetSource;
  /** 覆盖内置 preset 目录(远程解包目录)。与 source 一起用。 */
  sourceDir?: string;
  /** 覆盖 preset 定义(远程 preset.json)。 */
  preset?: PresetDefinition;
  /** 调用方已经打印过安装摘要(远程确认前)时跳过,避免刷两遍 */
  quiet?: boolean;
}

/** 项目级安装记录。v0.8 起为对象形态并带版本;旧版为数组(读取兼容,下次写入自然迁移)。
 *  lock 字段(version/source/contentHash/targets/components/skipped)从可复现安装起写入;
 *  缺这些字段的旧对象仍可读,doctor/verify 会提示重新安装,不会抛错。
 */
export type ProjectPresetSource = `builtin` | `github:${string}`;

export interface ProjectSkip {
  /** 宿主或能力名,如 codex / kimi:hooks / claude:mcp */
  capability: string;
  reason: string;
}

export interface ProjectPresetRecordObject {
  files: string[];
  version?: string;
  /** builtin,或 github:owner/repo@ref */
  source?: ProjectPresetSource;
  /** preset 源目录的稳定 SHA-256(排除点文件与 kimi.plugin.json) */
  contentHash?: string;
  /** 已安装文件内容的稳定 SHA-256;verify 用它发现用户改动,不把 preset 升级误报成改动 */
  installedHash?: string;
  /** 本次实际写入过内容的宿主 */
  targets?: ToolName[];
  /** 已安装的组件类别:skills / agents / hooks */
  components?: string[];
  /** 明确跳过的能力及原因(Codex、Kimi hooks、项目级未实现的 MCP/deny 等) */
  skipped?: ProjectSkip[];
}

export type ProjectPresetRecord = string[] | ProjectPresetRecordObject;

export interface ProjectManifest {
  presets: Record<string, ProjectPresetRecord>;
}

const LOCK_FIELDS = ["version", "source", "contentHash", "installedHash", "targets", "components", "skipped"] as const;

export function filesOf(rec: ProjectPresetRecord | undefined): string[] {
  if (!rec) return [];
  return Array.isArray(rec) ? rec : rec.files ?? [];
}

export function versionOf(rec: ProjectPresetRecord | undefined): string | undefined {
  return rec && !Array.isArray(rec) ? rec.version : undefined;
}

/** 旧数组、或对象缺 lock 字段时返回缺失字段名;完整记录返回 [] */
export function missingLockFields(rec: ProjectPresetRecord | undefined): string[] {
  if (!rec || Array.isArray(rec)) return [...LOCK_FIELDS];
  return LOCK_FIELDS.filter((k) => rec[k] === undefined);
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

export function readProjectManifest(root: string): ProjectManifest {
  try {
    const parsed = JSON.parse(readFileSync(join(root, MANIFEST_REL), "utf8")) as ProjectManifest;
    if (!parsed || typeof parsed !== "object" || !parsed.presets || typeof parsed.presets !== "object") {
      return { presets: {} };
    }
    return parsed;
  } catch {
    return { presets: {} };
  }
}

function readManifest(root: string): ProjectManifest {
  return readProjectManifest(root);
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

const HASH_SKIP_NAMES = new Set([".DS_Store", "Thumbs.db"]);

/** 对 preset 源目录做稳定 SHA-256:路径按 / 排序,排除点文件与 kimi.plugin.json 噪声 */
export function hashPresetDir(dir: string): string {
  const files: string[] = [];
  const walk = (current: string): void => {
    let entries: string[];
    try {
      entries = readdirSync(current);
    } catch {
      return;
    }
    for (const name of entries) {
      if (name.startsWith(".") || HASH_SKIP_NAMES.has(name) || name === "kimi.plugin.json") continue;
      const abs = join(current, name);
      let st;
      try {
        st = statSync(abs);
      } catch {
        continue;
      }
      if (st.isDirectory()) walk(abs);
      else if (st.isFile()) files.push(abs);
    }
  };
  walk(dir);
  files.sort((a, b) => relative(dir, a).split(sep).join("/").localeCompare(relative(dir, b).split(sep).join("/")));
  const hash = createHash("sha256");
  for (const abs of files) {
    hash.update(relative(dir, abs).split(sep).join("/"));
    hash.update("\0");
    hash.update(readFileSync(abs));
    hash.update("\0");
  }
  return hash.digest("hex");
}

/**
 * 把已安装的项目相对路径映射回 preset 源内相对路径。
 * .agents| .claude 下的 skills/agents,以及 .kimi-boost/<id>/hooks。
 */
export function installedPathToSourceRel(presetId: string, relPath: string): string | undefined {
  const norm = relPath.split(sep).join("/");
  const parts = norm.split("/");
  const kindIdx = parts.findIndex((p) => p === "skills" || p === "agents" || p === "hooks");
  if (kindIdx < 0) return undefined;
  if (parts[kindIdx] === "hooks" && !(parts[0] === ".kimi-boost" && parts[1] === presetId)) return undefined;
  return parts.slice(kindIdx).join("/");
}

/** 已安装文件内容哈希(路径规范化后排序)。文件缺失用哨兵,使缺失本身改变哈希。 */
export function hashInstalledFiles(root: string, relPaths: string[]): string {
  const hash = createHash("sha256");
  const sorted = [...relPaths].map((p) => p.split(sep).join("/")).sort();
  for (const relPath of sorted) {
    hash.update(relPath);
    hash.update("\0");
    const abs = join(root, ...relPath.split("/"));
    if (existsSync(abs) && statSync(abs).isFile()) hash.update(readFileSync(abs));
    else hash.update("MISSING");
    hash.update("\0");
  }
  return hash.digest("hex");
}

/** 逐文件对比已安装副本与 preset 源。不存在的源文件不当成用户改动。 */
export function diffInstalledAgainstSource(
  projectRoot: string,
  presetId: string,
  sourceDir: string,
  relPaths: string[],
): { modified: string[]; missing: string[] } {
  const modified: string[] = [];
  const missing: string[] = [];
  for (const relPath of relPaths) {
    const sourceRel = installedPathToSourceRel(presetId, relPath);
    if (!sourceRel) continue;
    const installedAbs = join(projectRoot, ...relPath.split("/"));
    const sourceAbs = join(sourceDir, ...sourceRel.split("/"));
    if (!existsSync(installedAbs)) {
      missing.push(relPath);
      continue;
    }
    if (!existsSync(sourceAbs) || !statSync(sourceAbs).isFile() || !statSync(installedAbs).isFile()) continue;
    const a = readFileSync(installedAbs);
    const b = readFileSync(sourceAbs);
    if (!a.equals(b)) modified.push(relPath);
  }
  return { modified, missing };
}

export interface PresetSurface {
  preset: PresetDefinition;
  source: ProjectPresetSource;
  /** 下载或内置目录;builtin 无网络 */
  sourceDir: string;
  network: "none" | "github";
  contentHash: string;
  components: string[];
  targets: ToolName[];
  skipped: ProjectSkip[];
  /** 项目级会真正落地的 hooks(仅 claude) */
  projectHooks: Array<{ host: "claude"; event: string; matcher?: string; script: string }>;
  /** 声明了但项目级装不上的 hooks */
  declaredHooks: number;
  mcpServers: string[];
  denyRules: string[];
  scripts: string[];
}

function componentList(sourceDir: string, preset: PresetDefinition): string[] {
  const out: string[] = [];
  if (existsSync(join(sourceDir, "skills"))) out.push("skills");
  if (existsSync(join(sourceDir, "agents"))) out.push("agents");
  if (preset.hooks?.length && existsSync(join(sourceDir, "hooks"))) out.push("hooks");
  return out;
}

/**
 * 项目级安装面:不写盘。Codex 整端跳过;Kimi 不装 hooks;
 * MCP / deny 在项目级尚未实现,有声明时记入 skipped 而不是静默忽略。
 */
export function describeProjectInstall(preset: PresetDefinition, sourceDir: string, source: ProjectPresetSource, tool?: ToolName): PresetSurface {
  const requested = tool ? [tool] : (preset.tools ?? ["kimi", "claude", "codex"]);
  const components = componentList(sourceDir, preset);
  const skipped: ProjectSkip[] = [];
  const targets: ToolName[] = [];
  const projectHooks: PresetSurface["projectHooks"] = [];

  for (const host of requested) {
    if (host === "codex") {
      skipped.push({ capability: "codex", reason: "Codex 暂无项目级配置机制" });
      continue;
    }
    if (host !== "kimi" && host !== "claude") {
      skipped.push({ capability: host, reason: `unknown tool '${host}'` });
      continue;
    }
    targets.push(host);
    if (host === "kimi" && preset.hooks?.length) {
      skipped.push({
        capability: "kimi:hooks",
        reason: "Kimi Code 仅支持用户级 hook(需要可全局安装: kboost install " + preset.id + ")",
      });
    }
    if (host === "claude" && preset.hooks?.length && existsSync(join(sourceDir, "hooks"))) {
      for (const h of preset.hooks) {
        if (!h.script) continue;
        projectHooks.push({ host: "claude", event: h.event, matcher: h.matcher, script: h.script });
      }
    }
    if (preset.mcpServers && Object.keys(preset.mcpServers).length > 0) {
      skipped.push({
        capability: `${host}:mcp`,
        reason: "项目级安装不写 MCP 配置(仅用户级 ~/.kimi-code/mcp.json 等)",
      });
    }
    if (host === "claude" && preset.denyRules?.length) {
      skipped.push({
        capability: "claude:deny",
        reason: "项目级安装不写 permissions.deny(仅用户级 ~/.claude/settings.json)",
      });
    }
  }

  let scripts: string[] = [];
  const hooksDir = join(sourceDir, "hooks");
  if (existsSync(hooksDir)) {
    try {
      scripts = readdirSync(hooksDir).filter((name) => {
        try {
          return statSync(join(hooksDir, name)).isFile();
        } catch {
          return false;
        }
      });
    } catch {
      scripts = [];
    }
  }

  return {
    preset,
    source,
    sourceDir,
    network: source === "builtin" ? "none" : "github",
    contentHash: hashPresetDir(sourceDir),
    components,
    targets,
    skipped,
    projectHooks,
    declaredHooks: preset.hooks?.length ?? 0,
    mcpServers: Object.keys(preset.mcpServers ?? {}),
    denyRules: preset.denyRules ?? [],
    scripts,
  };
}

/** 人类可读的安装/权限摘要。不写盘。 */
export function formatPresetSurface(surface: PresetSurface): string {
  const p = surface.preset;
  const lines: string[] = [];
  lines.push(`preset: ${p.id} (${p.name}) v${p.version ?? "?"}  source=${surface.source}`);
  lines.push(`network: ${surface.network === "none" ? "none (builtin, no download)" : `github (${surface.source})`}`);
  lines.push(`contentHash: ${surface.contentHash}`);
  lines.push(`components: ${surface.components.length ? surface.components.join(", ") : "(none)"}`);
  lines.push(`targets: ${surface.targets.length ? surface.targets.join(", ") : "(none)"}`);
  if (surface.projectHooks.length) {
    lines.push("hooks (will install, claude only — scripts run on agent tool use):");
    for (const h of surface.projectHooks) {
      lines.push(`  - [${h.event}${h.matcher ? `/${h.matcher}` : ""}] node .kimi-boost/${p.id}/hooks/${h.script}`);
    }
  } else if (surface.declaredHooks) {
    lines.push(`hooks: ${surface.declaredHooks} declared, none installed at project scope for the selected targets`);
  } else {
    lines.push("hooks: none");
  }
  lines.push(`scripts: ${surface.scripts.length ? surface.scripts.join(", ") : "(none)"}`);
  lines.push(
    `mcp: ${surface.mcpServers.length ? surface.mcpServers.join(", ") + " (declared; not written by --project)" : "none"}`,
  );
  lines.push(
    `deny: ${surface.denyRules.length ? `${surface.denyRules.length} rule(s) declared; not written by --project` : "none"}`,
  );
  if (surface.skipped.length) {
    lines.push("skipped:");
    for (const s of surface.skipped) lines.push(`  - ${s.capability}: ${s.reason}`);
  } else {
    lines.push("skipped: none");
  }
  return lines.join("\n");
}

export interface VerifyIssue {
  level: "error" | "warn";
  code: "missing-lock" | "missing-file" | "modified" | "version-mismatch" | "source-mismatch" | "unavailable";
  presetId: string;
  detail: string;
}

/**
 * 核对项目级 lock 与磁盘。不修改、不删除任何文件。
 * 旧记录缺 lock 字段 → warn(退出码仍非零,提示重新安装)。
 * 文件缺失或内容哈希变化 → error。版本/来源与当前内置 preset 不一致 → error。
 */
export function verifyProjectInstall(cwd?: string): { root: string; issues: VerifyIssue[] } {
  const { root } = findProjectRoot(cwd);
  const manifest = readManifest(root);
  const issues: VerifyIssue[] = [];
  const ids = Object.keys(manifest.presets);
  if (ids.length === 0) {
    issues.push({
      level: "warn",
      code: "unavailable",
      presetId: "(project)",
      detail: "no project presets recorded; install with: kboost install <preset> --project",
    });
    return { root, issues };
  }

  for (const id of ids) {
    const rec = manifest.presets[id];
    const missing = missingLockFields(rec);
    if (missing.length) {
      issues.push({
        level: "warn",
        code: "missing-lock",
        presetId: id,
        detail: `record is missing ${missing.join(", ")}; reinstall to refresh the lock: kboost install ${id} --project`,
      });
    }
    const files = filesOf(rec);
    for (const relPath of files) {
      const abs = join(root, relPath);
      if (!existsSync(abs)) {
        issues.push({ level: "error", code: "missing-file", presetId: id, detail: relPath });
      }
    }
    if (rec && !Array.isArray(rec) && rec.installedHash && files.length > 0) {
      const now = hashInstalledFiles(root, files);
      if (now !== rec.installedHash) {
        let changed = files.filter((relPath) => !existsSync(join(root, relPath)));
        const recordedSource = rec.source;
        if ((!recordedSource || recordedSource === "builtin") && getPreset(id)) {
          const { modified } = diffInstalledAgainstSource(root, id, presetSourceDir(id), files);
          changed = [...new Set([...changed, ...modified])];
        }
        issues.push({
          level: "error",
          code: "modified",
          presetId: id,
          detail: `installed files differ from recorded content (installedHash ${rec.installedHash.slice(0, 12)}…)${changed.length ? `: ${changed.join(", ")}` : ""}. Edits were not deleted; reinstall only if you intend to overwrite them.`,
        });
      }
    }
    if (rec && !Array.isArray(rec) && rec.contentHash && (!rec.source || rec.source === "builtin") && getPreset(id)) {
      const current = hashPresetDir(presetSourceDir(id));
      if (current !== rec.contentHash) {
        issues.push({
          level: "error",
          code: "source-mismatch",
          presetId: id,
          detail: `recorded contentHash ${rec.contentHash.slice(0, 12)}… does not match the current builtin preset ${current.slice(0, 12)}…; reinstall --project to align`,
        });
      }
    }
    if (rec && !Array.isArray(rec) && (rec.version || rec.source)) {
      const builtin = getPreset(id);
      const recordedSource = rec.source ?? "builtin";
      if (recordedSource === "builtin") {
        if (!builtin) {
          issues.push({
            level: "error",
            code: "unavailable",
            presetId: id,
            detail: "recorded as builtin but this preset is not in the current registry",
          });
        } else if (rec.version && builtin.version && rec.version !== builtin.version) {
          issues.push({
            level: "error",
            code: "version-mismatch",
            presetId: id,
            detail: `recorded v${rec.version}, registry v${builtin.version}; reinstall --project to align`,
          });
        }
      }
    }
  }
  return { root, issues };
}

/** 在项目级安装预设;返回每端一份报告 */
export async function installProjectPreset(id: string, opts: ProjectOptions = {}): Promise<InstallReport[]> {
  const preset = opts.preset ?? getPreset(id);
  if (!preset) {
    const available = listPresets().map((p) => p.id).join(", ");
    throw new Error(`Preset '${id}' not found. Available: ${available}`);
  }
  const { root, isGitRoot } = opts.root ? { root: resolve(opts.root), isGitRoot: true } : findProjectRoot();
  const sourceDir = opts.sourceDir ?? presetSourceDir(id);
  const source: ProjectPresetSource = opts.source ?? "builtin";
  const surface = describeProjectInstall(preset, sourceDir, source, opts.tool);
  const targets = opts.tool ? [opts.tool] : (preset.tools ?? ["kimi", "claude", "codex"]);

  // 写盘前的变更/跳过摘要。dry-run 同样打印,且下面的写入会被 fsguard 跳过。
  if (!opts.quiet) {
    console.log(formatPresetSurface(surface));
    if (opts.dryRun) console.log("(dry-run: no files will be written)");
  }

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

      const files = [...writtenAll].sort();
      manifest.presets[id] = {
        files,
        version: preset.version,
        source,
        contentHash: surface.contentHash,
        // dry-run 时文件并未落盘,不能把缺失哨兵写进 lock
        ...(isDryRun() ? {} : { installedHash: hashInstalledFiles(root, files) }),
        targets: surface.targets,
        components: surface.components,
        skipped: surface.skipped,
      };
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
