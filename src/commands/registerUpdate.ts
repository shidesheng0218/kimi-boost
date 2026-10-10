import type { Command } from "commander";
import pc from "picocolors";
import { wrapAction } from "./wrapAction.js";
import { runUpdate, previewUpdate } from "./update.js";
import { checkUpdates, installWatch, notify, uninstallWatch } from "./updateWatch.js";
import { renderOutdated } from "./outdated.js";

export function registerUpdate(program: Command) {
  program
    .command("update")
    .description("Update installed presets to the latest versions")
    .option("--repo <owner/repo>", "registry repository (default: shidesheng0218/kimi-boost, or $KIMI_BOOST_REPO)")
    .option("--branch <ref>", "registry branch (default: main)")
    .option("--check", "check for updates without installing (exits non-zero if updates found)")
    .option("-n, --dry-run", "preview what an update would change (version + file diff) without writing anything")
    .option("--watch", "register a periodic background update check (LaunchAgent/cron/schtasks)")
    .option("--uninstall", "with --watch, remove the registered background check")
    .option("--interval <hours>", "check interval in hours for --watch (default 6)")
    .action(wrapAction(async (opts?: { repo?: string; branch?: string; check?: boolean; dryRun?: boolean; watch?: boolean; uninstall?: boolean; interval?: string }) => {
      if (opts?.watch) {
        const result = opts.uninstall ? uninstallWatch() : installWatch({ interval: opts.interval ? Number(opts.interval) : undefined });
        console.log(`${pc.green("✓")} ${result.message}`);
        return;
      }
      if (opts?.dryRun) {
        const previews = await previewUpdate(opts as { repo?: string; branch?: string });
        if (previews.length === 0) {
          console.log("No presets installed.");
          return;
        }
        let updates = 0;
        let errors = 0;
        for (const p of previews) {
          if (p.status === "update-available") {
            updates++;
            console.log(`${pc.green("↑")} ${p.id}: ${p.from} -> ${p.to}`);
            const d = p.diff;
            if (d) {
              if (d.added.length) console.log(`   ${pc.green("added:")}    ${d.added.join(", ")}`);
              if (d.modified.length) console.log(`   ${pc.yellow("modified:")} ${d.modified.join(", ")}`);
              if (d.removed.length) console.log(`   ${pc.red("removed:")}  ${d.removed.join(", ")}`);
              if (!d.added.length && !d.modified.length && !d.removed.length) {
                console.log(`   ${pc.dim("(content unchanged; version bump only)")}`);
              }
            }
          } else if (p.status === "up-to-date") {
            console.log(`${pc.dim("·")} ${p.id}: up to date`);
          } else {
            errors++;
            console.log(`${pc.red("✗")} ${p.id}: ${p.message ?? "error"}`);
          }
        }
        if (errors > 0) process.exitCode = 1;
        if (updates > 0) {
          console.log("");
          console.log(pc.yellow(`${updates} update(s) available.`) + ` Run 'kimi-boost update' to apply.`);
          process.exitCode = 1;
        }
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
      if (results.some((r) => r.status === "error")) process.exitCode = 1;
    }));
}
