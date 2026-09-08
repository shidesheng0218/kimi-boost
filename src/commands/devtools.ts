import { existsSync, readFileSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import * as tar from "tar";
import pc from "picocolors";
import { validatePresetDir } from "../core/presetValidation.js";
import type { ToolName } from "../core/types.js";
import { installPreset } from "./install.js";
import { renderReports } from "./reports.js";

/**
 * preset 作者工具链:validate(校验)/ dev(预览安装)/ package(打包)。
 * 服务社区 preset 创作者——配合 `install github:owner/repo` 的分发路径。
 */

/** 校验一个 preset 目录,逐条输出;返回是否全部通过 */
export function runValidate(dir: string): boolean {
  const root = resolve(dir);
  if (!existsSync(root)) {
    console.error(pc.red(`✗ 目录不存在: ${root}`));
    return false;
  }
  const issues = validatePresetDir(root);
  let errors = 0;
  for (const i of issues) {
    if (i.level === "ok") {
      console.log(`${pc.green("✓")} ${i.message}`);
    } else {
      errors++;
      console.log(`${pc.red("✗")} ${i.message}`);
    }
  }
  if (errors > 0) {
    console.log(pc.red(`\n${basename(root)}: ${errors} 个问题`));
  }
  return errors === 0;
}

function readPresetId(dir: string): { id: string; version?: string } {
  const preset = JSON.parse(readFileSync(join(dir, "preset.json"), "utf8")) as { id: string; version?: string };
  return { id: preset.id, version: preset.version };
}

/** 校验 + dry-run 预览安装(发布前自检) */
export async function runDev(dir: string, opts: { tool?: ToolName } = {}): Promise<void> {
  const root = resolve(dir);
  console.log(pc.bold("1/2 校验 preset …"));
  if (!runValidate(root)) {
    throw new Error("校验未通过,请先修复上述问题。");
  }
  const { id } = readPresetId(root);
  console.log(pc.bold(`\n2/2 dry-run 预览安装 '${id}' …`));
  const reports = await installPreset(id, { sourceDir: root, dryRun: true, tool: opts.tool });
  renderReports(reports, { dryRun: true });
}

/** 校验 + 打成 <id>-<version>.zip */
export async function runPackage(dir: string, opts: { out?: string } = {}): Promise<void> {
  const root = resolve(dir);
  if (!runValidate(root)) {
    throw new Error("校验未通过,已取消打包。");
  }
  const { id, version } = readPresetId(root);
  const out = resolve(opts.out ?? `${id}-${version ?? "0.0.0"}.zip`);
  await tar.c({ gzip: true, file: out, cwd: dirname(root) }, [basename(root)]);
  console.log(`${pc.green("✓")} 已打包 ${out}`);
  console.log(pc.dim("  社区发布约定:仓库根目录含 preset.json(该目录即 preset 根)。推送后他人可 kimi-boost install github:owner/repo 安装。"));
}
