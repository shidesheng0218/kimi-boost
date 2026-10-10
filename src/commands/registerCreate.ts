import type { Command } from "commander";
import pc from "picocolors";
import { wrapAction } from "./wrapAction.js";
import { createPreset } from "./create.js";

export function registerCreate(program: Command) {
  program
    .command("create <id>")
    .description("Scaffold a new preset directory under presets/ (for contributors)")
    .option("--name <name>", "display name (default: the id)")
    .option("--tags <a,b,c>", "comma-separated tags")
    .option("--shape <skill|mcp|command>", "preset shape (default: skill)")
    .option("--force", "overwrite an existing preset directory")
    .action(wrapAction(async (id: string, opts?: { name?: string; tags?: string; shape?: string; force?: boolean }) => {
      if (opts?.shape && !["skill", "mcp", "command"].includes(opts.shape)) {
        throw new Error(`Invalid --shape '${opts.shape}'. Expected: skill | mcp | command.`);
      }
      const files = createPreset(id, { ...opts, shape: opts?.shape as "skill" | "mcp" | "command" | undefined });
      console.log(pc.green(`✓ Created preset '${id}' in presets/${id}/`));
      for (const f of files) console.log(`   ${pc.dim(f)}`);
      console.log(`\nNext: edit the SKILL.md and reviewer agent, then open a PR.`);
    }));
}
