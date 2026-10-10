import type { Command } from "commander";
import { wrapAction } from "./wrapAction.js";
import { runImport } from "./import.js";
import type { ToolName } from "../core/types.js";

export function registerImport(program: Command) {
  program
    .command("import <file>")
    .description("Import a previously exported kimi-boost setup file")
    .option("-t, --tool <tool>", "target tool (kimi | claude | codex)")
    .option("-y, --yes", "skip the confirmation prompt")
    .option("-n, --dry-run", "show the restore plan without writing anything")
    .action(wrapAction(async (file: string, opts?: { tool?: ToolName; yes?: boolean; dryRun?: boolean }) => {
      await runImport(file, { tool: opts?.tool, yes: opts?.yes, dryRun: opts?.dryRun });
    }));
}
