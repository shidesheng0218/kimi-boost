import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { kimiHomeDir } from "./detect.js";
import { readKimiConfig } from "./config.js";

/**
 * 检测某 preset 是否已通过 Kimi Code 官方 `/plugins` 通道安装。
 *
 * 官方机制:安装记录在 $KIMI_CODE_HOME/plugins/installed.json,
 * 插件本体拷贝到 $KIMI_CODE_HOME/plugins/managed/<id>/。
 * installed.json 的具体 schema 未公开,这里做格式自适应解析。
 */
export function kimiPluginInstalled(presetId: string): boolean {
  const home = kimiHomeDir();
  if (!existsSync(home)) return false;

  const managed = join(home, "plugins", "managed", presetId);
  if (existsSync(managed)) return true;

  const file = join(home, "plugins", "installed.json");
  if (existsSync(file)) {
    try {
      const data = JSON.parse(readFileSync(file, "utf8")) as Record<string, unknown>;
      const arr = Array.isArray(data.plugins) ? data.plugins : Array.isArray(data.installed) ? data.installed : [];
      return (arr as Array<Record<string, unknown>>).some((p) => {
        const id = String(p.id ?? p.name ?? p ?? "");
        return id === presetId;
      });
    } catch {
      /* unreadable record: fall back to dir probe only */
    }
  }
  return false;
}

interface PluginEntry {
  id: string;
  root: string;
}

function installedEntries(): PluginEntry[] {
  const home = kimiHomeDir();
  const managed = join(home, "plugins", "managed");
  const map = new Map<string, PluginEntry>();

  try {
    for (const entry of readdirSync(managed, { withFileTypes: true })) {
      if (entry.isDirectory()) map.set(entry.name, { id: entry.name, root: join(managed, entry.name) });
    }
  } catch {
    /* no managed dir */
  }

  const file = join(home, "plugins", "installed.json");
  if (existsSync(file)) {
    try {
      const data = JSON.parse(readFileSync(file, "utf8")) as Record<string, unknown>;
      const arr = Array.isArray(data.plugins) ? data.plugins : Array.isArray(data.installed) ? data.installed : [];
      for (const raw of arr) {
        if (typeof raw === "string") {
          if (raw.trim()) map.set(raw, { id: raw, root: join(managed, raw) });
          continue;
        }
        if (!raw || typeof raw !== "object") continue;
        const p = raw as Record<string, unknown>;
        if (p.enabled === false) continue;
        const id = typeof p.id === "string" ? p.id : typeof p.name === "string" ? p.name : "";
        if (!id.trim()) continue;
        const root = typeof p.root === "string" && p.root.trim() ? p.root : join(managed, id);
        map.set(id, { id, root });
      }
    } catch {
      /* malformed record: keep the directory probe result */
    }
  }

  return [...map.values()];
}

/** Installed Kimi plugins: managed directories ∪ installed.json ids. Read-only. */
export function installedKimiPlugins(): string[] {
  return installedEntries()
    .map((e) => e.id)
    .sort();
}

function readManifestHooks(root: string, events: string[]): void {
  const seen = new Set<string>();
  for (const file of [join(root, "kimi.plugin.json"), join(root, ".kimi-plugin", "plugin.json")]) {
    try {
      const data = JSON.parse(readFileSync(file, "utf8")) as { hooks?: unknown };
      if (!Array.isArray(data.hooks)) continue;
      for (const h of data.hooks) {
        if (!h || typeof h !== "object") continue;
        const rec = h as Record<string, unknown>;
        const ev = rec.event;
        if (typeof ev !== "string") continue;
        const key = `${ev}\0${String(rec.command ?? "")}`;
        if (seen.has(key)) continue;
        seen.add(key);
        events.push(ev);
      }
    } catch {
      /* missing or malformed manifest */
    }
  }
}

/**
 * Kimi hook events across both install channels: config.toml [[hooks]] and
 * plugin manifests (kimi.plugin.json or .kimi-plugin/plugin.json). Duplicates
 * are preserved so callers can count actual hook entries.
 */
function collectHookEvents(): string[] {
  const events: string[] = [];

  try {
    const hooks = readKimiConfig().data.hooks;
    if (Array.isArray(hooks)) {
      for (const h of hooks) {
        if (h && typeof h === "object" && typeof (h as Record<string, unknown>).event === "string") {
          events.push((h as Record<string, unknown>).event as string);
        }
      }
    }
  } catch {
    /* malformed config: plugin manifests may still provide events */
  }

  for (const entry of installedEntries()) readManifestHooks(entry.root, events);

  return events;
}

/** Deduped, sorted Kimi hook events across both install channels. */
export function kimiHookEvents(): string[] {
  return [...new Set(collectHookEvents())].sort();
}

/** Actual hook counts by event, preserving duplicates across channels. */
export function kimiHookSummary(): { total: number; byEvent: Record<string, number> } {
  const all = collectHookEvents();
  const byEvent: Record<string, number> = {};
  for (const e of all) byEvent[e] = (byEvent[e] ?? 0) + 1;
  return { total: all.length, byEvent };
}
