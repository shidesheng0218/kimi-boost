import pc from "picocolors";
import {
  GUARD_REGISTRY,
  addCustomPattern,
  guardStats,
  guardsFile,
  installGitHook,
  readGuardLog,
  readGuardsConfig,
  scanChangedFiles,
  setGuardDisabled,
  setGuardMode,
  uninstallGitHook,
} from "../core/guards.js";

/**
 * guard 命令:护栏的可见性与可调性。
 * 列表/拦截日志/启停/模式/自定义模式/解释/CI 扫描/git hook——不重装 preset 即可调整。
 */

export interface GuardOptions {
  log?: boolean;
  /** log 模式下显示条数 */
  n?: string;
  enable?: string;
  disable?: string;
  addPattern?: string;
  /** 软化为 warn 模式(记录+提示但放行) */
  warn?: string;
  /** 恢复为 block 模式(默认) */
  block?: string;
  /** 解释某个守卫拦什么、如何放行、关掉的风险 */
  explain?: string;
  /** CI 模式:扫描变更文件里的密钥,命中退出码 1 */
  ci?: boolean;
  /** 与 --ci 搭配:只扫暂存区(pre-commit 场景) */
  staged?: boolean;
  installGitHook?: boolean;
  uninstallGitHook?: boolean;
}

function renderList(): void {
  const cfg = readGuardsConfig();
  const stats = guardStats(30);
  const countBy = new Map(stats.byGuard.map((g) => [g.guard, g.count]));

  console.log(pc.bold("🛡️ kimi-boost 护栏"));
  console.log("");
  for (const g of GUARD_REGISTRY) {
    const disabled = cfg.disabled.includes(g.name);
    const mode = cfg.modes[g.name] ?? "block";
    const status = disabled
      ? pc.red("○ 已停用")
      : mode === "warn"
        ? pc.yellow("◐ warn 模式")
        : pc.green("● 启用中");
    const blocks = countBy.get(g.name) ?? 0;
    console.log(`${status}  ${pc.bold(g.name)}  ${pc.dim(`(preset: ${g.preset}, 30 天拦截 ${blocks} 次)`)}`);
    console.log(`     ${pc.dim(g.description)}`);
  }
  if (cfg.customPatterns.length > 0) {
    console.log("");
    console.log(pc.dim(`自定义拦截模式(${cfg.customPatterns.length}): ${cfg.customPatterns.join(", ")}`));
  }
  console.log("");
  console.log(pc.dim(`近 30 天共拦截 ${stats.total} 次 · 明细: kimi-boost guard --log`));
  console.log(pc.dim(`调整: --disable/--enable <名称> · --warn/--block <名称> · --add-pattern <正则> · --explain <名称>`));
  console.log(pc.dim(`CI/提交闸: kimi-boost guard --ci [--staged] · --install-git-hook / --uninstall-git-hook · 配置 ${guardsFile()}`));
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

function renderExplain(name: string): void {
  const info = GUARD_REGISTRY.find((g) => g.name === name);
  if (!info) {
    throw new Error(`未知守卫 '${name}'。可用: ${GUARD_REGISTRY.map((g) => g.name).join(", ")}`);
  }
  console.log(`${pc.bold("🛡️ " + info.name)}  ${pc.dim(`(preset: ${info.preset})`)}`);
  console.log(`   ${info.description}`);
  console.log("");
  console.log(`${pc.bold("拦什么")}  ${info.blocks}`);
  console.log(`${pc.bold("误伤时")}  ${info.bypass}`);
  console.log(`${pc.bold("关掉风险")}  ${info.risk}`);
}

export function runGuard(opts: GuardOptions = {}): void {
  if (opts.ci) {
    const { files, findings } = scanChangedFiles({ staged: opts.staged });
    const scope = opts.staged ? "暂存区" : "工作区变更";
    if (findings.length === 0) {
      console.log(`${pc.green("✓")} 护栏 CI 扫描通过:${scope} ${files.length} 个文件未发现疑似密钥`);
      return;
    }
    console.error(pc.red(`✗ 护栏 CI 扫描发现 ${findings.length} 处疑似密钥(${scope}):`));
    for (const f of findings) {
      console.error(`  ${pc.yellow(f.file)}:${f.line}  ${f.pattern}`);
    }
    console.error(pc.dim("  处理:把密钥改为环境变量读取;若已提交,吊销并轮换。误报可 kimi-boost guard --disable secret-scan"));
    process.exitCode = 1;
    return;
  }

  if (opts.installGitHook) {
    const r = installGitHook();
    console.log(`${pc.green("✓")} 已${r.mode === "created" ? "创建" : "更新"} git pre-commit hook: ${r.path}`);
    console.log(pc.dim("  提交时会自动运行 kimi-boost guard --ci --staged(受管块,可 --uninstall-git-hook 移除)"));
    return;
  }
  if (opts.uninstallGitHook) {
    const r = uninstallGitHook();
    console.log(r.removed ? `${pc.green("✓")} 已移除 kimi-boost 的 pre-commit 受管块: ${r.path}` : pc.dim(`未找到 kimi-boost 受管块: ${r.path}`));
    return;
  }

  if (opts.explain) {
    renderExplain(opts.explain);
    return;
  }
  if (opts.warn) {
    setGuardMode(opts.warn, "warn");
    console.log(`${pc.yellow("◐")} 护栏 ${pc.bold(opts.warn)} 已切换为 warn 模式(仍会记录与提示,但不再阻断)`);
    return;
  }
  if (opts.block) {
    setGuardMode(opts.block, "block");
    console.log(`${pc.green("✓")} 护栏 ${pc.bold(opts.block)} 已恢复 block 模式(命中即阻断)`);
    return;
  }
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
    console.log(`${pc.yellow("⚠")} 已停用护栏 ${pc.bold(opts.disable)}(下次 agent 调用即生效,可用 --enable 恢复)`);
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