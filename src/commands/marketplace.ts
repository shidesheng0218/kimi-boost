import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { flagshipIds, listPresets, presetsRoot } from "../registry/presets.js";

export interface MarketplaceJson {
  version: string;
  plugins: Array<{ id: string; displayName?: string; source: string }>;
}

export interface MarketplaceOptions {
  repo?: string;
  branch?: string;
  outFile?: string;
  /**
   * repo: 单仓镜像 URL(默认,官方 /plugins install 可用,仅含旗舰预设)
   * zip:  release 资产 URL(release 渠道,含全部预设)
   * tree: 仓库子目录 URL(官方安装器不认,仅兼容旧流程,不建议使用)
   */
  sourceMode?: "tree" | "zip" | "repo";
  version?: string;
}

function presetVersion(id: string): string {
  try {
    const p = JSON.parse(readFileSync(join(presetsRoot(), id, "preset.json"), "utf8")) as { version?: string };
    return p.version ?? "0.0.0";
  } catch {
    return "0.0.0";
  }
}

/** 生成 Kimi Code 自定义 marketplace JSON(官方 /plugins marketplace 与 KIMI_CODE_PLUGIN_MARKETPLACE_URL 格式) */
export function buildMarketplace(opts: MarketplaceOptions = {}): MarketplaceJson {
  const repo = opts.repo ?? "shidesheng0218/kimi-boost";
  const branch = opts.branch ?? "main";
  const mode = opts.sourceMode ?? "repo";
  const [owner, repoName] = repo.split("/");
  const mirrored = new Set(flagshipIds());
  const presets = mode === "repo" ? listPresets().filter((p) => mirrored.has(p.id)) : listPresets();
  const plugins = presets.map((p) => {
    let source: string;
    if (mode === "repo") {
      source = `https://github.com/${owner}/${repoName}-${p.id}`;
    } else if (mode === "zip") {
      const v = opts.version ?? presetVersion(p.id);
      source = `https://github.com/${repo}/releases/download/${v}/${p.id}-${v}.zip`;
    } else {
      source = `https://github.com/${repo}/tree/${branch}/presets/${p.id}`;
    }
    return { id: p.id, displayName: p.name, source };
  });
  const market: MarketplaceJson = { version: "2", plugins };
  if (opts.outFile) {
    writeFileSync(opts.outFile, JSON.stringify(market, null, 2), "utf8");
  }
  return market;
}

export function marketplaceCommand(opts: MarketplaceOptions = {}): void {
  const repo = opts.repo ?? "shidesheng0218/kimi-boost";
  const branch = opts.branch ?? "main";
  const target = opts.outFile ?? join(process.cwd(), "marketplace.json");
  const mode = opts.sourceMode ?? "repo";
  const market = buildMarketplace(opts);
  const ghUrl = `https://raw.githubusercontent.com/${repo}/${branch}/marketplace.json`;
  if (mode === "tree") {
    console.warn("warning: tree 子目录 URL 无法被官方安装器识别,仅用于兼容旧流程");
  }
  if (mode === "repo") {
    const skipped = listPresets().length - market.plugins.length;
    if (skipped > 0) console.log(`skipped ${skipped} non-mirrored preset(s) (不在 presets/flagship.json)`);
  }
  console.log(`Wrote ${target} (${market.plugins.length} plugins, ${mode} sources)`);
  console.log(`\nEnable it in Kimi Code (one of):`);
  console.log(`  1. Terminal: /plugins marketplace ${ghUrl}`);
  console.log(`  2. Env var:  export KIMI_CODE_PLUGIN_MARKETPLACE_URL=${ghUrl}`);
  console.log(`\nThen /plugins -> Custom tab -> install.`);
}
