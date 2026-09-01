import { Command } from "commander";
import { createRequire } from "node:module";
import pc from "picocolors";
import { installPreset } from "./commands/install.js";
import { listStatus } from "./commands/list.js";
import { runUpdate } from "./commands/update.js";
import { generateBootstrap } from "./commands/bootstrap.js";
import { checkUpdates, installWatch, notify, uninstallWatch } from "./commands/updateWatch.js";
import { getPresetMatrix, getStatus, renderPresetMatrix } from "./commands/status.js";
import { marketplaceCommand } from "./commands/marketplace.js";
import { runDoctor } from "./commands/doctor.js";
import { runProjectDoctor } from "./commands/doctorProject.js";
import { createPreset } from "./commands/create.js";
import { printUsage } from "./commands/usage.js";
import { runOutdated, renderOutdated } from "./commands/outdated.js";
import { setDryRun } from "./core/fsguard.js";
import { installProjectPreset, removeProjectPreset } from "./core/project.js";
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
  .option("-p, --project", "install into the current project (.agents/, .claude/) for git-based team sharing")
  .action(async (preset?: string, opts?: { tool?: ToolName; dryRun?: boolean; withHooks?: boolean; project?: boolean }) => {
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
      const reports = opts?.project
        ? await installProjectPreset(id, { tool: opts?.tool, dryRun: opts?.dryRun })
        : await installPreset(id, { tool: opts?.tool, dryRun: opts?.dryRun, withHooks: opts?.withHooks });
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
  .option("-p, --project", "remove from the current project instead of user config")
  .action(async (preset: string, opts?: { tool?: ToolName; dryRun?: boolean; project?: boolean }) => {
    try {
      if (!/^[a-z0-9][a-z0-9_-]*$/.test(preset)) {
        throw new Error(`Invalid preset id '${preset}'. Expected kebab-case (a-z0-9, -, _).`);
      }
      if (opts?.project) {
        const reports = await removeProjectPreset(preset, { tool: opts?.tool, dryRun: opts?.dryRun });
        for (const r of reports) {
          const prefix = opts?.dryRun ? pc.cyan("dry-run") : (r.ok ? pc.green("✓") : pc.red("✗"));
          console.log(`${prefix} [${r.tool}] ${r.message}`);
          if (opts?.dryRun) {
            for (const c of r.changed) console.log(`   ${pc.dim("would remove:")} ${c}`);
          }
        }
        return;
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
  .option("--check", "check for updates without installing (exits non-zero if updates found)")
  .option("--watch", "register a periodic background update check (LaunchAgent/cron/schtasks)")
  .option("--uninstall", "with --watch, remove the registered background check")
  .option("--interval <hours>", "check interval in hours for --watch (default 6)")
  .action(async (opts?: { repo?: string; branch?: string; check?: boolean; watch?: boolean; uninstall?: boolean; interval?: string }) => {
    try {
      if (opts?.watch) {
        const result = opts.uninstall ? uninstallWatch() : installWatch({ interval: opts.interval ? Number(opts.interval) : undefined });
        console.log(`${pc.green("✓")} ${result.message}`);
        return;
      }
      if (opts?.check) {
        const { rows, updateCount } = await checkUpdates({ repo: opts.repo, branch: opts.branch });
        if (rows.length === 0) {
          console.log("No presets installed.");
          return;
        }
        console.log(renderOutdated(rows));
        for (const r of rows) {
          if (r.message) console.log(`   ${pc.dim(`${r.id}: ${r.message}`)}`);
        }
        if (updateCount > 0) {
          console.log("");
          console.log(pc.yellow(`${updateCount} update(s) available.`) + ` Run 'kimi-boost update' to apply.`);
          notify(`${updateCount} 个预设有更新，运行 kimi-boost update 应用`);
          process.exitCode = 1;
        } else {
          process.exitCode = 0;
        }
        return;
      }
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
  .command("bootstrap")
  .description("Generate a team onboarding script (setup.sh or Makefile target) for project-level presets")
  .option("--makefile", "append a 'setup' target to Makefile instead of generating setup.sh")
  .action((opts?: { makefile?: boolean }) => {
    try {
      const result = generateBootstrap({ makefile: opts?.makefile });
      console.log(`${pc.green("✓")} ${result.created ? "Generated" : "Updated"} ${result.path}`);
      if (result.presetIds.length > 0) {
        console.log(`   presets: ${result.presetIds.join(", ")}`);
      } else {
        console.log(pc.yellow("   warning: no project presets recorded (.kimi-boost/installed.json) — install some with --project first"));
      }
      if (result.mode === "setup.sh") {
        console.log(`   团队成员 clone 后运行: bash setup.sh`);
      } else {
        console.log(`   团队成员 clone 后运行: make setup`);
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
  .option("-p, --project", "diagnose project-level presets instead of user config")
  .action((opts?: { fix?: boolean; project?: boolean }) => {
    try {
      const issues = opts?.project
        ? runProjectDoctor(Boolean(opts?.fix))
        : runDoctor(Boolean(opts?.fix));
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
  .command("create <id>")
  .description("Scaffold a new preset directory under presets/ (for contributors)")
  .option("--name <name>", "display name (default: the id)")
  .option("--tags <a,b,c>", "comma-separated tags")
  .option("--shape <skill|mcp|command>", "preset shape (default: skill)")
  .option("--force", "overwrite an existing preset directory")
  .action((id: string, opts?: { name?: string; tags?: string; shape?: string; force?: boolean }) => {
    try {
      if (opts?.shape && !["skill", "mcp", "command"].includes(opts.shape)) {
        throw new Error(`Invalid --shape '${opts.shape}'. Expected: skill | mcp | command.`);
      }
      const files = createPreset(id, { ...opts, shape: opts?.shape as "skill" | "mcp" | "command" | undefined });
      console.log(pc.green(`✓ Created preset '${id}' in presets/${id}/`));
      for (const f of files) console.log(`   ${pc.dim(f)}`);
      console.log(`\nNext: edit the SKILL.md and reviewer agent, then open a PR.`);
    } catch (err) {
      console.error(pc.red(`✗ ${err instanceof Error ? err.message : String(err)}`));
      process.exitCode = 1;
    }
  });

program
  .command("usage")
  .description("Show session/prompt/tool-call usage tracked by the 'usage' preset")
  .option("-d, --days <n>", "number of days to show", "7")
  .action((opts?: { days?: string }) => {
    try {
      const days = Math.min(30, Math.max(1, Number(opts?.days ?? 7) || 7));
      printUsage(days);
    } catch (err) {
      console.error(pc.red(`✗ ${err instanceof Error ? err.message : String(err)}`));
      process.exitCode = 1;
    }
  });

program
  .command("outdated")
  .description("Show installed presets that have newer versions in the registry")
  .option("--repo <owner/repo>", "registry repository (default: shidesheng0218/kimi-boost, or $KIMI_BOOST_REPO)")
  .option("--branch <ref>", "registry branch (default: main)")
  .option("-p, --project", "check project-level presets (.kimi-boost/installed.json) instead of user config")
  .option("--json", "print machine-readable JSON")
  .action(async (opts?: { repo?: string; branch?: string; project?: boolean; json?: boolean }) => {
    try {
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
    } catch (err) {
      console.error(pc.red(`✗ ${err instanceof Error ? err.message : String(err)}`));
      process.exitCode = 1;
    }
  });

program
  .command("status")
  .description("Show detected CLIs, platform info, and per-preset install state across tools")
  .option("--json", "print machine-readable JSON")
  .action(async (opts: { json?: boolean }) => {
    const s = getStatus();
    const matrix = await getPresetMatrix();
    if (opts.json) {
      console.log(JSON.stringify({ ...s, presets: matrix }, null, 2));
      return;
    }
    console.log(pc.bold(`platform: ${s.platform}`));
    for (const t of s.tools) {
      const mark = t.installed ? pc.green("✓ installed") : pc.red("✗ not installed");
      const cfg = t.configured ? "" : pc.yellow(" (no config yet)");
      console.log(`${pc.bold(t.name)} ${mark} ${t.version ?? ""}${cfg}`);
      console.log(`   config: ${t.homeDir}`);
    }
    if (matrix.length > 0) {
      console.log();
      console.log(pc.bold("installed presets:"));
      console.log(renderPresetMatrix(matrix));
    }
  });

program.parse(process.argv);
