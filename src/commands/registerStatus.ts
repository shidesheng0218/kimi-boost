import type { Command } from "commander";
import pc from "picocolors";
import { wrapAction } from "./wrapAction.js";
import { getStatus, getPresetMatrix, renderPresetMatrix } from "./status.js";

export function registerStatus(program: Command) {
  program
    .command("status")
    .description("Show detected CLIs, platform info, and per-preset install state across tools")
    .option("--json", "print machine-readable JSON")
    .action(wrapAction(async (opts: { json?: boolean }) => {
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
    }));
}
