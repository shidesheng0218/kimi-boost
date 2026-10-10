import type { Command } from "commander";
import { wrapAction } from "./wrapAction.js";
import { runGuard } from "./guard.js";

export function registerGuard(program: Command) {
  program
    .command("guard")
    .description("Show guardrail status and block history; toggle, soften, explain, run in CI, or install a pre-commit hook")
    .option("--log", "show recent blocked actions")
    .option("-n <count>", "number of log entries to show (with --log)", "20")
    .option("--enable <name>", "enable a guard")
    .option("--disable <name>", "disable a guard (takes effect on the next agent action)")
    .option("--warn <name>", "soften a guard to warn mode: still logged and reported, but not blocking")
    .option("--block <name>", "restore a guard to block mode (the default)")
    .option("--explain <name>", "explain what a guard blocks, how to bypass it, and the risk of disabling it")
    .option("--add-pattern <regex>", "add a custom block pattern to the block-dangerous guard")
    .option("--ci", "scan changed files for secrets and exit non-zero on findings (for CI / pre-commit)")
    .option("--staged", "with --ci: scan staged files only")
    .option("--install-git-hook", "install a pre-commit hook running `guard --ci --staged` in this repo")
    .option("--uninstall-git-hook", "remove the kimi-boost managed block from the pre-commit hook")
    .action(wrapAction(async (opts?: {
      log?: boolean;
      n?: string;
      enable?: string;
      disable?: string;
      warn?: string;
      block?: string;
      explain?: string;
      addPattern?: string;
      ci?: boolean;
      staged?: boolean;
      installGitHook?: boolean;
      uninstallGitHook?: boolean;
    }) => {
      runGuard(opts);
    }));
}
