import type { Command } from "commander";
import { wrapAction } from "./wrapAction.js";
import { parseRemoteSpec } from "./installRemote.js";
import { describeProjectInstall, formatPresetSurface } from "../core/project.js";
import { getPreset, listPresets, presetSourceDir } from "../registry/presets.js";
import type { ToolName } from "../core/types.js";

export function registerInspect(program: Command) {
  program
    .command("inspect <preset>")
    .description("Preview a project-level install (components, hosts, hooks/MCP/deny/scripts, network, skipped) without writing")
    .option("-t, --tool <tool>", "target tool (kimi | claude | codex)")
    .action(wrapAction(async (preset: string, opts?: { tool?: ToolName }) => {
      const spec = parseRemoteSpec(preset);
      if (spec) {
        const { downloadRepoTarball, findDirWith } = await import("../core/github.js");
        const { readFileSync } = await import("node:fs");
        const { join } = await import("node:path");
        const repoSlug = `${spec.owner}/${spec.repo}`;
        const dl = await downloadRepoTarball(repoSlug, spec.ref);
        try {
          const presetRoot = findDirWith(dl.root, "preset.json");
          if (!presetRoot) throw new Error(`preset.json not found in ${repoSlug}@${spec.ref}`);
          const def = JSON.parse(readFileSync(join(presetRoot, "preset.json"), "utf8"));
          const surface = describeProjectInstall(def, presetRoot, `github:${repoSlug}@${spec.ref}`, opts?.tool);
          console.log(formatPresetSurface(surface));
        } finally {
          dl.cleanup();
        }
        return;
      }
      const def = getPreset(preset);
      if (!def) throw new Error(`Preset '${preset}' not found. Available: ${listPresets().map((p) => p.id).join(", ")}`);
      console.log(formatPresetSurface(describeProjectInstall(def, presetSourceDir(preset), "builtin", opts?.tool)));
    }));
}
