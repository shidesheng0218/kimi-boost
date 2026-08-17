import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { parse as parseToml } from "smol-toml";
import { detect } from "../core/detect.js";
import { readKimiConfig, presetsDir, hooksDir } from "../core/config.js";
import { copyFileIfWritable } from "../core/fsguard.js";
import { readManifest } from "../core/manifest.js";
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
