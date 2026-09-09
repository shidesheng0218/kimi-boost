import pc from "picocolors";
import prompts from "prompts";
import { detectProjectPresets, type ProjectSignal } from "../core/detectProject.js";
import { findProjectRoot, installProjectPreset } from "../core/project.js";
import type { ToolName } from "../core/types.js";
import { installPreset } from "./install.js";
import { listStatus } from "./list.js";
import { renderReports } from "./reports.js";

export interface InitOptions {
  tool?: ToolName;
  project?: boolean;
  /** 跳过交互,直接安装全部检测到的 preset(CI/脚本场景) */
  yes?: boolean;
  dryRun?: boolean;
}

export async function runInit(opts: InitOptions = {}): Promise<void> {
  const { root } = findProjectRoot();
  const detected = detectProjectPresets(root);

  // 核心护栏永远置顶推荐:与技术栈无关的最小保险(拦推主干/危险命令/密钥写入)
  const coreSignal: ProjectSignal = { id: "core", evidence: "默认护栏:拦推 main / 危险命令 / 密钥写入" };
  const signals = [coreSignal, ...detected.filter((s) => s.id !== "core")];

  // 标记已安装项:prompt 中默认不勾选,但允许重选(install 幂等)
  const { installedOnly } = await listStatus();
  const installed = new Set(installedOnly);

  if (detected.length === 0) {
    console.log(pc.dim("未识别出项目技术栈;先装上核心护栏(任何项目都建议):"));
  } else {
    console.log(pc.bold(`检测到 ${signals.length} 个匹配的 preset(项目根: ${pc.dim(root)}):`));
  }
  for (const s of signals) {
    const tag = installed.has(s.id) ? ` ${pc.dim("(已安装)")}` : "";
    const rec = s.id === "core" ? ` ${pc.green("(推荐)")}` : "";
    console.log(`  ${pc.green("●")} ${pc.bold(s.id)}${rec}  ${pc.dim(`依据: ${s.evidence}`)}${tag}`);
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
    renderReports(reports, { dryRun: opts.dryRun });
  }
}
