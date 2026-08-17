import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { listPresets, presetsRoot } from "../registry/presets.js";

export interface MarketplaceJson {
  version: string;
  plugins: Array<{ id: string; displayName?: string; source: string }>;
}

export interface MarketplaceOptions {
  repo?: string;
  branch?: string;
  outFile?: string;
  /** source 指向 GitHub tree(默认)或 release zip(--version 时必须) */
  sourceMode?: "tree" | "zip";
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
  const presets = listPresets();
  const plugins = presets.map((p) => {
    let source: string;
    if (opts.sourceMode === "zip") {
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
  const market = buildMarketplace(opts);
  const ghUrl = `https://raw.githubusercontent.com/${repo}/${branch}/marketplace.json`;
  console.log(`Wrote ${target} (${market.plugins.length} plugins${opts.sourceMode === "zip" ? ", zip sources" : ""})`);
  console.log(`\nEnable it in Kimi Code (one of):`);
  console.log(`  1. Terminal: /plugins marketplace ${ghUrl}`);
  console.log(`  2. Env var:  export KIMI_CODE_PLUGIN_MARKETPLACE_URL=${ghUrl}`);
  console.log(`\nThen /plugins -> Custom tab -> install.`);
}
