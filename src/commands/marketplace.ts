import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { listPresets, presetsRoot } from "../registry/presets.js";

export interface MarketplaceJson {
  version: string;
  plugins: Array<{ id: string; displayName?: string; source: string }>;
}

/** 生成 Kimi Code 自定义 marketplace JSON(官方 /plugins marketplace 与 KIMI_CODE_PLUGIN_MARKETPLACE_URL 格式) */
export function buildMarketplace(repo = "shidesheng0218/kimi-boost", branch = "main", outFile?: string): MarketplaceJson {
  const presets = listPresets();
  const plugins = presets.map((p) => ({
    id: p.id,
    displayName: p.name,
    source: `https://github.com/${repo}/tree/${branch}/presets/${p.id}`,
  }));
  const market: MarketplaceJson = { version: "2", plugins };
  if (outFile) {
    writeFileSync(outFile, JSON.stringify(market, null, 2), "utf8");
  }
  return market;
}

export function marketplaceCommand(outFile?: string, repo = "shidesheng0218/kimi-boost", branch = "main"): void {
  const target = outFile ?? join(process.cwd(), "marketplace.json");
  const market = buildMarketplace(repo, branch, target);
  const ghUrl = `https://raw.githubusercontent.com/${repo}/${branch}/marketplace.json`;
  console.log(`Wrote ${target} (${market.plugins.length} plugins)`);
  console.log(`\nEnable it in Kimi Code (one of):`);
  console.log(`  1. Terminal: /plugins marketplace ${ghUrl}`);
  console.log(`  2. Env var:  export KIMI_CODE_PLUGIN_MARKETPLACE_URL=${ghUrl}`);
  console.log(`\nThen /plugins -> Custom tab -> install.`);
}
