import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");
const presetsDir = join(root, "presets");

const requiredFields = ["id", "name", "description", "tags", "version"];
const validHookEvents = new Set([
  "UserPromptSubmit", "UserPromptQueued", "PreToolUse", "Stop", "TurnStarted",
  "PostToolUse", "PostToolUseFailure", "PermissionRequest", "PermissionResult",
  "SessionStart", "SessionEnd", "SessionHeartbeat", "SubagentStart", "SubagentStop",
  "TaskStarted", "StopFailure", "Interrupt", "PreCompact", "PostCompact", "Notification",
]);

const errors = [];
const seenIds = new Set();

for (const entry of readdirSync(presetsDir)) {
  const dir = join(presetsDir, entry);
  if (!statSync(dir).isDirectory()) continue;

  const presetFile = join(dir, "preset.json");
  if (!existsSync(presetFile)) {
    errors.push(`presets/${entry}: missing preset.json`);
    continue;
  }

  let preset;
  try {
    preset = JSON.parse(readFileSync(presetFile, "utf8"));
  } catch {
    errors.push(`presets/${entry}/preset.json: invalid JSON`);
    continue;
  }

  for (const f of requiredFields) {
    if (preset[f] === undefined) errors.push(`presets/${entry}: missing field '${f}'`);
  }
  if (preset.id !== entry) errors.push(`presets/${entry}: id '${preset.id}' must match directory name`);

  if (seenIds.has(entry)) errors.push(`presets/${entry}: duplicate id`);
  seenIds.add(entry);

  const hooks = preset.hooks;
  if (Array.isArray(hooks)) {
    for (const h of hooks) {
      if (typeof h.event !== "string" || !validHookEvents.has(h.event)) {
        errors.push(`presets/${entry}: invalid hook event '${String(h.event)}'`);
      }
      if (typeof h.script !== "string") {
        errors.push(`presets/${entry}: hook missing 'script'`);
      } else if (!existsSync(join(dir, "hooks", h.script))) {
        errors.push(`presets/${entry}: hook script not found: hooks/${h.script}`);
      }
    }
  }

  if (existsSync(join(dir, "skills"))) {
    const skillDir = join(dir, "skills");
    let foundSkill = false;
    const walk = (d) => {
      for (const e of readdirSync(d)) {
        const p = join(d, e);
        if (statSync(p).isDirectory()) walk(p);
        else if (e === "SKILL.md") foundSkill = true;
      }
    };
    walk(skillDir);
    if (!foundSkill) errors.push(`presets/${entry}: skills/ dir has no SKILL.md`);
  }

  const manifest = join(dir, "kimi.plugin.json");
  if (existsSync(manifest)) {
    try {
      const m = JSON.parse(readFileSync(manifest, "utf8"));
      if (m.name !== entry) errors.push(`presets/${entry}: kimi.plugin.json name must be '${entry}'`);
    } catch {
      errors.push(`presets/${entry}/kimi.plugin.json: invalid JSON`);
    }
  }
}

if (errors.length > 0) {
  console.error("Preset validation failed:");
  for (const e of errors) console.error(`  - ${e}`);
  process.exit(1);
}
console.log(`OK: ${seenIds.size} presets valid`);
