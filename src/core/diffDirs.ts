import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

/**
 * 目录级内容 diff(update --dry-run 用):递归遍历 + sha256 比较,
 * 返回 next 相对 current 的 新增/修改/删除 相对路径清单。纯函数、只读、可单测。
 */

export interface DirDiff {
  /** next 有而 current 没有(更新将新增) */
  added: string[];
  /** 两边都有但内容不同(更新将覆盖) */
  modified: string[];
  /** current 有而 next 没有(更新将移除) */
  removed: string[];
}

function walk(dir: string, base: string, out: Map<string, string>): void {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      walk(full, base, out);
      continue;
    }
    const rel = relative(base, full);
    const hash = createHash("sha256").update(readFileSync(full)).digest("hex");
    out.set(rel, hash);
  }
}

/** 目录快照:相对路径 -> 内容哈希。目录不存在时按空处理。 */
function snapshot(root: string): Map<string, string> {
  const out = new Map<string, string>();
  if (existsSync(root)) walk(root, root, out);
  return out;
}

/** 比较 current(旧,如本地 store)与 next(新,如远端解包),返回 next 带来的差异 */
export function diffDirs(currentDir: string, nextDir: string): DirDiff {
  const cur = snapshot(currentDir);
  const nxt = snapshot(nextDir);
  const added: string[] = [];
  const modified: string[] = [];
  const removed: string[] = [];

  for (const [rel, hash] of nxt) {
    if (!cur.has(rel)) added.push(rel);
    else if (cur.get(rel) !== hash) modified.push(rel);
  }
  for (const rel of cur.keys()) {
    if (!nxt.has(rel)) removed.push(rel);
  }

  return { added: added.sort(), modified: modified.sort(), removed: removed.sort() };
}
