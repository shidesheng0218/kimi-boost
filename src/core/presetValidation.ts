import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { basename, join } from "node:path";

/**
 * preset 目录校验(供 validate/dev/package 命令使用)。
 * 规则与 scripts/validate-presets.mjs 保持一致——CI 用的是那个脚本
 * (它在 build 前运行,无法引用 TS 源码),两边如有改动需同步。
 */

export interface ValidationIssue {
  level: "error" | "ok";
  message: string;
}

const REQUIRED_FIELDS = ["id", "name", "description", "tags", "version"];

const VALID_HOOK_EVENTS = new Set([
  "UserPromptSubmit",
  "UserPromptQueued",
  "PreToolUse",
  "Stop",
  "TurnStarted",
  "PostToolUse",
  "PostToolUseFailure",
  "PermissionRequest",
  "PermissionResult",
  "SessionStart",
  "SessionEnd",
  "SessionHeartbeat",
  "SubagentStart",
  "SubagentStop",
  "TaskStarted",
  "StopFailure",
  "Interrupt",
  "PreCompact",
  "PostCompact",
  "Notification",
]);

/** 校验单个 preset 目录;返回问题列表(全通过时含一条 ok) */
export function validatePresetDir(dir: string): ValidationIssue[] {
  const name = basename(dir);
  const issues: ValidationIssue[] = [];
  const err = (message: string) => issues.push({ level: "error", message });

  const presetFile = join(dir, "preset.json");
  if (!existsSync(presetFile)) {
    err("missing preset.json");
    return issues;
  }

  let preset: Record<string, unknown>;
  try {
    preset = JSON.parse(readFileSync(presetFile, "utf8")) as Record<string, unknown>;
  } catch {
    err("preset.json: invalid JSON");
    return issues;
  }

  for (const f of REQUIRED_FIELDS) {
    if (preset[f] === undefined) err(`missing field '${f}'`);
  }
  if (preset.id !== name) err(`id '${String(preset.id)}' must match directory name '${name}'`);

  const hooks = preset.hooks;
  if (Array.isArray(hooks)) {
    for (const h of hooks as Array<{ event?: unknown; script?: unknown }>) {
      if (typeof h.event !== "string" || !VALID_HOOK_EVENTS.has(h.event)) {
        err(`invalid hook event '${String(h.event)}'`);
      }
      if (typeof h.script !== "string") {
        err("hook missing 'script'");
      } else if (!existsSync(join(dir, "hooks", h.script))) {
        err(`hook script not found: hooks/${h.script}`);
      }
    }
  }

  if (existsSync(join(dir, "skills"))) {
    let foundSkill = false;
    const walk = (d: string): void => {
      for (const e of readdirSync(d)) {
        const p = join(d, e);
        if (statSync(p).isDirectory()) walk(p);
        else if (e === "SKILL.md") foundSkill = true;
      }
    };
    walk(join(dir, "skills"));
    if (!foundSkill) err("skills/ dir has no SKILL.md");
  }

  const manifest = join(dir, "kimi.plugin.json");
  if (existsSync(manifest)) {
    try {
      const m = JSON.parse(readFileSync(manifest, "utf8")) as { name?: unknown };
      if (m.name !== name) err(`kimi.plugin.json name must be '${name}'`);
    } catch {
      err("kimi.plugin.json: invalid JSON");
    }
  }

  if (issues.length === 0) issues.push({ level: "ok", message: "preset is valid" });
  return issues;
}
