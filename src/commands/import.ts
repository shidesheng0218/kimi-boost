import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import * as tar from "tar";
import pc from "picocolors";
import prompts from "prompts";
import { boostHome } from "../core/config.js";
import type { ExportManifest } from "../core/exportManifest.js";
import { ensureDir, writeFileIfWritable } from "../core/fsguard.js";
import { readUsage, usageFile, type UsageData } from "../core/usage.js";
import { getPreset } from "../registry/presets.js";
import type { ToolName } from "../core/types.js";
import { installPreset } from "./install.js";
import { installRemotePreset } from "./installRemote.js";
import { renderReports } from "./reports.js";
import { installWatch } from "./updateWatch.js";

/**
 * import 命令:读取 export 产物(JSON 清单或含 preset 内容的 tar.gz),
 * 一次确认后把整套 kimi-boost 安装状态恢复到本机。
 */

export interface ImportOptions {
  yes?: boolean;
  dryRun?: boolean;
  tool?: ToolName;
}

function isGzip(path: string): boolean {
  try {
    const fd = readFileSync(path);
    return fd.length >= 2 && fd[0] === 0x1f && fd[1] === 0x8b;
  } catch {
    return false;
  }
}

/** usage 合并:本机已有记录的天保留本机值,只补没有的天 */
export function mergeUsage(local: UsageData, imported: UsageData): { data: UsageData; added: number; skipped: number } {
  const days = { ...local.days };
  let added = 0;
  let skipped = 0;
  for (const [day, rec] of Object.entries(imported.days ?? {})) {
    if (days[day]) skipped++;
    else {
      days[day] = rec;
      added++;
    }
  }
  return { data: { days }, added, skipped };
}

export async function runImport(file: string, opts: ImportOptions = {}): Promise<void> {
  const path = resolve(file);
  if (!existsSync(path)) throw new Error(`文件不存在: ${path}`);

  let manifest: ExportManifest;
  let embeddedDir: string | undefined;
  let cleanup: (() => void) | undefined;

  if (isGzip(path)) {
    const root = mkdtempSync(join(tmpdir(), "kboost-import-"));
    cleanup = () => rmSync(root, { recursive: true, force: true });
    await tar.x({ file: path, cwd: root });
    const mf = join(root, "manifest.json");
    if (!existsSync(mf)) {
      cleanup();
      throw new Error(`tar.gz 中缺少 manifest.json — 不是有效的 kimi-boost 导出文件`);
    }
    manifest = JSON.parse(readFileSync(mf, "utf8")) as ExportManifest;
    const p = join(root, "presets");
    embeddedDir = existsSync(p) ? p : undefined;
  } else {
    manifest = JSON.parse(readFileSync(path, "utf8")) as ExportManifest;
  }

  try {
    if (manifest.schema !== 1) {
      throw new Error(`不支持的导出格式 schema=${String(manifest.schema)}(当前支持 1)。请升级导出端的 kimi-boost。`);
    }

    const sources = manifest.sources ?? {};
    const communityCount = manifest.presets.filter((p) => sources[p.id]).length;
    console.log(pc.bold(`导入 kimi-boost 配置(导出于 ${manifest.exportedAt},来自 kimi-boost v${manifest.cliVersion})`));
    console.log(
      pc.dim(
        `  ${manifest.presets.length} 个 preset(其中 ${communityCount} 个社区 preset)` +
          `${embeddedDir ? ",含内嵌 preset 内容" : ""}` +
          `${manifest.watch?.enabled ? `,含后台检查(每 ${manifest.watch.intervalHours ?? 6} 小时)` : ""}` +
          `${manifest.usage ? ",含用量历史" : ""}`,
      ),
    );
    console.log("");

    if (opts.dryRun) {
      for (const p of manifest.presets) {
        const src = sources[p.id]
          ? `community ${sources[p.id].repo}@${sources[p.id].ref}`
          : embeddedDir && existsSync(join(embeddedDir, p.id))
            ? "embedded content"
            : "official registry";
        console.log(`  ${pc.cyan("would install")} ${p.id}@${p.version ?? "?"} ← ${src}`);
      }
      if (manifest.watch?.enabled) console.log(`  ${pc.cyan("would enable")} 后台更新检查`);
      if (manifest.usage) console.log(`  ${pc.cyan("would merge")} usage 历史(${Object.keys(manifest.usage.days ?? {}).length} 天,冲突保留本机值)`);
      return;
    }

    if (!opts.yes) {
      const answer = await prompts({
        type: "confirm",
        name: "ok",
        message: `导入将安装 ${manifest.presets.length} 个 preset(会注册相应 hooks)。确认继续?`,
        initial: false,
      });
      if (!answer.ok) {
        console.log(pc.dim("已取消。"));
        return;
      }
    }

    for (const p of manifest.presets) {
      const source = sources[p.id];
      try {
        if (source) {
          console.log(pc.dim(`  ${p.id} ← ${source.repo}@${source.ref}`));
          const [owner, repo] = source.repo.split("/");
          const reports = await installRemotePreset({ owner, repo, ref: source.ref }, { yes: true, tool: opts.tool });
          if (reports) renderReports(reports);
        } else if (embeddedDir && existsSync(join(embeddedDir, p.id))) {
          console.log(pc.dim(`  ${p.id} ← embedded(v${p.version ?? "?"})`));
          const reports = await installPreset(p.id, { sourceDir: join(embeddedDir, p.id), tool: opts.tool });
          renderReports(reports);
        } else {
          const builtin = getPreset(p.id);
          if (!builtin) {
            console.log(`  ${pc.yellow("⚠")} ${p.id}: 官方 registry 已无此 preset,跳过`);
            continue;
          }
          console.log(pc.dim(`  ${p.id} ← registry v${builtin.version ?? "?"}`));
          if (p.version && builtin.version && p.version !== builtin.version) {
            console.log(
              pc.yellow(`  ⚠ ${p.id}: 导出记录 v${p.version},registry 当前 v${builtin.version}(安装后者,可用 update --dry-run 查看差异)`),
            );
          }
          const reports = await installPreset(p.id, { tool: opts.tool });
          renderReports(reports);
        }
      } catch (err) {
        console.log(`  ${pc.red("✗")} ${p.id}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }

    if (manifest.watch?.enabled) {
      const r = installWatch({ interval: manifest.watch.intervalHours });
      console.log(`  ${pc.green("✓")} ${r.message}`);
    }

    if (manifest.usage?.days && Object.keys(manifest.usage.days).length > 0) {
      const merged = mergeUsage(readUsage(), manifest.usage);
      if (merged.added > 0) {
        ensureDir(boostHome());
        writeFileIfWritable(usageFile(), JSON.stringify(merged.data, null, 2));
      }
      console.log(pc.dim(`  usage 历史:新增 ${merged.added} 天,${merged.skipped} 天本机已有(保留本机值)`));
    }

    console.log(`\n${pc.green("✓")} 导入完成。`);
  } finally {
    cleanup?.();
  }
}
