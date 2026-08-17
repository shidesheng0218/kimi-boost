import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { existsSync } from "node:fs";
import * as tar from "tar";
import { PRESETS_DIR } from "../core/config.js";
import { getPreset, presetSourceDir } from "../registry/presets.js";
import { listStatus } from "./list.js";
import { installPreset } from "./install.js";

export interface UpdateResult {
  id: string;
  status: "updated" | "up-to-date" | "error";
  from?: string;
  to?: string;
  message?: string;
}

const REPO = "shidesheng0218/kimi-boost";
const BRANCH = "main";
const RAW = `https://raw.githubusercontent.com/${REPO}/${BRANCH}`;
const TARBALL = `https://codeload.github.com/${REPO}/tar.gz/refs/heads/${BRANCH}`;

export async function fetchRemotePreset(id: string): Promise<{ version?: string; ok: boolean }> {
  try {
    const res = await fetch(`${RAW}/presets/${id}/preset.json`);
    if (!res.ok) return { ok: false };
    const data = (await res.json()) as { version?: string };
    return { version: data.version, ok: true };
  } catch {
    return { ok: false };
  }
}

function localVersion(id: string): string | undefined {
  const file = join(PRESETS_DIR, id, "preset.json");
  if (!existsSync(file)) return undefined;
  try {
    return (JSON.parse(readFileSync(file, "utf8")) as { version?: string }).version;
  } catch {
    return undefined;
  }
}

export async function updatePreset(id: string): Promise<UpdateResult> {
  const remote = await fetchRemotePreset(id);
  if (!remote.ok) {
    return { id, status: "error", message: "failed to fetch remote registry (offline?)" };
  }
  const local = localVersion(id);
  if (remote.version && local === remote.version) {
    return { id, status: "up-to-date", from: local, to: remote.version };
  }

  try {
    const res = await fetch(TARBALL);
    if (!res.ok) throw new Error(`tarball fetch failed: ${res.status}`);
    const buf = Buffer.from(await res.arrayBuffer());
    const root = join(PRESETS_DIR, ".tmp-update");
    rmSync(root, { recursive: true, force: true });
    mkdirSync(root, { recursive: true });
    const tarballPath = join(root, "src.tgz");
    writeFileSync(tarballPath, buf);
    await tar.x({ file: tarballPath, cwd: root });
    const extracted = join(root, `kimi-boost-${BRANCH}`, "presets", id);
    if (!existsSync(extracted)) throw new Error(`preset '${id}' not in tarball`);

    const installDir = join(PRESETS_DIR, id);
    rmSync(installDir, { recursive: true, force: true });
    const { copyDir } = await import("./util.js");
    copyDir(extracted, installDir);
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

export async function runUpdate(): Promise<UpdateResult[]> {
  const { installedOnly } = await listStatus();
  const results: UpdateResult[] = [];
  for (const id of installedOnly) {
    results.push(await updatePreset(id));
  }
  if (installedOnly.length === 0) {
    results.push({ id: "(none)", status: "up-to-date", message: "no presets installed yet" });
  }
  return results;
}
