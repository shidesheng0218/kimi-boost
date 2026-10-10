import type { Command } from "commander";
import pc from "picocolors";
import { wrapAction } from "./wrapAction.js";
import { runDoctor } from "./doctor.js";
import { runProjectDoctor } from "./doctorProject.js";

export function registerDoctor(program: Command) {
  program
    .command("doctor")
    .description("Diagnose your setup: config syntax, hooks, mounted dirs, manifest consistency")
    .option("-f, --fix", "attempt to auto-fix fixable issues (missing dirs / hook scripts)")
    .option("-p, --project", "diagnose project-level presets instead of user config")
    .action(wrapAction(async (opts?: { fix?: boolean; project?: boolean }) => {
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
    }));
}
