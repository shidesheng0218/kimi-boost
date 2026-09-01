import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

vi.mock("node:child_process", () => ({
  execFileSync: vi.fn(),
}));

vi.mock("../src/core/fsguard.js", () => ({
  writeFileIfWritable: vi.fn(),
  removeIfWritable: vi.fn(),
}));

let tmp: string;
let boostHome: string;

function writeLocalStore(id: string, version: string): void {
  const dir = join(boostHome, "presets", id);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "preset.json"), JSON.stringify({ id, version }), "utf8");
}

beforeAll(() => {
  tmp = mkdtempSync(join(tmpdir(), "kimi-boost-watch-"));
  boostHome = join(tmp, "kboost");
  process.env.KIMI_BOOST_HOME = boostHome;
});

afterAll(() => {
  delete process.env.KIMI_BOOST_HOME;
  vi.unstubAllGlobals();
  rmSync(tmp, { recursive: true, force: true });
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("launchAgentPlist", () => {
  it("encodes interval hours as StartInterval seconds and includes program args", async () => {
    const { launchAgentPlist } = await import("../src/commands/updateWatch.js");
    const plist = launchAgentPlist(6, "/usr/bin/node", "/x/cli.js");
    expect(plist).toContain("<integer>21600</integer>");
    expect(plist).toContain("<string>/usr/bin/node</string>");
    expect(plist).toContain("<string>/x/cli.js</string>");
    expect(plist).toContain("<string>--check</string>");
  });
});

describe("cronLine", () => {
  it("produces a marked crontab line at the given interval", async () => {
    const { cronLine } = await import("../src/commands/updateWatch.js");
    const line = cronLine(6, "/usr/bin/node", "/x/cli.js");
    expect(line).toContain("0 */6 * * *");
    expect(line).toContain("# kimi-boost-watch");
    expect(line).toContain("/usr/bin/node /x/cli.js update --check");
  });
});

describe("schtasksCommand", () => {
  it("produces a schtasks /create command with minute interval", async () => {
    const { schtasksCommand } = await import("../src/commands/updateWatch.js");
    const cmd = schtasksCommand(6, "C:\\node.exe", "C:\\cli.js");
    expect(cmd).toContain("schtasks /create");
    expect(cmd).toContain("/mo 360");
  });
});

describe("installWatch / uninstallWatch (darwin)", () => {
  it("writes a plist and calls launchctl load", async () => {
    vi.stubGlobal("process", { ...process, platform: "darwin" });
    const cp = await import("node:child_process");
    const { installWatch } = await import("../src/commands/updateWatch.js");
    const result = installWatch({ interval: 6 });
    expect(result.platform).toBe("darwin");
    expect(cp.execFileSync).toHaveBeenCalledWith("launchctl", ["load", "-w", expect.stringContaining("com.kimi-boost.update.plist")], expect.anything());
    vi.unstubAllGlobals();
  });

  it("uninstall calls launchctl unload", async () => {
    vi.stubGlobal("process", { ...process, platform: "darwin" });
    const cp = await import("node:child_process");
    const { uninstallWatch } = await import("../src/commands/updateWatch.js");
    uninstallWatch();
    expect(cp.execFileSync).toHaveBeenCalledWith("launchctl", ["unload", expect.stringContaining("com.kimi-boost.update.plist")], expect.anything());
    vi.unstubAllGlobals();
  });
});

describe("installWatch / uninstallWatch (linux)", () => {
  it("appends a marked line to crontab", async () => {
    vi.stubGlobal("process", { ...process, platform: "linux" });
    const cp = await import("node:child_process");
    (cp.execFileSync as ReturnType<typeof vi.fn>).mockImplementation((_cmd: string, args: string[]) => {
      if (args?.[0] === "-l") return "";
      return "";
    });
    const { installWatch } = await import("../src/commands/updateWatch.js");
    const result = installWatch({ interval: 6 });
    expect(result.platform).toBe("linux");
    const writeCall = (cp.execFileSync as ReturnType<typeof vi.fn>).mock.calls.find((c) => c[1]?.[0] === "-");
    expect(writeCall).toBeDefined();
    expect((writeCall![2] as { input: string }).input).toContain("# kimi-boost-watch");
    vi.unstubAllGlobals();
  });

  it("does not duplicate the marker line on repeated install", async () => {
    vi.stubGlobal("process", { ...process, platform: "linux" });
    const cp = await import("node:child_process");
    let stored = "";
    (cp.execFileSync as ReturnType<typeof vi.fn>).mockImplementation((_cmd: string, args: string[], opts?: { input?: string }) => {
      if (args?.[0] === "-l") return stored;
      if (args?.[0] === "-" && opts?.input) stored = opts.input;
      return "";
    });
    const { installWatch } = await import("../src/commands/updateWatch.js");
    installWatch({ interval: 6 });
    installWatch({ interval: 6 });
    const occurrences = stored.split("# kimi-boost-watch").length - 1;
    expect(occurrences).toBe(1);
    vi.unstubAllGlobals();
  });
});

describe("checkUpdates", () => {
  it("counts update-available rows", async () => {
    writeLocalStore("vue3", "1.0.0");
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: true, json: async () => ({ version: "1.1.0" }) })),
    );
    const { checkUpdates } = await import("../src/commands/updateWatch.js");
    const { rows, updateCount } = await checkUpdates({ ids: ["vue3"] });
    expect(updateCount).toBe(1);
    expect(rows[0].status).toBe("update-available");
    vi.unstubAllGlobals();
  });
});

describe("notify", () => {
  it("calls osascript on darwin and never throws", async () => {
    vi.stubGlobal("process", { ...process, platform: "darwin" });
    const cp = await import("node:child_process");
    const { notify } = await import("../src/commands/updateWatch.js");
    expect(() => notify("hello")).not.toThrow();
    expect(cp.execFileSync).toHaveBeenCalledWith("osascript", expect.arrayContaining(["-e"]), expect.anything());
    vi.unstubAllGlobals();
  });

  it("swallows errors when the notifier binary is missing", async () => {
    vi.stubGlobal("process", { ...process, platform: "linux" });
    const cp = await import("node:child_process");
    (cp.execFileSync as ReturnType<typeof vi.fn>).mockImplementation(() => {
      throw new Error("notify-send: command not found");
    });
    const { notify } = await import("../src/commands/updateWatch.js");
    expect(() => notify("hello")).not.toThrow();
    vi.unstubAllGlobals();
  });
});
