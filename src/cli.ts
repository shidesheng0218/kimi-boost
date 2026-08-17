import { Command } from "commander";
import { createRequire } from "node:module";
import pc from "picocolors";
import { installPreset } from "./commands/install.js";
import { listStatus } from "./commands/list.js";
import { runUpdate } from "./commands/update.js";
import { getStatus } from "./commands/status.js";
import { marketplaceCommand } from "./commands/marketplace.js";
import { runDoctor } from "./commands/doctor.js";
import { setDryRun } from "./core/fsguard.js";
import { listPresets } from "./registry/presets.js";
import { getAdapter } from "./adapters/index.js";
import prompts from "prompts";
import type { ToolName } from "./core/types.js";

const program = new Command();
const require = createRequire(import.meta.url);
const pkgVersion = (require("../package.json") as { version: string }).version;

program
  .name("kimi-boost")
  .description("One-command preset installer & cross-tool enhancer for Kimi Code, Claude Code and Codex CLI")
  .version(pkgVersion);

program
  .command("install [preset]")
  .description("Install a preset into your AI coding CLI (interactive if no preset given)")
  .option("-t, --tool <tool>", "target tool (kimi | claude | codex)")
  .option("-n, --dry-run", "show what would be done without writing anything")
  .option("--with-hooks", "force config.toml hooks even if installed via /plugins")
  .action(async (preset?: string, opts?: { tool?: ToolName; dryRun?: boolean; withHooks?: boolean }) => {
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
      const reports = await installPreset(id, { tool: opts?.tool, dryRun: opts?.dryRun, withHooks: opts?.withHooks });
      for (const r of reports) {
        const prefix = opts?.dryRun ? pc.cyan("dry-run") : (r.ok ? pc.green("✓") : pc.red("✗"));
        console.log(`${prefix} [${r.tool}] ${r.message}`);
        if (opts?.dryRun) {
          for (const c of r.changed) console.log(`   ${pc.dim("would write:")} ${c}`);
        }
      }
    } catch (err) {
      console.error(pc.red(`✗ ${err instanceof Error ? err.message : String(err)}`));
      process.exitCode = 1;
    }
  });

program
  .command("remove <preset>")
  .description("Remove an installed preset")
  .option("-t, --tool <tool>", "target tool (kimi | claude | codex)")
  .option("-n, --dry-run", "show what would be removed without deleting anything")
  .action(async (preset: string, opts?: { tool?: ToolName; dryRun?: boolean }) => {
    try {
      if (!/^[a-z0-9][a-z0-9_-]*$/.test(preset)) {
        throw new Error(`Invalid preset id '${preset}'. Expected kebab-case (a-z0-9, -, _).`);
      }
      setDryRun(Boolean(opts?.dryRun));
      const envTools = opts?.tool ? [opts.tool] : (["kimi", "claude", "codex"] as ToolName[]);
      for (const tool of envTools) {
        const adapter = getAdapter(tool);
        if (!adapter) {
          console.log(pc.yellow(`[${tool}] adapter not implemented`));
          continue;
        }
        const r = await adapter.deactivate(preset);
        const prefix = opts?.dryRun ? pc.cyan("dry-run") : (r.ok ? pc.green("✓") : pc.red("✗"));
        console.log(`${prefix} [${tool}] ${r.message}`);
        if (opts?.dryRun) {
          for (const c of r.changed) console.log(`   ${pc.dim("would remove:")} ${c}`);
        }
      }
    } catch (err) {
      console.error(pc.red(`✗ ${err instanceof Error ? err.message : String(err)}`));
      process.exitCode = 1;
    } finally {
      setDryRun(false);
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
  .option("--repo <owner/repo>", "registry repository (default: shidesheng0218/kimi-boost, or $KIMI_BOOST_REPO)")
  .option("--branch <ref>", "registry branch (default: main)")
  .action(async (opts?: { repo?: string; branch?: string }) => {
    try {
      const results = await runUpdate(opts as { repo?: string; branch?: string });
      for (const r of results) {
        if (r.status === "updated") {
          console.log(`${pc.green("↑")} ${r.id}: ${r.from} -> ${r.to}`);
        } else if (r.status === "up-to-date") {
          console.log(`${pc.dim("·")} ${r.id}: up to date${r.message ? ` (${r.message})` : ""}`);
        } else {
          console.log(`${pc.red("✗")} ${r.id}: ${r.message ?? "failed"}`);
        }
      }
    } catch (err) {
      console.error(pc.red(`✗ ${err instanceof Error ? err.message : String(err)}`));
      process.exitCode = 1;
    }
  });

program
  .command("marketplace [outfile]")
  .description("Generate the Kimi Code custom marketplace JSON and print enable instructions")
  .option("--repo <owner/repo>", "repository to reference (default: shidesheng0218/kimi-boost)")
  .option("--branch <ref>", "branch for tree sources (default: main)")
  .option("--source-mode <tree|zip>", "plugin source form (default: tree)")
  .option("--tag <release-tag>", "release tag for zip sources")
  .action((outfile: string | undefined, opts?: { repo?: string; branch?: string; sourceMode?: string; tag?: string }) => {
    try {
      marketplaceCommand({
        outFile: outfile,
        repo: opts?.repo,
        branch: opts?.branch,
        sourceMode: opts?.sourceMode as "tree" | "zip" | undefined,
        version: opts?.tag,
      });
    } catch (err) {
      console.error(pc.red(`✗ ${err instanceof Error ? err.message : String(err)}`));
      process.exitCode = 1;
    }
  });

program
  .command("doctor")
  .description("Diagnose your setup: config syntax, hooks, mounted dirs, manifest consistency")
  .option("-f, --fix", "attempt to auto-fix fixable issues (missing dirs / hook scripts)")
  .action((opts?: { fix?: boolean }) => {
    try {
      const issues = runDoctor(Boolean(opts?.fix));
      let errors = 0;
      let warns = 0;
      for (const i of issues) {
        if (i.level === "ok") {
          console.log(`${pc.green("✓")} ${i.item}`);
        } else if (i.level === "warn") {
          warns++;
          console.log(`${pc.yellow("⚠")} ${i.item}`);
        } else {
          errors++;
          console.log(`${pc.red("✗")} ${i.item}`);
        }
        if (i.detail) console.log(`   ${pc.dim(i.detail)}`);
      }
      console.log("");
      if (errors) console.log(pc.red(`${errors} error(s)`) + (warns ? `, ${pc.yellow(`${warns} warning(s)`)}` : ""));
      else if (warns) console.log(pc.yellow(`${warns} warning(s), no errors`));
      else console.log(pc.green("All checks passed."));
      process.exitCode = errors ? 1 : 0;
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
