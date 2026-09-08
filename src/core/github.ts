import { existsSync, mkdtempSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import * as tar from "tar";

/**
 * GitHub 仓库 tarball 下载/解包的共享基础设施(update registry 与社区 preset 安装复用)。
 * 下载一次、解包到 OS 临时目录、调用方负责 cleanup()(或泄漏由 OS 回收)。
 */

export interface DownloadedRepo {
  /** 临时根目录(内含解包出的 <repo>-<sha>/ 顶层目录) */
  root: string;
  cleanup(): void;
}

const FETCH_TIMEOUT_MS = 30_000;

async function fetchTarballBuffer(repo: string, ref: string): Promise<Buffer> {
  // ref 可能是分支或 tag,两种 refs 路径都试
  let lastUrl = "";
  let lastFailure: Error | undefined;
  for (const kind of ["heads", "tags"] as const) {
    const url = `https://codeload.github.com/${repo}/tar.gz/refs/${kind}/${ref}`;
    lastUrl = url;
    lastFailure = undefined;
    // 网络类错误(超时/连接失败/非 404 状态码)重试 1 次;404 直接换另一种 ref 形态
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const res = await fetch(url, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
        if (res.ok) return Buffer.from(await res.arrayBuffer());
        if (res.status === 404) break;
        lastFailure = new Error(`HTTP ${res.status}`);
      } catch (err) {
        lastFailure = err instanceof Error ? err : new Error(String(err));
      }
    }
  }
  if (lastFailure) {
    throw new Error(
      `网络请求失败,无法下载 ${repo}@${ref}(${lastUrl}):${lastFailure.message}。请检查网络/代理后重试。`,
    );
  }
  throw new Error(
    `仓库或 ref 不存在(404):${repo}@${ref}(${lastUrl},已尝试 branch 和 tag 两种形态)。请确认仓库名与 ref 是否正确。`,
  );
}

export async function downloadRepoTarball(repo: string, ref: string): Promise<DownloadedRepo> {
  const buf = await fetchTarballBuffer(repo, ref);
  const root = mkdtempSync(join(tmpdir(), "kboost-repo-"));
  try {
    const tarballPath = join(root, "src.tgz");
    writeFileSync(tarballPath, buf);
    await tar.x({ file: tarballPath, cwd: root });
    rmSync(tarballPath, { force: true });
    return { root, cleanup: () => rmSync(root, { recursive: true, force: true }) };
  } catch (err) {
    rmSync(root, { recursive: true, force: true });
    throw err;
  }
}

/** 在解包根下定位"顶层子目录中含 marker(文件或目录)"的那个目录(不硬编码 <repo>-<ref> 目录名) */
export function findDirWith(root: string, marker: string): string | undefined {
  for (const entry of readdirSync(root)) {
    const full = join(root, entry);
    try {
      if (statSync(full).isDirectory() && existsSync(join(full, marker))) return full;
    } catch {
      /* 忽略不可读项 */
    }
  }
  return undefined;
}
