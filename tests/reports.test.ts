import { afterEach, describe, expect, it, vi } from "vitest";
import type { InstallReport } from "../src/adapters/types.js";

function report(ok: boolean): InstallReport {
  return { tool: "claude", presetId: "vue3", ok, message: ok ? "installed" : "failed", changed: [] };
}

describe("renderReports", () => {
  afterEach(() => {
    process.exitCode = 0;
    vi.restoreAllMocks();
  });

  it("sets process.exitCode = 1 when any tool report is not ok", async () => {
    vi.spyOn(console, "log").mockImplementation(() => {});
    process.exitCode = 0;
    const { renderReports } = await import("../src/commands/reports.js");
    renderReports([report(true), report(false)]);
    expect(process.exitCode).toBe(1);
  });

  it("leaves the exit code alone when every report is ok", async () => {
    vi.spyOn(console, "log").mockImplementation(() => {});
    process.exitCode = 0;
    const { renderReports } = await import("../src/commands/reports.js");
    renderReports([report(true), report(true)]);
    expect(process.exitCode).toBe(0);
  });

  it("does not set the exit code in dry-run even when a report is not ok", async () => {
    vi.spyOn(console, "log").mockImplementation(() => {});
    process.exitCode = 0;
    const { renderReports } = await import("../src/commands/reports.js");
    renderReports([report(false)], { dryRun: true });
    expect(process.exitCode).toBe(0);
  });

  it("prints changed entries with the action-specific dry-run label", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    const { renderReports } = await import("../src/commands/reports.js");
    renderReports([{ ...report(true), changed: ["/tmp/x"] }], { dryRun: true, action: "remove" });
    expect(log).toHaveBeenCalledWith(expect.stringContaining("would remove:"));
  });
});
