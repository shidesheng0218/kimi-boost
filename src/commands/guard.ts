import pc from "picocolors";
import {
  GUARD_REGISTRY,
  addCustomPattern,
  guardStats,
  guardsFile,
  readGuardLog,
  readGuardsConfig,
  setGuardDisabled,
} from "../core/guards.js";

/**
 * guard 命令:护栏的可见性与可调性。
 * 列表/拦截日志/启停/自定义模式——不用重装 preset 就能调整护栏。
 */

export interface GuardOptions {
  log?: boolean;
  enable?: string;
  disable?: string;
  addPattern?: string;
  /** log 模式下显示条数 */
  n?: string;
}

function renderList(): void {
  const cfg = readGuardsConfig();
  const stats = guardStats(30);
  const countBy = new Map(stats.byGuard.map((g) => [g.guard, g.count]));

  console.log(pc.bold("🛡️ kimi-boost 护栏"));
  console.log("");
  for (const g of GUARD_REGISTRY) {
    const disabled = cfg.disabled.includes(g.name);
    const status = disabled ? pc.red("○ 已停用") : pc.green("● 启用中");
    const blocks = countBy.get(g.name) ?? 0;
    console.log(`${status}  ${pc.bold(g.name)}  ${pc.dim(`(preset: ${g.preset}, 30 天拦截 ${blocks} 次)`)}`);
    console.log(`     ${pc.dim(g.description)}`);
  }
  if (cfg.customPatterns.length > 0) {
    console.log("");
    console.log(pc.dim(`自定义拦截模式(${cfg.customPatterns.length}): ${cfg.customPatterns.join(", ")}`));
  }
  console.log("");
  console.log(pc.dim(`近 30 天共拦截 ${stats.total} 次 · 明细: kimi-boost guard log`));
  console.log(pc.dim(`调整: guard disable <名称> / enable <名称> / add-pattern <正则> · 配置文件 ${guardsFile()}`));
}

function renderLog(n: number): void {
  const events = readGuardLog().slice(-n).reverse();
  if (events.length === 0) {
    console.log(pc.dim("还没有拦截记录。护栏拦到危险操作时,会在这里留下明细。"));
    return;
  }
  console.log(pc.bold(`🛡️ 最近 ${events.length} 次拦截`));
  console.log("");
  for (const e of events) {
    const when = e.ts.slice(0, 16).replace("T", " ");
    console.log(`${pc.dim(when)}  ${pc.yellow(e.guard)}${e.tool ? pc.dim(` (${e.tool})`) : ""}`);
    if (e.preview) console.log(`     ${pc.dim(e.preview)}`);
  }
}

export function runGuard(opts: GuardOptions = {}): void {
  if (opts.enable) {
    setGuardDisabled(opts.enable, false);
    console.log(`${pc.green("✓")} 已启用护栏 ${pc.bold(opts.enable)}(下次 agent 调用即生效)`);
    return;
  }
  if (opts.disable) {
    if (!GUARD_REGISTRY.some((g) => g.name === opts.disable)) {
      console.warn(pc.yellow(`[warn] '${opts.disable}' 不在已知守卫清单里,仍会写入配置(对自定义/未来守卫有效)。`));
    }
    setGuardDisabled(opts.disable, true);
    console.log(`${pc.yellow("⚠")} 已停用护栏 ${pc.bold(opts.disable)}(下次 agent 调用即生效,可用 guard enable 恢复)`);
    return;
  }
  if (opts.addPattern) {
    try {
      new RegExp(opts.addPattern);
    } catch {
      throw new Error(`非法正则: ${opts.addPattern}`);
    }
    addCustomPattern(opts.addPattern);
    console.log(`${pc.green("✓")} 已为 block-dangerous 加自定义拦截模式: ${pc.cyan(opts.addPattern)}`);
    return;
  }
  if (opts.log) {
    const n = Math.min(200, Math.max(1, Number(opts.n ?? 20) || 20));
    renderLog(n);
    return;
  }
  renderList();
}
