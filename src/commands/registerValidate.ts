import type { Command } from "commander";
import { wrapAction } from "./wrapAction.js";
import { runValidate } from "./devtools.js";

export function registerValidate(program: Command) {
  program
    .command("validate <dir>")
    .description("Validate a preset directory (schema, hooks, skills, plugin manifest)")
    .action(wrapAction(async (dir: string) => {
      if (!runValidate(dir)) process.exitCode = 1;
    }));
}
