import { Command } from "commander";
import pc from "picocolors";
import { installPreset, type InstallOptions } from "./commands/install.js";
import { listStatus } from "./commands/list.js";
import { runUpdate } from "./commands/update.js";
import { getStatus } from "./commands/status.js";
import { listPresets } from "./registry/presets.js";
import { getAdapter } from "./adapters/index.js";
import prompts from "prompts";
import type { ToolName } from "./core/types.js";

const program = new Command();

program
  .name("kimi-boost")
  .description("One-command preset installer & cross-tool enhancer for Kimi Code, Claude Code and Codex CLI")
  .version("0.1.0");

program
  .command("install [preset]")
  .description("Install a preset into your AI coding CLI (interactive if no preset given)")
  .option("-t, --tool <tool>", "target tool (kimi | claude | codex)")
  .action(async (preset?: string, opts?: { tool?: ToolName }) => {
    try {
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
      const reports = await installPreset(id, { tool: opts?.tool } as InstallOptions);
      for (const r of reports) {
        const tag = r.ok ? pc.green("✓") : pc.red("✗");
        console.log(`${tag} [${r.tool}] ${r.message}`);
      }
    } catch (err) {
      console.error(pc.red(`✗ ${err instanceof Error ? err.message : String(err)}`));
      process.exitCode = 1;
    }
  });

program
  .command("remove <preset>")
  .description("Remove an installed preset")
  .option("-t, --tool <tool>", "target tool")
  .action(async (preset: string, opts?: { tool?: ToolName }) => {
    try {
      const envTools = opts?.tool ? [opts.tool] : (["kimi", "claude", "codex"] as ToolName[]);
      for (const tool of envTools) {
        const adapter = getAdapter(tool);
        if (!adapter) {
          console.log(pc.yellow(`[${tool}] adapter not implemented`));
          continue;
        }
        const r = await adapter.deactivate(preset);
        const tag = r.ok ? pc.green("✓") : pc.red("✗");
        console.log(`${tag} [${tool}] ${r.message}`);
      }
    } catch (err) {
      console.error(pc.red(`✗ ${err instanceof Error ? err.message : String(err)}`));
      process.exitCode = 1;
    }
  });

program
  .command("list")
  .description("List available and installed presets")
  .action(async () => {
    try {
      const { presets } = await listStatus();
      for (const p of presets) {
        const mark = p.installed ? pc.green("● installed") : pc.dim("○ not installed");
        console.log(`${pc.bold(p.id)} ${mark}`);
        console.log(`   ${p.description}`);
        if (p.tools.length) console.log(`   tools: ${p.tools.join(", ")}`);
      }
    } catch (err) {
      console.error(pc.red(`✗ ${err instanceof Error ? err.message : String(err)}`));
      process.exitCode = 1;
    }
  });

program
  .command("update")
  .description("Update installed presets to the latest versions")
  .action(async () => {
    try {
      const messages = await runUpdate();
      for (const m of messages) console.log(pc.blue(`· ${m}`));
    } catch (err) {
      console.error(pc.red(`✗ ${err instanceof Error ? err.message : String(err)}`));
      process.exitCode = 1;
    }
  });

program
  .command("status")
  .description("Show detected CLIs and platform info")
  .action(() => {
    const s = getStatus();
    console.log(pc.bold(`platform: ${s.platform}`));
    for (const t of s.tools) {
      const mark = t.installed ? pc.green("✓ installed") : pc.red("✗ not installed");
      const cfg = t.configured ? "" : pc.yellow(" (no config yet)");
      console.log(`${pc.bold(t.name)} ${mark} ${t.version ?? ""}${cfg}`);
      console.log(`   config: ${t.homeDir}`);
    }
  });

program.parse(process.argv);
