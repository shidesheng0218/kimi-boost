import type { Command } from "commander";
import pc from "picocolors";
import { wrapAction } from "./wrapAction.js";
import { verifyProjectInstall } from "../core/project.js";

export function registerVerify(program: Command) {
  program
    .command("verify")
    .description("Compare the project lock (.kimi-boost/installed.json) with installed files; does not delete edits")
    .option("-p, --project", "verify project-level presets (currently the only scope)")
    .action(wrapAction(async (opts?: { project?: boolean }) => {
      if (opts && opts.project === false) {
        throw new Error("verify currently checks project-level installs only. Pass --project.");
      }
      const { issues } = verifyProjectInstall();
      if (issues.length === 0) {
        console.log(pc.green("✓ project lock matches installed files"));
        return;
      }
      for (const issue of issues) {
        const mark = issue.level === "error" ? pc.red("✗") : pc.yellow("⚠");
        console.log(`${mark} ${issue.presetId}: ${issue.code}`);
        console.log(`   ${pc.dim(issue.detail)}`);
      }
      console.log("");
      console.log(pc.dim("Nothing was deleted. Reinstall with --project only if you intend to overwrite local edits."));
      process.exitCode = 1;
    }));
}
