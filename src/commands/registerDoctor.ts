import type { Command } from "commander";
import { homedir } from "node:os";
import pc from "picocolors";
import { wrapAction } from "./wrapAction.js";
import { runDoctor } from "./doctor.js";
import { runProjectDoctor } from "./doctorProject.js";
import { detect } from "../core/detect.js";
import { installedKimiPlugins, kimiHookEvents, kimiHookSummary } from "../core/kimiPlugins.js";
import { buildDoctorSnapshot, redactSnapshot } from "./doctorSnapshot.js";
import type { ToolName } from "../core/types.js";

export function registerDoctor(program: Command) {
  program
    .command("doctor")
    .description("Diagnose your setup: config syntax, hooks, mounted dirs, manifest consistency")
    .option("-f, --fix", "attempt to auto-fix fixable issues (missing dirs / hook scripts)")
    .option("-p, --project", "diagnose project-level presets instead of user config")
    .option("--json", "print a redacted machine-readable snapshot (for issues/support)")
    .action(wrapAction(async (opts?: { fix?: boolean; project?: boolean; json?: boolean }) => {
      const issues = opts?.project
        ? runProjectDoctor(Boolean(opts?.fix))
        : runDoctor(Boolean(opts?.fix));
      if (opts?.json) {
        const env = detect();
        const tools = Object.fromEntries(
          (["kimi", "claude", "codex"] as ToolName[]).map((t) => [
            t,
            { installed: env.tools[t].installed, version: env.tools[t].version, home: env.tools[t].homeDir },
          ]),
        );
        const pluginIds = installedKimiPlugins();
        const hookEvents = kimiHookEvents();
        const summary = kimiHookSummary();
        const snapshot = buildDoctorSnapshot({
          issues,
          platform: env.platform,
          tools,
          pluginIds,
          hookEvents,
          byEvent: summary.byEvent,
        });
        const homes = [...new Set([...Object.values(tools).map((t) => t.home), homedir()])];
        console.log(JSON.stringify(redactSnapshot(snapshot, homes), null, 2));
        process.exitCode = issues.some((i) => i.level === "error") ? 1 : 0;
        return;
      }
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
    }));
}
