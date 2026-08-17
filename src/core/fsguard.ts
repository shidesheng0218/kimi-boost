import { copyFileSync, mkdirSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";

/**
 * 统一写入封装 + dry-run 支持。
 * dry-run 模式下所有文件系统写入都被跳过,但动作仍会被"记录"(返回清单),
 * 使 install/remove 的 dry-run 能输出完整的执行计划。
 */
let _dryRun = false;

export function setDryRun(v: boolean): void {
  _dryRun = v;
}

export function isDryRun(): boolean {
  return _dryRun;
}

export function ensureDir(dir: string): void {
  if (!_dryRun) mkdirSync(dir, { recursive: true });
}

export function writeFileIfWritable(path: string, data: string | Buffer): void {
  if (!_dryRun) writeFileSync(path, data);
}

export function copyFileIfWritable(src: string, dest: string): void {
  if (!_dryRun) copyFileSync(src, dest);
}

export function removeIfWritable(path: string, opts?: { recursive?: boolean; force?: boolean }): void {
  if (!_dryRun) rmSync(path, opts);
}

/**
 * 复制目录;返回将被写入的文件绝对路径清单(dry-run 时同样返回预期清单)。
 */
export function copyDirIfWritable(src: string, dest: string): string[] {
  const written: string[] = [];
  ensureDir(dest);
  for (const entry of readdirSync(src)) {
    const s = join(src, entry);
    const d = join(dest, entry);
    if (statSync(s).isDirectory()) {
      written.push(...copyDirIfWritable(s, d));
    } else {
      copyFileIfWritable(s, d);
      written.push(d);
    }
  }
  return written;
}
