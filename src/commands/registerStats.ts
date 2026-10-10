import type { Command } from "commander";
import { wrapAction } from "./wrapAction.js";
import { runStats } from "./stats.js";

export function registerStats(program: Command) {
  program
    .command("stats")
    .alias("usage")
    .description("Show usage stats tracked by the 'usage' preset (chart + streak); --share exports an SVG card")
    .option("-d, --days <n>", "number of days to show", "7")
    .option("--json", "print machine-readable JSON")
    .option("--share [file]", "export a shareable SVG stats card (default: kimi-boost-stats.svg)")
    .action(wrapAction(async (opts?: { days?: string; json?: boolean; share?: string | boolean }) => {
      runStats({
        days: opts?.days ? Number(opts.days) : undefined,
        json: opts?.json,
        share: opts?.share,
      });
    }));
}
