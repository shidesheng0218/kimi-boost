import type { Command } from "commander";
import pc from "picocolors";
import { wrapAction } from "./wrapAction.js";
import { runOutdated, renderOutdated } from "./outdated.js";

export function registerOutdated(program: Command) {
  program
    .command("outdated")
    .description("Show installed presets that have newer versions in the registry")
    .option("--repo <owner/repo>", "registry repository (default: shidesheng0218/kimi-boost, or $KIMI_BOOST_REPO)")
    .option("--branch <ref>", "registry branch (default: main)")
    .option("-p, --project", "check project-level presets (.kimi-boost/installed.json) instead of user config")
    .option("--json", "print machine-readable JSON")
    .action(wrapAction(async (opts?: { repo?: string; branch?: string; project?: boolean; json?: boolean }) => {
      const rows = await runOutdated(opts as { repo?: string; branch?: string; project?: boolean });
      if (opts?.json) {
        console.log(JSON.stringify(rows, null, 2));
        return;
      }
      if (rows.length === 0) {
        console.log("No presets installed.");
        return;
      }
      console.log(renderOutdated(rows));
      for (const r of rows) {
        if (r.message) console.log(`   ${pc.dim(`${r.id}: ${r.message}`)}`);
      }
      const n = rows.filter((r) => r.status === "update-available").length;
      if (n > 0) {
        console.log("");
        console.log(pc.yellow(`${n} update(s) available.`) + ` Run 'kimi-boost update${opts?.project ? " (then reinstall with --project)" : ""}' to apply.`);
      }
    }));
}
