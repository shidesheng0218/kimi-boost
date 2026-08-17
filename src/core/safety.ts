import { existsSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
/**
 * kimi-boost 可安全管理的目录白名单。
 * 任何 rm/覆盖操作的目标必须位于这些目录之一,否则拒绝执行。
 */
export function managedRoots(): string[] {
  const boost = process.env.KIMI_BOOST_HOME ?? join(homedir(), ".kimi-boost");
  const kimiHome = process.env.KIMI_CODE_HOME ?? join(homedir(), ".kimi-code");
  const claudeHome = process.env.CLAUDE_CODE_HOME ?? join(homedir(), ".claude");
  const codexHome = process.env.CODEX_HOME ?? join(homedir(), ".codex");
  return [boost, kimiHome, claudeHome, codexHome];
}

/**
 * 校验路径是否位于 kimi-boost 管理白名单内。
 * 抛错时提示该操作拒绝执行,防止误删用户数据。
 */
export function assertManagedPath(path: string): void {
  const roots = managedRoots();
  const ok = roots.some((r) => {
    const rel = path.startsWith(r) ? path.slice(r.length) : undefined;
    return rel !== undefined && !rel.includes("..");
  });
  if (!ok) {
    throw new Error(
      `Refusing to modify '${path}': outside kimi-boost managed roots. ` +
        "This is a safety guard to prevent accidental deletion of user data. " +
        "If you are testing, set KIMI_BOOST_HOME/KIMI_CODE_HOME/CLAUDE_CODE_HOME to a sandbox directory.",
    );
  }
}

/**
 * 交互式 TUI 安装前提示:目标目录是否包含未知数据(仅提示,不阻止)。
 */
export function warnIfActiveUse(homeDir: string, tool: string): void {
  if (!existsSync(homeDir)) return;
  const recent = Date.now() - statSync(homeDir).mtimeMs < 60_000;
  if (recent) {
    console.warn(
      `[safety] ${tool} home '${homeDir}' was modified in the last minute — ` +
        "the tool may be in active use. A backup is taken before any change.",
    );
  }
}
