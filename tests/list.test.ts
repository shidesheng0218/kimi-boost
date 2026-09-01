import { describe, expect, it, vi } from "vitest";

vi.mock("../src/core/detect.js", () => ({
  detect: () => ({
    platform: "darwin",
    tools: {
      kimi: { tool: "kimi", installed: true, homeDir: "/x", configured: true },
      claude: { tool: "claude", installed: false, homeDir: "/y", configured: false },
      codex: { tool: "codex", installed: false, homeDir: "/z", configured: false },
    },
  }),
}));

vi.mock("../src/adapters/index.js", () => ({
  getAdapter: (tool: string) =>
    tool === "kimi" ? { tool: "kimi", listInstalled: async () => ["vue3", "go"] } : undefined,
}));

vi.mock("../src/registry/presets.js", () => ({
  listPresets: () => [
    { id: "vue3", name: "Vue3", description: "d1", tags: [], hooks: [] },
    { id: "go", name: "Go", description: "d2", tags: [], hooks: [] },
    { id: "rust", name: "Rust", description: "d3", tags: [], hooks: [] },
  ],
}));

describe("listStatus", () => {
  it("reports installedOnly from adapters of installed tools only", async () => {
    const { listStatus } = await import("../src/commands/list.js");
    const { presets, installedOnly } = await listStatus();
    expect(installedOnly.sort()).toEqual(["go", "vue3"]);
    const vue3 = presets.find((p) => p.id === "vue3")!;
    expect(vue3.installed).toBe(true);
    expect(vue3.tools).toEqual(["kimi"]);
    const rust = presets.find((p) => p.id === "rust")!;
    expect(rust.installed).toBe(false);
  });
});
