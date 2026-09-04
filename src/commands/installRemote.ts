import { readFileSync } from "node:fs";
import { join } from "node:path";
import pc from "picocolors";
import prompts from "prompts";
import { downloadRepoTarball, findDirWith } from "../core/github.js";
import { writeSource } from "../core/sources.js";
import type { PresetDefinition, ToolName } from "../core/types.js";
import { getPreset } from "../registry/presets.js";
import type { InstallReport } from "../adapters/types.js";
import { installPreset } from "./install.js";

/**
 * 社区 preset 安装:`kimi-boost install github:owner/repo`。
 * 单 preset 仓库约定:仓库根目录就是一个 preset(根含 preset.json)。
 * 第三方 preset 的 hooks 会在 agent 运行时执行命令,因此默认展示内容并要求显式确认。
 */

export interface RemoteSpec {
  owner: string;
  repo: string;
  ref: string;
}

/**
 * 解析远程 preset 目标:
 * - `github:owner/repo` 或 `github:owner/repo@ref`
 * - `https://github.com/owner/repo`(可带 .git 后缀或 /tree/<ref>)
 * 不匹配则返回 undefined(按内置 preset id 处理)。
 */
export function parseRemoteSpec(target: string): RemoteSpec | undefined {
  const gh = target.match(/^github:([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+?)(?:@([^\s/]+))?$/);
  if (gh) return { owner: gh[1], repo: gh[2], ref: gh[3] ?? "main" };
  const url = target.match(/^https:\/\/github\.com\/([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+?)(?:\.git)?(?:\/tree\/([^\s]+))?\/?$/);
  if (url) return { owner: url[1], repo: url[2], ref: url[3] ?? "main" };
  return undefined;
}

export interface RemoteInstallOptions {
  tool?: ToolName;
  dryRun?: boolean;
  /** 跳过安全确认(CI/脚本场景) */
  yes?: boolean;
  withHooks?: boolean;
}

/**
 * 从 GitHub 仓库安装 preset。返回各端 InstallReport;用户取消时返回 undefined。
 */
export async function installRemotePreset(spec: RemoteSpec, opts: RemoteInstallOptions = {}): Promise<InstallReport[] | undefined> {
  const repoSlug = `${spec.owner}/${spec.repo}`;
  const dl = await downloadRepoTarball(repoSlug, spec.ref);
  try {
    const presetRoot = findDirWith(dl.root, "preset.json");
    if (!presetRoot) {
      throw new Error(`preset.json not found in ${repoSlug}@${spec.ref} — 该仓库根目录不是一个 preset`);
    }
    let preset: PresetDefinition;
    try {
      preset = JSON.parse(readFileSync(join(presetRoot, "preset.json"), "utf8")) as PresetDefinition;
    } catch {
      throw new Error(`preset.json in ${repoSlug}@${spec.ref} is not valid JSON`);
    }
    if (!preset.id || !preset.name) {
      throw new Error(`preset.json in ${repoSlug}@${spec.ref} 缺少 id/name 字段`);
    }

    // 展示将安装的内容,特别是会执行的 hooks
    console.log(pc.bold(`远程 preset: ${preset.id} (${preset.name}) v${preset.version ?? "?"}`) + pc.dim(` ← github.com/${repoSlug}@${spec.ref}`));
    if (preset.description) console.log(pc.dim(`  ${preset.description}`));
    const hooks = preset.hooks ?? [];
    if (hooks.length > 0) {
      console.log(pc.yellow(`  ⚠ 该 preset 将注册 ${hooks.length} 个 hook,agent 运行时会执行对应脚本:`));
      for (const h of hooks) {
        console.log(`    ${pc.yellow("•")} [${h.event}${h.matcher ? `/${h.matcher}` : ""}] node hooks/${h.script}`);
      }
    }
    if (!opts.yes && !opts.dryRun) {
      const answer = await prompts({ type: "confirm", name: "ok", message: "确认安装这个第三方 preset?", initial: false });
      if (!answer.ok) {
        console.log(pc.dim("已取消。"));
        return undefined;
      }
    }

    // 与官方 registry 同 id 时提示更新语义变化
    if (getPreset(preset.id)) {
      console.warn(pc.yellow(`[warn] '${preset.id}' 与官方 registry 中的 preset 同名;安装后 update 将改为跟踪 ${repoSlug}。`));
    }

    const reports = await installPreset(preset.id, {
      tool: opts.tool,
      dryRun: opts.dryRun,
      withHooks: opts.withHooks,
      sourceDir: presetRoot,
    });
    // 注意:installPreset 内部会切换全局 dryRun;来源标记只在真实安装时写
    if (!opts.dryRun) writeSource(preset.id, { repo: repoSlug, ref: spec.ref });
    return reports;
  } finally {
    dl.cleanup();
  }
}
