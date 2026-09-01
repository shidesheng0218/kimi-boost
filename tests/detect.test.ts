import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("node:child_process", () => ({
  execFileSync: vi.fn(),
}));

afterEach(() => {
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});

describe("detectPlatform", () => {
  it("maps process.platform to the Platform union", async () => {
    const { detectPlatform } = await import("../src/core/detect.js");
    vi.stubGlobal("process", { ...process, platform: "darwin" });
    expect(detectPlatform()).toBe("darwin");
    vi.stubGlobal("process", { ...process, platform: "win32" });
    expect(detectPlatform()).toBe("win32");
    vi.stubGlobal("process", { ...process, platform: "linux" });
    expect(detectPlatform()).toBe("linux");
    vi.stubGlobal("process", { ...process, platform: "sunos" });
    expect(detectPlatform()).toBe("unknown");
  });
});

describe("kimiHomeDir", () => {
  it("prefers KIMI_CODE_HOME env override", async () => {
    process.env.KIMI_CODE_HOME = "/tmp/custom-kimi-home";
    const { kimiHomeDir } = await import("../src/core/detect.js");
    expect(kimiHomeDir()).toBe("/tmp/custom-kimi-home");
    delete process.env.KIMI_CODE_HOME;
  });
});

describe("detect", () => {
  it("marks a tool installed when execFileSync resolves", async () => {
    const cp = await import("node:child_process");
    (cp.execFileSync as ReturnType<typeof vi.fn>).mockImplementation(() => "1.2.3\n");
    const { detect } = await import("../src/core/detect.js");
    const result = detect();
    expect(result.tools.kimi.installed).toBe(true);
    expect(result.tools.kimi.version).toBe("1.2.3");
  });

  it("marks a tool not installed when execFileSync throws and no common path exists", async () => {
    const cp = await import("node:child_process");
    (cp.execFileSync as ReturnType<typeof vi.fn>).mockImplementation(() => {
      throw new Error("not found");
    });
    process.env.KIMI_CODE_HOME = "/tmp/nonexistent-kimi-home-xyz";
    process.env.CLAUDE_CODE_HOME = "/tmp/nonexistent-claude-home-xyz";
    process.env.CODEX_HOME = "/tmp/nonexistent-codex-home-xyz";
    const { detect } = await import("../src/core/detect.js");
    const result = detect();
    expect(result.tools.kimi.installed).toBe(false);
    expect(result.tools.codex.installed).toBe(false);
    delete process.env.KIMI_CODE_HOME;
    delete process.env.CLAUDE_CODE_HOME;
    delete process.env.CODEX_HOME;
  });
});
