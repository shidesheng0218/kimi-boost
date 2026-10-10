import type { Command } from "commander";
import { createRequire } from "node:module";
import { wrapAction } from "./wrapAction.js";
import { runExport } from "./export.js";

const require = createRequire(import.meta.url);
const pkgVersion = (require("../../package.json") as { version: string }).version;

export function registerExport(program: Command) {
  program
    .command("export [file]")
    .description("Export your preset setup (presets + sources + watch) to a shareable file")
    .option("--embed-content", "embed preset contents for exact offline restore (outputs .tar.gz)")
    .option("--include-usage", "include usage.json history in the export")
    .action(wrapAction(async (file: string | undefined, opts?: { embedContent?: boolean; includeUsage?: boolean }) => {
      await runExport({ out: file, embedContent: opts?.embedContent, includeUsage: opts?.includeUsage, cliVersion: pkgVersion });
    }));
}
