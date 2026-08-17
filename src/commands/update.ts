import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { existsSync } from "node:fs";
import * as tar from "tar";
import { presetsDir } from "../core/config.js";
import { copyDirIfWritable } from "../core/fsguard.js";
import { listStatus } from "./list.js";
import { installPreset } from "./install.js";

export interface UpdateResult {
  id: string;
  status: "updated" | "up-to-date" | "error";
  from?: string;
  to?: string;
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

function localVersion(id: string): string | undefined {
  const file = join(presetsDir(), id, "preset.json");
  if (!existsSync(file)) return undefined;
  try {
    return (JSON.parse(readFileSync(file, "utf8")) as { version?: string }).version;
  } catch {
    return undefined;
  }
}

export async function updatePreset(id: string, opts: UpdateOptions = {}): Promise<UpdateResult> {
  const { repo, branch } = updateSource(opts);
  const remote = await fetchRemotePreset(id, opts);
  if (!remote.ok) {
    return { id, status: "error", message: `failed to fetch remote registry from ${repo}@${branch} (offline?)` };
  }
  const local = localVersion(id);
  if (remote.version && local === remote.version) {
    return { id, status: "up-to-date", from: local, to: remote.version };
  }

  try {
    const res = await fetch(`https://codeload.github.com/${repo}/tar.gz/refs/heads/${branch}`);
    if (!res.ok) throw new Error(`tarball fetch failed: ${res.status}`);
    const buf = Buffer.from(await res.arrayBuffer());
    const root = join(presetsDir(), ".tmp-update");
    rmSync(root, { recursive: true, force: true });
    mkdirSync(root, { recursive: true });
    const tarballPath = join(root, "src.tgz");
    writeFileSync(tarballPath, buf);
    await tar.x({ file: tarballPath, cwd: root });
    const extracted = join(root, `kimi-boost-${branch}`, "presets", id);
    if (!existsSync(extracted)) throw new Error(`preset '${id}' not in tarball of ${repo}@${branch}`);

    const installDir = join(presetsDir(), id);
    rmSync(installDir, { recursive: true, force: true });
    copyDirIfWritable(extracted, installDir);
    rmSync(root, { recursive: true, force: true });

    const reports = await installPreset(id);
    for (const r of reports) {
      if (!r.ok) throw new Error(`re-activation failed on ${r.tool}: ${r.message}`);
    }
    return { id, status: "updated", from: local ?? "unknown", to: remote.version ?? "latest" };
  } catch (err) {
    return { id, status: "error", message: err instanceof Error ? err.message : String(err) };
  }
}

export async function runUpdate(opts: UpdateOptions = {}): Promise<UpdateResult[]> {
  const { installedOnly } = await listStatus();
  const results: UpdateResult[] = [];
  for (const id of installedOnly) {
    results.push(await updatePreset(id, opts));
  }
  if (installedOnly.length === 0) {
    results.push({ id: "(none)", status: "up-to-date", message: "no presets installed yet" });
  }
  return results;
}
