import type { Command } from "commander";
import { wrapAction } from "./wrapAction.js";
import { runDev } from "./devtools.js";
import type { ToolName } from "../core/types.js";

export function registerDev(program: Command) {
  program
    .command("dev <dir>")
    .description("Validate a local preset dir and preview its install (dry-run)")
    .option("-t, --tool <tool>", "target tool (kimi | claude | codex)")
    .action(wrapAction(async (dir: string, opts?: { tool?: ToolName }) => {
      await runDev(dir, { tool: opts?.tool });
    }));
}
