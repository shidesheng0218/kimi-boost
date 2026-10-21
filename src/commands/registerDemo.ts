import type { Command } from "commander";
import { wrapAction } from "./wrapAction.js";
import { runDemo } from "./demo.js";

export function registerDemo(program: Command) {
  program
    .command("demo")
    .description("Run a safe, sandboxed demonstration of core guardrails without touching your system")
    .option("--json", "output raw execution report as JSON")
    .action(wrapAction(async (opts?: { json?: boolean }) => {
      runDemo({ json: opts?.json });
    }));
}
