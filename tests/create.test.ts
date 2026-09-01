import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const rootBox = vi.hoisted(() => ({ root: "" }));

vi.mock("../src/registry/presets.js", () => ({
  presetsRoot: () => rootBox.root,
}));

let tmp: string;

beforeAll(() => {
  tmp = mkdtempSync(join(tmpdir(), "kimi-boost-create-"));
  rootBox.root = tmp;
});

afterAll(() => {
  rmSync(tmp, { recursive: true, force: true });
});

describe("createPreset", () => {
  it("rejects invalid ids", async () => {
    const { createPreset } = await import("../src/commands/create.js");
    expect(() => createPreset("Not_Kebab!")).toThrow(/kebab-case/);
  });

  it("rejects a duplicate id unless force", async () => {
    const { createPreset } = await import("../src/commands/create.js");
    createPreset("dup-test");
    expect(() => createPreset("dup-test")).toThrow(/already exists/);
    expect(() => createPreset("dup-test", { force: true })).not.toThrow();
  });

  it("generates the standard skill shape by default", async () => {
    const { createPreset } = await import("../src/commands/create.js");
    const files = createPreset("std-shape", { name: "Std Shape", tags: "a,b" });
    expect(files).toEqual(
      expect.arrayContaining([
        "preset.json",
        "kimi.plugin.json",
        "skills/std-shape-best-practices/SKILL.md",
        "agents/std-shape-reviewer.md",
        "hooks/protect-main.mjs",
      ]),
    );
    const preset = JSON.parse(readFileSync(join(tmp, "std-shape", "preset.json"), "utf8"));
    expect(preset.name).toBe("Std Shape");
    expect(preset.tags).toEqual(["a", "b"]);
    expect(preset.hooks).toHaveLength(1);
  });

  it("generates the mcp shape with mcpServers and no skills/agents/hooks", async () => {
    const { createPreset } = await import("../src/commands/create.js");
    const files = createPreset("mcp-shape", { shape: "mcp" });
    expect(files).toEqual(["preset.json", "kimi.plugin.json"]);
    const preset = JSON.parse(readFileSync(join(tmp, "mcp-shape", "preset.json"), "utf8"));
    expect(preset.mcpServers).toBeDefined();
    expect(preset.hooks).toEqual([]);
    const plugin = JSON.parse(readFileSync(join(tmp, "mcp-shape", "kimi.plugin.json"), "utf8"));
    expect(plugin.skills).toBeUndefined();
    expect(plugin.agents).toBeUndefined();
    expect(plugin.hooks).toBeUndefined();
    expect(existsSync(join(tmp, "mcp-shape", "hooks"))).toBe(false);
  });

  it("generates the command shape with a commands/report.md instead of a hook", async () => {
    const { createPreset } = await import("../src/commands/create.js");
    const files = createPreset("cmd-shape", { shape: "command" });
    expect(files).toEqual(
      expect.arrayContaining([
        "preset.json",
        "kimi.plugin.json",
        "skills/cmd-shape-best-practices/SKILL.md",
        "agents/cmd-shape-reviewer.md",
        "commands/cmd-shape-report.md",
      ]),
    );
    expect(files).not.toContain("hooks/protect-main.mjs");
    expect(existsSync(join(tmp, "cmd-shape", "hooks"))).toBe(false);
  });
});
