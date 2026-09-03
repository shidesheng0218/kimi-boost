import pc from "picocolors";
import prompts from "prompts";
import { detectProjectPresets, type ProjectSignal } from "../core/detectProject.js";
import { findProjectRoot, installProjectPreset } from "../core/project.js";
import type { ToolName } from "../core/types.js";
import type { InstallReport } from "../adapters/types.js";
import { installPreset } from "./install.js";
import { listStatus } from "./list.js";

export interface InitOptions {
  tool?: ToolName;
  project?: boolean;
  /** 跳过交互,直接安装全部检测到的 preset(CI/脚本场景) */
  yes?: boolean;
  dryRun?: boolean;
}

function renderReports(reports: InstallReport[], dryRun?: boolean): void {
  for (const r of reports) {
    const prefix = dryRun ? pc.cyan("dry-run") : r.ok ? pc.green("✓") : pc.red("✗");
    console.log(`${prefix} [${r.tool}] ${r.message}`);
    if (dryRun) {
      for (const c of r.changed) console.log(`   ${pc.dim("would write:")} ${c}`);
    }
  }
}

export async function runInit(opts: InitOptions = {}): Promise<void> {
  const { root } = findProjectRoot();
  const signals = detectProjectPresets(root);

  if (signals.length === 0) {
    console.log(pc.yellow("未识别出项目类型(未发现 go.mod / package.json / Cargo.toml 等标记文件)。"));
    console.log(`可用 ${pc.cyan("kimi-boost list")} 查看全部 preset,或 ${pc.cyan("kimi-boost install")} 交互选择。`);
    return;
  }

  // 标记已安装项:prompt 中默认不勾选,但允许重选(install 幂等)
  const { installedOnly } = await listStatus();
  const installed = new Set(installedOnly);

  console.log(pc.bold(`检测到 ${signals.length} 个匹配的 preset(项目根: ${pc.dim(root)}):`));
  for (const s of signals) {
    const tag = installed.has(s.id) ? ` ${pc.dim("(已安装)")}` : "";
    console.log(`  ${pc.green("●")} ${pc.bold(s.id)}  ${pc.dim(`依据: ${s.evidence}`)}${tag}`);
  }
  console.log();

  let chosen: ProjectSignal[];
  if (opts.yes) {
    chosen = signals;
  } else {
    const answer = await prompts({
      type: "multiselect",
      name: "presets",
      message: "选择要安装的 preset(空格切换,回车确认):",
      choices: signals.map((s) => ({
        title: s.id + (installed.has(s.id) ? "(已安装)" : ""),
        description: `依据: ${s.evidence}`,
        value: s.id,
        selected: !installed.has(s.id),
      })),
      instructions: false,
    });
    const ids = (answer?.presets as string[] | undefined) ?? [];
    if (ids.length === 0) {
      console.log(pc.dim("未选择任何 preset,已取消。"));
      return;
    }
    chosen = signals.filter((s) => ids.includes(s.id));
  }

  for (const s of chosen) {
    console.log(pc.bold(`\n安装 ${s.id} …`));
    const reports = opts.project
      ? await installProjectPreset(s.id, { tool: opts.tool, dryRun: opts.dryRun })
      : await installPreset(s.id, { tool: opts.tool, dryRun: opts.dryRun });
    renderReports(reports, opts.dryRun);
  }
}
