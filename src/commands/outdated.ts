import { listStatus } from "./list.js";
import { fetchRemotePreset, fetchRemoteRepoVersion, localVersion, updateSource, type UpdateOptions } from "./update.js";
import { projectInstalledPresets } from "../core/project.js";
import { readSources } from "../core/sources.js";

export type OutdatedStatus = "up-to-date" | "update-available" | "unknown-local" | "unknown-remote" | "error";

export interface OutdatedRow {
  id: string;
  /** 本地记录的已安装版本(未知为 undefined) */
  installed?: string;
  /** 远端 registry 的最新版本(未知为 undefined) */
  latest?: string;
  status: OutdatedStatus;
  message?: string;
}

export interface OutdatedOptions extends UpdateOptions {
  /** 检查项目级预设(.kimi-boost/installed.json)而非用户级 */
  project?: boolean;
  /** 测试注入口:覆盖已安装预设清单 */
  ids?: string[];
}

/**
 * 对比本地已安装预设与远端 registry 的版本。
 * 本地版本来源:项目级取项目 manifest;用户级取本地预设存储(presetsDir/<id>/preset.json)。
 */
export async function runOutdated(opts: OutdatedOptions = {}): Promise<OutdatedRow[]> {
  let ids: string[];
  const manifestVersions = new Map<string, string | undefined>();

  if (opts.project) {
    const rows = projectInstalledPresets();
    ids = rows.map((r) => r.id);
    for (const r of rows) manifestVersions.set(r.id, r.version);
  } else if (opts.ids) {
    ids = opts.ids;
  } else {
    ids = (await listStatus()).installedOnly;
  }

  const { repo, branch } = updateSource(opts);
  const sources = readSources();
  const rows: OutdatedRow[] = [];
  for (const id of ids) {
    const installed = manifestVersions.get(id) ?? localVersion(id);
    const source = sources[id];
    const fromLabel = source ? `${source.repo}@${source.ref}` : `${repo}@${branch}`;
    try {
      // 社区 preset 从来源仓库根目录读版本;官方 preset 走 registry
      const remote = source ? await fetchRemoteRepoVersion(source) : await fetchRemotePreset(id, opts);
      if (!remote.ok) {
        rows.push({ id, installed, status: "unknown-remote", message: `remote unreachable (${fromLabel})` });
      } else if (!remote.version) {
        rows.push({ id, installed, status: "unknown-remote", message: "remote preset.json has no version field" });
      } else if (!installed) {
        rows.push({ id, latest: remote.version, status: "unknown-local", message: "installed version unknown; run 'kimi-boost update' to refresh" });
      } else if (installed === remote.version) {
        rows.push({ id, installed, latest: remote.version, status: "up-to-date" });
      } else {
        rows.push({ id, installed, latest: remote.version, status: "update-available" });
      }
    } catch (err) {
      rows.push({ id, installed, status: "error", message: err instanceof Error ? err.message : String(err) });
    }
  }
  return rows;
}

/** 渲染为等宽表格 */
export function renderOutdated(rows: OutdatedRow[]): string {
  const statusText: Record<OutdatedStatus, string> = {
    "up-to-date": "✓ up to date",
    "update-available": "↑ update available",
    "unknown-local": "? local version unknown",
    "unknown-remote": "? not in remote registry",
    error: "✗ error",
  };
  const headers = ["Preset", "Installed", "Latest", "Status"];
  const cells = rows.map((r) => [r.id, r.installed ?? "?", r.latest ?? "?", statusText[r.status]]);
  const widths = headers.map((h, i) => Math.max(h.length, ...cells.map((c) => c[i].length)));
  const line = (cols: string[]) => cols.map((c, i) => c.padEnd(widths[i])).join("  ").trimEnd();
  return [line(headers), ...cells.map(line)].join("\n");
}
