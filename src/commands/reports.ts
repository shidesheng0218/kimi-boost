import pc from "picocolors";
import type { InstallReport } from "../adapters/types.js";

/**
 * 打印 per-tool 安装/卸载报告。
 * 非 dry-run 且任一结果 ok:false 时,把进程退出码置 1(部分失败必须可被脚本感知)。
 */
export function renderReports(reports: InstallReport[], opts: { dryRun?: boolean; action?: "write" | "remove" } = {}): void {
  let failed = false;
  for (const r of reports) {
    const prefix = opts.dryRun ? pc.cyan("dry-run") : (r.ok ? pc.green("✓") : pc.red("✗"));
    console.log(`${prefix} [${r.tool}] ${r.message}`);
    if (opts.dryRun) {
      for (const c of r.changed) console.log(`   ${pc.dim(`would ${opts.action ?? "write"}:`)} ${c}`);
    }
    if (!r.ok) failed = true;
  }
  if (failed && !opts.dryRun) process.exitCode = 1;
}
