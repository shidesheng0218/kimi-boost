import type { Command } from "commander";
import pc from "picocolors";
import { wrapAction } from "./wrapAction.js";
import { listStatus } from "./list.js";

export function registerList(program: Command) {
  program
    .command("list")
    .description("List available and installed presets")
    .action(wrapAction(async () => {
      const { presets } = await listStatus();
      for (const p of presets) {
        const mark = p.installed ? pc.green("● installed") : pc.dim("○ not installed");
        console.log(`${pc.bold(p.id)} ${mark}`);
        console.log(`   ${p.description}`);
        if (p.tools.length) console.log(`   tools: ${p.tools.join(", ")}`);
      }
    }));
}
