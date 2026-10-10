import type { Command } from "commander";
import { wrapAction } from "./wrapAction.js";
import { marketplaceCommand } from "./marketplace.js";

export function registerMarketplace(program: Command) {
  program
    .command("marketplace [outfile]")
    .description("Generate the Kimi Code custom marketplace JSON and print enable instructions")
    .option("--repo <owner/repo>", "repository to reference (default: shidesheng0218/kimi-boost)")
    .option("--branch <ref>", "branch for tree sources (default: main)")
    .option("--source-mode <tree|zip>", "plugin source form (default: tree)")
    .option("--tag <release-tag>", "release tag for zip sources")
    .action(wrapAction(async (outfile: string | undefined, opts?: { repo?: string; branch?: string; sourceMode?: string; tag?: string }) => {
      marketplaceCommand({
        outFile: outfile,
        repo: opts?.repo,
        branch: opts?.branch,
        sourceMode: opts?.sourceMode as "tree" | "zip" | undefined,
        version: opts?.tag,
      });
    }));
}
