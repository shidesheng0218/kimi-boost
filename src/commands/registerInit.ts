import type { Command } from "commander";
import { wrapAction } from "./wrapAction.js";
import { runInit } from "./init.js";
import type { ToolName } from "../core/types.js";

export function registerInit(program: Command) {
  program
    .command("init")
    .description("Detect this project's stack and install matching presets (guided first-time setup)")
    .option("-t, --tool <tool>", "target tool (kimi | claude | codex)")
    .option("-p, --project", "install into the current project (.agents/, .claude/) for git-based team sharing")
    .option("-y, --yes", "install all detected presets without prompting (for CI/scripts)")
    .option("-n, --dry-run", "show what would be done without writing anything")
    .action(wrapAction(async (opts?: { tool?: ToolName; project?: boolean; yes?: boolean; dryRun?: boolean }) => {
      await runInit({ tool: opts?.tool, project: opts?.project, yes: opts?.yes, dryRun: opts?.dryRun });
    }));
}
