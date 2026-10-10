import type { Command } from "commander";
import pc from "picocolors";
import { wrapAction } from "./wrapAction.js";
import { renderReports } from "./reports.js";
import { removeProjectPreset } from "../core/project.js";
import { removeSource } from "../core/sources.js";
import { getAdapter } from "../adapters/index.js";
import { setDryRun } from "../core/fsguard.js";
import type { ToolName } from "../core/types.js";

export function registerRemove(program: Command) {
  program
    .command("remove <preset>")
    .description("Remove an installed preset")
    .option("-t, --tool <tool>", "target tool (kimi | claude | codex)")
    .option("-n, --dry-run", "show what would be removed without deleting anything")
    .option("-p, --project", "remove from the current project instead of user config")
    .action(wrapAction(async (preset: string, opts?: { tool?: ToolName; dryRun?: boolean; project?: boolean }) => {
      if (!/^[a-z0-9][a-z0-9_-]*$/.test(preset)) {
        throw new Error(`Invalid preset id '${preset}'. Expected kebab-case (a-z0-9, -, _).`);
      }
      if (opts?.project) {
        const reports = await removeProjectPreset(preset, { tool: opts?.tool, dryRun: opts?.dryRun });
        renderReports(reports, { dryRun: opts?.dryRun, action: "remove" });
        return;
      }
      try {
        setDryRun(Boolean(opts?.dryRun));
        const envTools = opts?.tool ? [opts.tool] : (["kimi", "claude", "codex"] as ToolName[]);
        for (const tool of envTools) {
          const adapter = getAdapter(tool);
          if (!adapter) {
            console.log(pc.yellow(`[${tool}] adapter not implemented`));
            continue;
          }
          const r = await adapter.deactivate(preset);
          renderReports([r], { dryRun: opts?.dryRun, action: "remove" });
        }
        removeSource(preset);
      } finally {
        setDryRun(false);
      }
    }));
}
