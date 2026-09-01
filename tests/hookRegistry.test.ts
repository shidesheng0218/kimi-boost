import { describe, expect, it } from "vitest";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  claimPresetHooks,
  fingerprintHook,
  fingerprintPresetHooks,
  hookCommandOwner,
  releasePresetRefs,
  retargetCommand,
} from "../src/core/hookRegistry.js";
import type { HookRegistryEntry } from "../src/core/manifest.js";

describe("fingerprintHook", () => {
  it("is deterministic for identical inputs", () => {
    const a = fingerprintHook("PreToolUse", "Bash", "console.log(1)");
    const b = fingerprintHook("PreToolUse", "Bash", "console.log(1)");
    expect(a).toBe(b);
  });

  it("differs when script content differs", () => {
    const a = fingerprintHook("PreToolUse", "Bash", "console.log(1)");
    const b = fingerprintHook("PreToolUse", "Bash", "console.log(2)");
    expect(a).not.toBe(b);
  });

  it("differs when matcher differs", () => {
    const a = fingerprintHook("PreToolUse", "Bash", "same");
    const b = fingerprintHook("PreToolUse", "Write", "same");
    expect(a).not.toBe(b);
  });
});

describe("retargetCommand / hookCommandOwner", () => {
  it("extracts owner and retargets on POSIX paths", () => {
    const cmd = 'node "/home/u/.kimi-boost/hooks/vue3/protect-main.mjs"';
    expect(hookCommandOwner(cmd)).toBe("vue3");
    expect(retargetCommand(cmd, "nextjs")).toBe('node "/home/u/.kimi-boost/hooks/nextjs/protect-main.mjs"');
  });

  it("extracts owner and retargets on Windows-style paths", () => {
    const cmd = 'node "C:\\Users\\u\\.kimi-boost\\hooks\\vue3\\protect-main.mjs"';
    expect(hookCommandOwner(cmd)).toBe("vue3");
    expect(retargetCommand(cmd, "nextjs")).toBe('node "C:\\Users\\u\\.kimi-boost\\hooks\\nextjs\\protect-main.mjs"');
  });

  it("returns undefined owner for commands outside the hooks/ layout", () => {
    expect(hookCommandOwner("echo hi")).toBeUndefined();
  });
});

describe("fingerprintPresetHooks", () => {
  it("computes a fingerprint per hook when the script is readable", () => {
    const tmp = mkdtempSync(join(tmpdir(), "kimi-boost-hookfp-"));
    try {
      mkdirSync(join(tmp, "hooks"), { recursive: true });
      writeFileSync(join(tmp, "hooks", "a.mjs"), "content-a");
      const fps = fingerprintPresetHooks(tmp, [{ event: "PreToolUse", script: "a.mjs" }, { event: "PreToolUse", script: "missing.mjs" }]);
      expect(fps[0]).toBeDefined();
      expect(fps[1]).toBeUndefined();
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });
});

describe("releasePresetRefs", () => {
  it("deletes the entry when the last ref is released", () => {
    const hooks: Record<string, HookRegistryEntry> = {
      fp1: { event: "PreToolUse", script: "a.mjs", command: "node hooks/vue3/a.mjs", refs: ["vue3"] },
    };
    const out = releasePresetRefs(hooks, "vue3");
    expect(out[0].refsLeft).toEqual([]);
    expect(hooks.fp1).toBeUndefined();
  });

  it("retargets the command when the owner is released but other refs remain", () => {
    const hooks: Record<string, HookRegistryEntry> = {
      fp1: { event: "PreToolUse", script: "a.mjs", command: "node hooks/vue3/a.mjs", refs: ["vue3", "nextjs"] },
    };
    const out = releasePresetRefs(hooks, "vue3");
    expect(out[0].refsLeft).toEqual(["nextjs"]);
    expect(out[0].newCommand).toBe("node hooks/nextjs/a.mjs");
    expect(hooks.fp1.command).toBe("node hooks/nextjs/a.mjs");
  });

  it("does not retarget when the entry already points at a non-released owner", () => {
    const hooks: Record<string, HookRegistryEntry> = {
      fp1: { event: "PreToolUse", script: "a.mjs", command: "node hooks/nextjs/a.mjs", refs: ["vue3", "nextjs"] },
    };
    const out = releasePresetRefs(hooks, "vue3");
    expect(out[0].newCommand).toBeUndefined();
    expect(hooks.fp1.command).toBe("node hooks/nextjs/a.mjs");
  });

  it("skips entries in keepFps", () => {
    const hooks: Record<string, HookRegistryEntry> = {
      fp1: { event: "PreToolUse", script: "a.mjs", command: "node hooks/vue3/a.mjs", refs: ["vue3"] },
    };
    const out = releasePresetRefs(hooks, "vue3", new Set(["fp1"]));
    expect(out).toEqual([]);
    expect(hooks.fp1).toBeDefined();
  });
});

describe("claimPresetHooks", () => {
  const buildCommand = (presetId: string, hook: { script: string }) => `node hooks/${presetId}/${hook.script}`;

  it("registers a fresh entry when the fingerprint is unregistered", () => {
    const hooks: Record<string, HookRegistryEntry> = {};
    const result = claimPresetHooks(hooks, "vue3", ["fp1"], [{ event: "PreToolUse", script: "a.mjs" }], buildCommand);
    expect(result.freshCount).toBe(1);
    expect(result.sharedCount).toBe(0);
    expect(hooks.fp1.refs).toEqual(["vue3"]);
    expect(result.entries[0].command).toBe("node hooks/vue3/a.mjs");
  });

  it("shares an existing entry when the fingerprint already matches", () => {
    const hooks: Record<string, HookRegistryEntry> = {
      fp1: { event: "PreToolUse", script: "a.mjs", command: "node hooks/vue3/a.mjs", refs: ["vue3"] },
    };
    const result = claimPresetHooks(hooks, "nextjs", ["fp1"], [{ event: "PreToolUse", script: "a.mjs" }], buildCommand);
    expect(result.sharedCount).toBe(1);
    expect(result.freshCount).toBe(0);
    expect(hooks.fp1.refs).toEqual(["vue3", "nextjs"]);
    expect(result.entries[0].command).toBe("node hooks/vue3/a.mjs");
  });

  it("does not duplicate a ref already present", () => {
    const hooks: Record<string, HookRegistryEntry> = {
      fp1: { event: "PreToolUse", script: "a.mjs", command: "node hooks/vue3/a.mjs", refs: ["vue3"] },
    };
    const result = claimPresetHooks(hooks, "vue3", ["fp1"], [{ event: "PreToolUse", script: "a.mjs" }], buildCommand);
    expect(hooks.fp1.refs).toEqual(["vue3"]);
    expect(result.registryChanged).toBe(false);
  });

  it("does not register when fingerprint is undefined (unreadable script)", () => {
    const hooks: Record<string, HookRegistryEntry> = {};
    const result = claimPresetHooks(hooks, "vue3", [undefined], [{ event: "PreToolUse", script: "missing.mjs" }], buildCommand);
    expect(Object.keys(hooks)).toHaveLength(0);
    expect(result.entries[0].command).toBe("node hooks/vue3/missing.mjs");
  });
});
