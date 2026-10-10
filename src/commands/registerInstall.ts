import type { Command } from "commander";
import prompts from "prompts";
import pc from "picocolors";
import { installPreset } from "./install.js";
import { installRemotePreset, parseRemoteSpec } from "./installRemote.js";
import { renderReports } from "./reports.js";
import { installProjectPreset } from "../core/project.js";
import { listPresets } from "../registry/presets.js";
import { wrapAction } from "./wrapAction.js";
import type { ToolName } from "../core/types.js";

export function registerInstall(program: Command) {
  program
    .command("install [preset]")
    .description("Install a preset (id or github:owner/repo) into your AI coding CLI (interactive if none given)")
    .option("-t, --tool <tool>", "target tool (kimi | claude | codex)")
    .option("-n, --dry-run", "show what would be done without writing anything")
    .option("--with-hooks", "force config.toml hooks even if installed via /plugins")
    .option("-p, --project", "install into the current project (.agents/, .claude/) for git-based team sharing")
    .option("-y, --yes", "skip the safety confirmation for community presets (github:owner/repo)")
    .action(wrapAction(async (preset?: string, opts?: { tool?: ToolName; dryRun?: boolean; withHooks?: boolean; project?: boolean; yes?: boolean }) => {
      let id = preset;
      if (!id) {
        const choices = listPresets().map((p) => ({
          title: p.name,
          description: p.description,
          value: p.id,
        }));
        const answer = await prompts({
          type: "select",
          name: "preset",
          message: "Choose a preset to install:",
          choices,
        });
        id = answer.preset;
        if (!id) return;
      }

      const spec = parseRemoteSpec(id);
      if (spec) {
        const reports = await installRemotePreset(spec, {
          tool: opts?.tool,
          dryRun: opts?.dryRun,
          yes: opts?.yes,
          withHooks: opts?.withHooks,
          project: opts?.project,
        });
        if (!reports) return;
        renderReports(reports, { dryRun: opts?.dryRun });
        if (!opts?.dryRun) console.log(pc.dim("验证安装:kboost doctor"));
        return;
      }

      const reports = opts?.project
        ? await installProjectPreset(id, { tool: opts?.tool, dryRun: opts?.dryRun })
        : await installPreset(id, { tool: opts?.tool, dryRun: opts?.dryRun, withHooks: opts?.withHooks });
      renderReports(reports, { dryRun: opts?.dryRun });
      if (!opts?.dryRun) console.log(pc.dim("验证安装:kboost doctor"));
    }));
}
