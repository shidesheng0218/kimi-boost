import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, statSync } from "node:fs";
import { dirname, join, sep } from "node:path";
import { detect } from "../core/detect.js";
import { copyDirIfWritable, ensureDir, writeFileIfWritable } from "../core/fsguard.js";
import { findProjectRoot } from "../core/project.js";
import { presetSourceDir } from "../registry/presets.js";
import type { DoctorIssue } from "./doctor.js";

interface ProjectManifest {
  presets: Record<string, string[] | { files: string[]; version?: string }>;
}

/** 兼容新旧两种记录形态 */
function filesOf(rec: string[] | { files: string[] } | undefined): string[] {
  if (!rec) return [];
  return Array.isArray(rec) ? rec : rec.files;
}

const MANIFEST_REL = join(".kimi-boost", "installed.json");

function readProjectManifest(root: string): ProjectManifest | null {
  const p = join(root, MANIFEST_REL);
  if (!existsSync(p)) return null;
  try {
    return JSON.parse(readFileSync(p, "utf8")) as ProjectManifest;
  } catch {
    return null;
  }
}

function extractHookScriptPath(command: string): string | undefined {
  const m = command.match(/(?:^|\s)(?:node|python3?)\s+"?([^"\s]+)"?/);
  return m ? m[1] : undefined;
}

interface ClaudeSettings {
  hooks?: Record<string, Array<{ matcher?: string; hooks: Array<{ type: string; command: string; timeout?: number }> }>>;
  [key: string]: unknown;
}

/** 项目级预设的健康检查 */
export function runProjectDoctor(fix = false, cwd: string = process.cwd()): DoctorIssue[] {
  const issues: DoctorIssue[] = [];
  const { root, isGitRoot } = findProjectRoot(cwd);

  if (!isGitRoot) {
    issues.push({
      level: "warn",
      item: "project: not inside a git repository",
      detail: "项目级预设建议配合 git 提交共享；当前按 cwd 检查",
    });
  } else {
    issues.push({ level: "ok", item: "project: git repository detected", detail: root });
  }

  const manifest = readProjectManifest(root);
  if (!manifest) {
    issues.push({
      level: "warn",
      item: "project: no project presets installed",
      detail: "安装: kboost install <preset> --project",
    });
    return issues;
  }
  issues.push({ level: "ok", item: "project: .kimi-boost/installed.json valid", detail: join(root, MANIFEST_REL) });

  // 1) 清单里记录的文件逐个验证
  const missing: Array<{ id: string; rel: string }> = [];
  for (const [id, rec] of Object.entries(manifest.presets)) {
    for (const rel of filesOf(rec)) {
      const abs = join(root, rel);
      if (existsSync(abs)) {
        issues.push({ level: "ok", item: `${id}: file present`, detail: rel });
      } else {
        missing.push({ id, rel });
        issues.push({ level: "error", item: `${id}: file missing`, detail: rel });
      }
    }
  }

  // 2) .claude/settings.json 的 hook 命令路径验证
  const settingsPath = join(root, ".claude", "settings.json");
  if (existsSync(settingsPath)) {
    let settings: ClaudeSettings;
    try {
      settings = JSON.parse(readFileSync(settingsPath, "utf8"));
      issues.push({ level: "ok", item: "project: .claude/settings.json parses", detail: settingsPath });
    } catch (err) {
      issues.push({
        level: "error",
        item: "project: .claude/settings.json is invalid",
        detail: err instanceof Error ? err.message : String(err),
      });
      settings = {};
    }
    for (const groups of Object.values(settings.hooks ?? {})) {
      for (const g of groups) {
        for (const h of g.hooks) {
          const script = extractHookScriptPath(h.command);
          if (!script) continue;
          // $CLAUDE_PROJECT_DIR 展开为项目根
          const resolved = script.replace("$CLAUDE_PROJECT_DIR", root);
          if (!existsSync(resolved)) {
            issues.push({ level: "error", item: "project: claude hook script missing", detail: resolved });
            missing.push({ id: "(hook)", rel: resolved.replace(root + sep, "") });
          } else {
            try {
              execFileSync(process.execPath, ["--check", resolved], { stdio: "ignore" });
              issues.push({ level: "ok", item: "project: claude hook script valid", detail: resolved.replace(root + sep, "") });
            } catch {
              issues.push({ level: "error", item: "project: claude hook script has syntax errors", detail: resolved.replace(root + sep, "") });
            }
          }
        }
      }
    }
  }

  // 3) CLI 依赖检查
  const env = detect();
  const toolsNeeded = new Set<string>();
  for (const rel of Object.values(manifest.presets).flatMap((rec) => filesOf(rec))) {
    // rel 分隔符随平台(Windows 为 \),统一按两种分隔符识别
    if (/^[.]agents[\\/]/.test(rel)) toolsNeeded.add("kimi");
    if (/^[.]claude[\\/]/.test(rel)) toolsNeeded.add("claude");
  }
  for (const tool of toolsNeeded) {
    const t = env.tools[tool as "kimi" | "claude"];
    if (!t.installed) {
      issues.push({
        level: "warn",
        item: `${tool}: CLI not installed, but project presets require it`,
        detail: `安装: https://www.kimi.com/code/docs/kimi-code-cli/guides/getting-started.html`,
      });
    } else {
      issues.push({ level: "ok", item: `${tool}: CLI detected`, detail: t.version ?? "" });
    }
  }

  // 4) --fix: 恢复缺失文件
  if (fix && missing.length > 0) {
    for (const { id, rel } of missing) {
      if (id === "(hook)") continue; // hook 脚本由 preset 复制逻辑恢复
      // 从仓库 presets/<id>/ 恢复
      const sourceBase = presetSourceDir(id);
      // rel 形如 .agents/skills/<name>/SKILL.md(分隔符随平台)
      const parts = rel.split(/[\\/]/);
      const kindIdx = parts.findIndex((p) => ["skills", "agents", "hooks"].includes(p));
      if (kindIdx < 0) continue;
      const kind = parts[kindIdx]; // skills | agents | hooks
      const rest = parts.slice(kindIdx + 1).join("/");
      const src = join(sourceBase, kind, rest);
      const dest = join(root, rel);
      if (existsSync(src)) {
        // src 可能是单个文件(如 agents/*.md)或目录(如 skills/<name>/)
        if (statSync(src).isDirectory()) copyDirIfWritable(src, dest);
        else {
          ensureDir(dirname(dest));
          writeFileIfWritable(dest, readFileSync(src));
        }
        issues.push({ level: "ok", item: `${id}: restored`, detail: rel });
      }
    }
    // claude settings.json 里的失效 hook 条目清理
    if (existsSync(settingsPath)) {
      const settings: ClaudeSettings = JSON.parse(readFileSync(settingsPath, "utf8"));
      let touched = false;
      for (const [event, groups] of Object.entries(settings.hooks ?? {})) {
        const filtered = groups
          .map((g) => ({
            ...g,
            hooks: g.hooks.filter((h) => {
              const script = extractHookScriptPath(h.command);
              if (!script) return true;
              const resolved = script.replace("$CLAUDE_PROJECT_DIR", root);
              return existsSync(resolved);
            }),
          }))
          .filter((g) => g.hooks.length > 0);
        if (filtered.length !== groups.length) touched = true;
        settings.hooks![event] = filtered;
      }
      if (touched) {
        writeFileIfWritable(settingsPath, JSON.stringify(settings, null, 2) + "\n");
        issues.push({ level: "ok", item: "project: .claude/settings.json cleaned", detail: "removed stale hook entries" });
      }
    }
  }

  return issues;
}
