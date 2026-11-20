import { describe, expect, it } from "vitest";
import { knownIssueMatches, type KnownIssueContext } from "../src/core/knownIssues.js";

function ctx(overrides: Partial<KnownIssueContext> = {}): KnownIssueContext {
  return { platform: "linux", kimiVersion: "0.38.0", pluginCount: 0, hookEvents: [], ...overrides };
}

describe("knownIssueMatches", () => {
  it("KI-2553 fires on win32 + 0.29.0 + two plugins", () => {
    const ids = knownIssueMatches(ctx({ platform: "win32", kimiVersion: "0.29.0", pluginCount: 2 })).map((i) => i.id);
    expect(ids).toContain("KI-2553");
  });

  it("KI-2553 does not fire on linux, 0.30.0, or one plugin", () => {
    expect(knownIssueMatches(ctx({ platform: "linux", kimiVersion: "0.29.0", pluginCount: 3 }))).toHaveLength(0);
    expect(knownIssueMatches(ctx({ platform: "win32", kimiVersion: "0.30.0", pluginCount: 3 }))).toHaveLength(0);
    expect(knownIssueMatches(ctx({ platform: "win32", kimiVersion: "0.29.0", pluginCount: 1 }))).toHaveLength(0);
  });

  it("KI-2564 fires when a PostToolUse hook is present", () => {
    const issue = knownIssueMatches(ctx({ hookEvents: ["PreToolUse", "PostToolUse"] })).find((i) => i.id === "KI-2564");
    expect(issue).toMatchObject({ id: "KI-2564", severity: "info" });
  });

  it("KI-2564 does not fire without PostToolUse", () => {
    expect(knownIssueMatches(ctx({ hookEvents: ["PreToolUse", "Stop"] }))).toHaveLength(0);
  });

  it("returns no issues for an empty context", () => {
    expect(knownIssueMatches(ctx())).toHaveLength(0);
  });
});