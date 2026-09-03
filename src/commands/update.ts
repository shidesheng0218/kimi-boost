import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import * as tar from "tar";
import { presetsDir, storedPresetVersion } from "../core/config.js";
import { diffDirs, type DirDiff } from "../core/diffDirs.js";
import { removeIfWritable } from "../core/fsguard.js";
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

/** 轻量版本探测:只读远端 preset.json 的 version 字段(outdated/--check 用,不下载 tarball) */
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

/** 在解包根下定位包含 presets/ 的仓库目录(不硬编码 <repo>-<branch> 名,兼容 fork 改名) */
function findRepoRoot(root: string): string | undefined {
  for (const entry of readdirSync(root)) {
    const full = join(root, entry);
    try {
      if (statSync(full).isDirectory() && existsSync(join(full, "presets"))) return full;
    } catch {
      /* 忽略不可读项 */
    }
  }
  return undefined;
}

export async function fetchRemoteRegistry(opts: UpdateOptions = {}): Promise<RemoteRegistry> {
  const { repo, branch } = updateSource(opts);
  const res = await fetch(`https://codeload.github.com/${repo}/tar.gz/refs/heads/${branch}`);
  if (!res.ok) throw new Error(`tarball fetch failed: ${res.status} from ${repo}@${branch}`);
  const buf = Buffer.from(await res.arrayBuffer());

  const root = mkdtempSync(join(tmpdir(), "kboost-registry-"));
  try {
    const tarballPath = join(root, "src.tgz");
    writeFileSync(tarballPath, buf);
    await tar.x({ file: tarballPath, cwd: root });
    rmSync(tarballPath, { force: true });

    const repoRoot = findRepoRoot(root);
    if (!repoRoot) throw new Error(`presets/ not found in tarball of ${repo}@${branch}`);
    const base = join(repoRoot, "presets");

    return {
      root,
      presetDir: (id) => {
        const d = join(base, id);
        return existsSync(d) ? d : undefined;
      },
      version: (id) => {
        try {
          const p = JSON.parse(readFileSync(join(base, id, "preset.json"), "utf8")) as { version?: string };
          return p.version;
        } catch {
          return undefined;
        }
      },
      cleanup: () => rmSync(root, { recursive: true, force: true }),
    };
  } catch (err) {
    rmSync(root, { recursive: true, force: true });
    throw err;
  }
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

export async function runUpdate(opts: UpdateOptions = {}): Promise<UpdateResult[]> {
  const { installedOnly } = await listStatus();
  if (installedOnly.length === 0) {
    return [{ id: "(none)", status: "up-to-date", message: "no presets installed yet" }];
  }
  let registry: RemoteRegistry;
  try {
    registry = await fetchRemoteRegistry(opts);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return installedOnly.map((id) => ({ id, status: "error" as const, message }));
  }
  try {
    const results: UpdateResult[] = [];
    for (const id of installedOnly) {
      results.push(await applyFromRegistry(id, registry));
    }
    return results;
  } finally {
    registry.cleanup();
  }
}

/** 只读预览:对每个有更新的 preset 给出 远端解包目录 vs 本地 store 的文件级 diff,不写盘 */
export async function previewUpdate(opts: UpdateOptions = {}): Promise<UpdatePreview[]> {
  const { installedOnly } = await listStatus();
  if (installedOnly.length === 0) return [];
  let registry: RemoteRegistry;
  try {
    registry = await fetchRemoteRegistry(opts);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return installedOnly.map((id) => ({ id, status: "error" as const, message }));
  }
  try {
    const out: UpdatePreview[] = [];
    for (const id of installedOnly) {
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
    return out;
  } finally {
    registry.cleanup();
  }
}
