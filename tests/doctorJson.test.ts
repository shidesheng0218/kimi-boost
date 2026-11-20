import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { join } from "node:path";
import { buildDoctorSnapshot, redactSnapshot } from "../src/commands/doctorSnapshot.js";
import type { DoctorIssue } from "../src/commands/doctor.js";

let tmp: string;

beforeEach(() => {
  tmp = fs.mkdtempSync(join(os.tmpdir(), "kboost-docjson-"));
});

afterEach(() => {
  fs.rmSync(tmp, { recursive: true, force: true });
});

const issues: DoctorIssue[] = [];

function snapshot(overrides: Partial<Parameters<typeof buildDoctorSnapshot>[0]> = {}) {
  return buildDoctorSnapshot({
    issues,
    platform: "win32",
    tools: { kimi: { installed: true, version: "0.29.0", home: "/Users/tester/.kimi-code" } },
    pluginIds: ["a", "b"],
    hookEvents: [],
    byEvent: {},
    ...overrides,
  });
}

describe("buildDoctorSnapshot", () => {
  it("KI-2553 appears in the snapshot for win32 + 0.29.0 + two plugins", () => {
    expect(snapshot().knownIssues.map((i) => i.id)).toContain("KI-2553");
  });

  it("KI-2564 appears when PostToolUse is among hook events", () => {
    expect(snapshot({ hookEvents: ["PostToolUse"] }).knownIssues.map((i) => i.id)).toContain("KI-2564");
  });

  it("records the known-issues review date", () => {
    expect(snapshot().lastReviewed).toBe("2026-11-20");
  });
});

describe("redactSnapshot", () => {
  it("redacts every home path from tools, issues detail and commands", () => {
    const raw = buildDoctorSnapshot({
      issues: [
        {
          level: "warn",
          item: "hook script",
          detail: 'node "/Users/tester/.kimi-boost/hooks/core/x.mjs" from /Users/tester/.kimi-code/config.toml',
        },
      ],
      platform: "darwin",
      tools: { kimi: { installed: true, version: "0.38.0", home: "/Users/tester/.kimi-code" } },
      pluginIds: [],
      hookEvents: [],
      byEvent: {},
    });
    const redacted = redactSnapshot(raw, ["/Users/tester"]);
    const text = JSON.stringify(redacted);
    expect(text).not.toContain("/Users/tester");
    expect(redacted.redaction.applied).toBe(true);
    expect(redacted.redaction.replacements).toBeGreaterThan(0);
  });
});

describe("doctor --json", () => {
  it("does not create or modify any config file and prints a parseable snapshot", () => {
    const kimiHome = path.join(tmp, "kimi-code");
    fs.mkdirSync(kimiHome, { recursive: true });
    const configPath = path.join(kimiHome, "config.toml");
    fs.writeFileSync(configPath, 'default_model = "kimi-k3"\n', "utf8");
    const before = fs.readFileSync(configPath, "utf8");

    const cli = path.join(import.meta.dirname, "..", "src", "cli.ts");
    let stdout: string;
    try {
      stdout = execFileSync(
        process.execPath,
        [path.join(import.meta.dirname, "..", "node_modules", "tsx", "dist", "cli.mjs"), cli, "doctor", "--json"],
        {
          encoding: "utf8",
          env: {
            ...process.env,
            HOME: tmp,
            KIMI_CODE_HOME: kimiHome,
            KIMI_BOOST_HOME: path.join(tmp, "kboost"),
            CLAUDE_CODE_HOME: path.join(tmp, "claude"),
            CODEX_HOME: path.join(tmp, "codex"),
          },
        },
      );
    } catch (err) {
      stdout = (err as { stdout?: string }).stdout ?? "";
    }
    const parsed = JSON.parse(stdout) as { platform: string; redaction: { applied: boolean } };
    expect(parsed.platform).toBeTruthy();
    expect(parsed.redaction.applied).toBe(true);
    expect(fs.readFileSync(configPath, "utf8")).toBe(before);
  });
});