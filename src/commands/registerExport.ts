import type { Command } from "commander";
import { wrapAction } from "./wrapAction.js";
import { runExport } from "./export.js";

export function registerExport(program: Command, pkgVersion: string) {
  program
    .command("export [file]")
    .description("Export your preset setup (presets + sources + watch) to a shareable file")
    .option("--embed-content", "embed preset contents for exact offline restore (outputs .tar.gz)")
    .option("--include-usage", "include usage.json history in the export")
    .action(wrapAction(async (file: string | undefined, opts?: { embedContent?: boolean; includeUsage?: boolean }) => {
      await runExport({ out: file, embedContent: opts?.embedContent, includeUsage: opts?.includeUsage, cliVersion: pkgVersion });
    }));
}
