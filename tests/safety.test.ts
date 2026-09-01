import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { closeSync, mkdtempSync, openSync, rmSync, utimesSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { assertManagedPath, managedRoots, warnIfActiveUse } from "../src/core/safety.js";

let tmp: string;

beforeAll(() => {
  tmp = mkdtempSync(join(tmpdir(), "kimi-boost-safety-"));
  process.env.KIMI_BOOST_HOME = join(tmp, "kboost");
  process.env.KIMI_CODE_HOME = join(tmp, "kimi-code");
  process.env.CLAUDE_CODE_HOME = join(tmp, "claude");
  process.env.CODEX_HOME = join(tmp, "codex");
});

afterAll(() => {
  delete process.env.KIMI_BOOST_HOME;
  delete process.env.KIMI_CODE_HOME;
  delete process.env.CLAUDE_CODE_HOME;
  delete process.env.CODEX_HOME;
  rmSync(tmp, { recursive: true, force: true });
});

describe("managedRoots", () => {
  it("returns the four managed home dirs from env overrides", () => {
    const roots = managedRoots();
    expect(roots).toEqual([
      join(tmp, "kboost"),
      join(tmp, "kimi-code"),
      join(tmp, "claude"),
      join(tmp, "codex"),
    ]);
  });
});

describe("assertManagedPath", () => {
  it("allows a path inside a managed root", () => {
    expect(() => assertManagedPath(join(tmp, "kboost", "presets", "vue3"))).not.toThrow();
  });

  it("rejects a path outside all managed roots", () => {
    expect(() => assertManagedPath("/etc/passwd")).toThrow(/Refusing to modify/);
  });

  it("rejects a path that escapes a managed root via ..", () => {
    expect(() => assertManagedPath(join(tmp, "kboost", "..", "..", "evil"))).toThrow(/Refusing to modify/);
  });
});

describe("warnIfActiveUse", () => {
  it("warns when the home dir was modified within the last minute", () => {
    const file = join(tmp, "recent-home");
    closeSync(openSync(file, "w"));
    const now = new Date();
    utimesSync(file, now, now);
    const spy = vi.spyOn(console, "warn").mockImplementation(() => {});
    warnIfActiveUse(file, "kimi");
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });

  it("does not warn when the home dir is old", () => {
    const file = join(tmp, "old-home");
    closeSync(openSync(file, "w"));
    const old = new Date(Date.now() - 10 * 60_000);
    utimesSync(file, old, old);
    const spy = vi.spyOn(console, "warn").mockImplementation(() => {});
    warnIfActiveUse(file, "kimi");
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  it("does nothing when the home dir does not exist", () => {
    const spy = vi.spyOn(console, "warn").mockImplementation(() => {});
    warnIfActiveUse(join(tmp, "does-not-exist"), "kimi");
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });
});
