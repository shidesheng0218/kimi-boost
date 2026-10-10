import type { Command } from "commander";
import { runBadge } from "./badge.js";

export function registerBadge(program: Command) {
  program
    .command("badge [preset]")
    .description("Print a README badge (markdown) showing this project uses kimi-boost")
    .action((preset?: string) => {
      runBadge(preset);
    });
}
