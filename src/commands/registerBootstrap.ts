import type { Command } from "commander";
import pc from "picocolors";
import { wrapAction } from "./wrapAction.js";
import { generateBootstrap } from "./bootstrap.js";

export function registerBootstrap(program: Command) {
  program
    .command("bootstrap")
    .description("Generate a team onboarding script (setup.sh or Makefile target) for project-level presets")
    .option("--makefile", "append a 'setup' target to Makefile instead of generating setup.sh")
    .action(wrapAction(async (opts?: { makefile?: boolean }) => {
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
    }));
}
