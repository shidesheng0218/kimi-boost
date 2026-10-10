import type { Command } from "commander";
import { wrapAction } from "./wrapAction.js";
import { runPackage } from "./devtools.js";

export function registerPackage(program: Command) {
  program
    .command("package <dir>")
    .description("Validate and pack a preset dir into <id>-<version>.zip for distribution")
    .option("-o, --out <file>", "output zip path (default: <id>-<version>.zip)")
    .action(wrapAction(async (dir: string, opts?: { out?: string }) => {
      await runPackage(dir, { out: opts?.out });
    }));
}
