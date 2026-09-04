import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { presetsDir, storedPresetVersion } from "../core/config.js";
import { diffDirs, type DirDiff } from "../core/diffDirs.js";
import { removeIfWritable } from "../core/fsguard.js";
import { downloadRepoTarball, findDirWith } from "../core/github.js";
import { readSources, type SourceInfo } from "../core/sources.js";
import { listStatus } from "./list.js";
import { installPreset } from "./install.js";

export interface UpdateResult {
  id: string;
  status: "updated" | "up-to-date" | "error";
  from?: string;
  to?: string;
  message?: string;
}

export interface UpdatePreview {
  id: string;
  status: "update-available" | "up-to-date" | "error";
  from?: string;
  to?: string;
  diff?: DirDiff;
  message?: string;
}

export interface UpdateOptions {
  /** 自定义 registry 仓库(fork 场景),默认官方仓库 */
  repo?: string;
  branch?: string;
}

export function updateSource(opts: UpdateOptions = {}): { repo: string; branch: string } {
  const repo = opts.repo ?? process.env.KIMI_BOOST_REPO ?? "shidesheng0218/kimi-boost";
  const branch = opts.branch ?? process.env.KIMI_BOOST_BRANCH ?? "main";
  return { repo, branch };
}

/** 轻量版本探测:只读官方 registry 中 preset.json 的 version 字段(outdated/--check 用,不下载 tarball) */
export async function fetchRemotePreset(id: string, opts: UpdateOptions = {}): Promise<{ version?: string; ok: boolean }> {
  const { repo, branch } = updateSource(opts);
  try {
    const res = await fetch(`https://raw.githubusercontent.com/${repo}/${branch}/presets/${id}/preset.json`);
    if (!res.ok) return { ok: false };
    const data = (await res.json()) as { version?: string };
    return { version: data.version, ok: true };
  } catch {
    return { ok: false };
  }
}

/** 社区 preset 的远端版本:读其来源仓库根目录的 preset.json */
export async function fetchRemoteRepoVersion(source: SourceInfo): Promise<{ version?: string; ok: boolean }> {
  try {
    const res = await fetch(`https://raw.githubusercontent.com/${source.repo}/${source.ref}/preset.json`);
    if (!res.ok) return { ok: false };
    const data = (await res.json()) as { version?: string };
    return { version: data.version, ok: true };
  } catch {
    return { ok: false };
  }
}

/** 本地安装的预设版本(读取用户级预设存储),供 update/outdated 共用 */
export function localVersion(id: string): string | undefined {
  return storedPresetVersion(id);
}

/** 解包后的远端 registry(update / --dry-run 用:整库只下载一次,finally 清理) */
export interface RemoteRegistry {
  /** 临时根目录 */
  root: string;
  /** 某 preset 的解包目录(不存在则 undefined) */
  presetDir(id: string): string | undefined;
  /** 某 preset 的远端版本(读解包出的 preset.json) */
  version(id: string): string | undefined;
  /** 清理临时目录 */
  cleanup(): void;
}

export async function fetchRemoteRegistry(opts: UpdateOptions = {}): Promise<RemoteRegistry> {
  const { repo, branch } = updateSource(opts);
  const dl = await downloadRepoTarball(repo, branch);
  try {
    const repoRoot = findDirWith(dl.root, "presets");
    if (!repoRoot) throw new Error(`presets/ not found in tarball of ${repo}@${branch}`);
    const base = join(repoRoot, "presets");
    return {
      root: dl.root,
      presetDir: (id) => {
        const d = join(base, id);
        return existsSync(d) ? d : undefined;
      },
      version: (id) => readPresetVersionAt(join(base, id)),
      cleanup: dl.cleanup,
    };
  } catch (err) {
    dl.cleanup();
    throw err;
  }
}

function readPresetVersionAt(dir: string): string | undefined {
  try {
    const p = JSON.parse(readFileSync(join(dir, "preset.json"), "utf8")) as { version?: string };
    return p.version;
  } catch {
    return undefined;
  }
}

/** 按 store 中的来源标记,把已安装 preset 分为 官方 registry 组 / 社区仓库组 */
function partitionBySource(ids: string[]): { official: string[]; community: Array<{ id: string; source: SourceInfo }> } {
  const sources = readSources();
  const official: string[] = [];
  const community: Array<{ id: string; source: SourceInfo }> = [];
  for (const id of ids) {
    const s = sources[id];
    if (s?.repo) community.push({ id, source: s });
    else official.push(id);
  }
  return { official, community };
}

/** 把解包出的远端 preset 应用到本地(store 刷新 + 各端激活),从远端内容而非内置目录激活 */
async function applyFromRegistry(id: string, registry: RemoteRegistry): Promise<UpdateResult> {
  const local = localVersion(id);
  const remoteVersion = registry.version(id);
  const srcDir = registry.presetDir(id);
  if (!srcDir) return { id, status: "error", message: `preset '${id}' not found in remote registry` };
  if (remoteVersion && local === remoteVersion) {
    return { id, status: "up-to-date", from: local, to: remoteVersion };
  }
  try {
    // 先清掉旧 store 再装,保证 store 与新版内容一致(不留旧版残留文件)
    removeIfWritable(join(presetsDir(), id), { recursive: true, force: true });
    const reports = await installPreset(id, { sourceDir: srcDir });
    for (const r of reports) {
      if (!r.ok) throw new Error(`re-activation failed on ${r.tool}: ${r.message}`);
    }
    return { id, status: "updated", from: local ?? "unknown", to: remoteVersion ?? "latest" };
  } catch (err) {
    return { id, status: "error", message: err instanceof Error ? err.message : String(err) };
  }
}

/** 社区 preset 的更新:从其来源仓库(单 preset 仓库,preset.json 在根)下载并重装 */
async function applyCommunity(id: string, source: SourceInfo): Promise<UpdateResult> {
  const local = localVersion(id);
  let dl;
  try {
    dl = await downloadRepoTarball(source.repo, source.ref);
  } catch (err) {
    return { id, status: "error", message: err instanceof Error ? err.message : String(err) };
  }
  try {
    const presetRoot = findDirWith(dl.root, "preset.json");
    if (!presetRoot) return { id, status: "error", message: `preset.json not found in ${source.repo}@${source.ref}` };
    const remoteVersion = readPresetVersionAt(presetRoot);
    if (remoteVersion && local === remoteVersion) {
      return { id, status: "up-to-date", from: local, to: remoteVersion };
    }
    removeIfWritable(join(presetsDir(), id), { recursive: true, force: true });
    const reports = await installPreset(id, { sourceDir: presetRoot });
    for (const r of reports) {
      if (!r.ok) throw new Error(`re-activation failed on ${r.tool}: ${r.message}`);
    }
    return { id, status: "updated", from: local ?? "unknown", to: remoteVersion ?? "latest" };
  } catch (err) {
    return { id, status: "error", message: err instanceof Error ? err.message : String(err) };
  } finally {
    dl.cleanup();
  }
}

export async function runUpdate(opts: UpdateOptions = {}): Promise<UpdateResult[]> {
  const { installedOnly } = await listStatus();
  if (installedOnly.length === 0) {
    return [{ id: "(none)", status: "up-to-date", message: "no presets installed yet" }];
  }
  const { official, community } = partitionBySource(installedOnly);
  const results: UpdateResult[] = [];

  if (official.length > 0) {
    let registry: RemoteRegistry | undefined;
    try {
      registry = await fetchRemoteRegistry(opts);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      results.push(...official.map((id) => ({ id, status: "error" as const, message })));
    }
    if (registry) {
      try {
        for (const id of official) results.push(await applyFromRegistry(id, registry));
      } finally {
        registry.cleanup();
      }
    }
  }

  for (const { id, source } of community) {
    results.push(await applyCommunity(id, source));
  }
  return results;
}

/** 社区 preset 的预览:源仓库根目录 vs 本地 store 的文件级 diff */
async function previewCommunity(id: string, source: SourceInfo): Promise<UpdatePreview> {
  const local = localVersion(id);
  let dl;
  try {
    dl = await downloadRepoTarball(source.repo, source.ref);
  } catch (err) {
    return { id, status: "error", message: err instanceof Error ? err.message : String(err) };
  }
  try {
    const presetRoot = findDirWith(dl.root, "preset.json");
    if (!presetRoot) return { id, status: "error", message: `preset.json not found in ${source.repo}@${source.ref}` };
    const remoteVersion = readPresetVersionAt(presetRoot);
    if (remoteVersion && local === remoteVersion) {
      return { id, status: "up-to-date", from: local, to: remoteVersion };
    }
    const diff = diffDirs(join(presetsDir(), id), presetRoot);
    return { id, status: "update-available", from: local ?? "unknown", to: remoteVersion ?? "latest", diff };
  } finally {
    dl.cleanup();
  }
}

/** 只读预览:对每个有更新的 preset 给出 远端 vs 本地 store 的文件级 diff,不写盘 */
export async function previewUpdate(opts: UpdateOptions = {}): Promise<UpdatePreview[]> {
  const { installedOnly } = await listStatus();
  if (installedOnly.length === 0) return [];
  const { official, community } = partitionBySource(installedOnly);
  const out: UpdatePreview[] = [];

  if (official.length > 0) {
    let registry: RemoteRegistry | undefined;
    try {
      registry = await fetchRemoteRegistry(opts);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      out.push(...official.map((id) => ({ id, status: "error" as const, message })));
    }
    if (registry) {
      try {
        for (const id of official) {
          const local = localVersion(id);
          const remoteVersion = registry.version(id);
          const srcDir = registry.presetDir(id);
          if (!srcDir) {
            out.push({ id, status: "error", message: `preset '${id}' not found in remote registry` });
            continue;
          }
          if (remoteVersion && local === remoteVersion) {
            out.push({ id, status: "up-to-date", from: local, to: remoteVersion });
            continue;
          }
          const diff = diffDirs(join(presetsDir(), id), srcDir);
          out.push({ id, status: "update-available", from: local ?? "unknown", to: remoteVersion ?? "latest", diff });
        }
      } finally {
        registry.cleanup();
      }
    }
  }

  for (const { id, source } of community) {
    out.push(await previewCommunity(id, source));
  }
  return out;
}
