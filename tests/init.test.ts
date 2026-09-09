import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  detectProjectPresets: vi.fn(),
  installPreset: vi.fn(),
  installProjectPreset: vi.fn(),
  listStatus: vi.fn(),
  findProjectRoot: vi.fn(),
  prompts: vi.fn(),
}));

vi.mock("../src/core/detectProject.js", () => ({ detectProjectPresets: mocks.detectProjectPresets }));
vi.mock("../src/commands/install.js", () => ({ installPreset: mocks.installPreset }));
vi.mock("../src/commands/list.js", () => ({ listStatus: mocks.listStatus }));
vi.mock("../src/core/project.js", () => ({
  findProjectRoot: mocks.findProjectRoot,
  installProjectPreset: mocks.installProjectPreset,
}));
vi.mock("../src/commands/reports.js", () => ({ renderReports: vi.fn() }));
vi.mock("prompts", () => ({ default: mocks.prompts }));

import { runInit } from "../src/commands/init.js";

const ok = (id: string) => [{ tool: "kimi", presetId: id, ok: true, message: "installed", changed: [] }];

describe("runInit", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.findProjectRoot.mockReturnValue({ root: "/proj", isGitRoot: true });
    mocks.listStatus.mockResolvedValue({ presets: [], installedOnly: [] });
    mocks.installPreset.mockImplementation(async (id: string) => ok(id));
    mocks.installProjectPreset.mockImplementation(async (id: string) => ok(id));
  });

  it("installs core + all detected presets with --yes and never prompts", async () => {
    mocks.detectProjectPresets.mockReturnValue([
      { id: "go", evidence: "go.mod" },
      { id: "react", evidence: "package.json 依赖: react" },
    ]);
    await runInit({ yes: true });
    expect(mocks.prompts).not.toHaveBeenCalled();
    // core 护栏永远置顶且默认安装
    expect(mocks.installPreset.mock.calls.map((c) => c[0])).toEqual(["core", "go", "react"]);
  });

  it("preselects only uninstalled presets in the prompt", async () => {
    mocks.detectProjectPresets.mockReturnValue([
      { id: "go", evidence: "go.mod" },
      { id: "react", evidence: "package.json 依赖: react" },
    ]);
    mocks.listStatus.mockResolvedValue({ presets: [], installedOnly: ["go"] });
    mocks.prompts.mockResolvedValue({ presets: ["react"] });
    await runInit({});
    const arg = mocks.prompts.mock.calls[0][0] as { choices: Array<{ value: string; selected: boolean }> };
    // core 永远出现在第一个,且未安装时预选
    expect(arg.choices[0].value).toBe("core");
    expect(arg.choices[0].selected).toBe(true);
    expect(arg.choices.find((c) => c.value === "go")!.selected).toBe(false);
    expect(arg.choices.find((c) => c.value === "react")!.selected).toBe(true);
    expect(mocks.installPreset.mock.calls.map((c) => c[0])).toEqual(["react"]);
  });

  it("offers the core guardrail even when no stack is detected", async () => {
    mocks.detectProjectPresets.mockReturnValue([]);
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    await runInit({ yes: true });
    expect(mocks.installPreset.mock.calls.map((c) => c[0])).toEqual(["core"]);
    log.mockRestore();
  });

  it("does not preselect core when it is already installed", async () => {
    mocks.detectProjectPresets.mockReturnValue([{ id: "go", evidence: "go.mod" }]);
    mocks.listStatus.mockResolvedValue({ presets: [], installedOnly: ["core"] });
    mocks.prompts.mockResolvedValue({ presets: ["go"] });
    await runInit({});
    const arg = mocks.prompts.mock.calls[0][0] as { choices: Array<{ value: string; selected: boolean }> };
    expect(arg.choices.find((c) => c.value === "core")!.selected).toBe(false);
    expect(arg.choices.find((c) => c.value === "go")!.selected).toBe(true);
  });

  it("cancels cleanly when the user selects nothing", async () => {
    mocks.detectProjectPresets.mockReturnValue([{ id: "go", evidence: "go.mod" }]);
    mocks.prompts.mockResolvedValue({ presets: [] });
    await runInit({});
    expect(mocks.installPreset).not.toHaveBeenCalled();
  });

  it("routes to project-level install when --project is set", async () => {
    mocks.detectProjectPresets.mockReturnValue([{ id: "go", evidence: "go.mod" }]);
    await runInit({ yes: true, project: true });
    expect(mocks.installProjectPreset).toHaveBeenCalledTimes(2); // core + go
    expect(mocks.installPreset).not.toHaveBeenCalled();
  });

  it("passes --tool and --dry-run through to install", async () => {
    mocks.detectProjectPresets.mockReturnValue([]);
    await runInit({ yes: true, tool: "claude", dryRun: true });
    expect(mocks.installPreset).toHaveBeenCalledWith("core", { tool: "claude", dryRun: true });
  });
});
