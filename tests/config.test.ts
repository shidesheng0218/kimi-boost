import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

let tmp: string;

beforeAll(() => {
  tmp = mkdtempSync(join(tmpdir(), "kimi-boost-test-"));
  process.env.KIMI_CODE_HOME = tmp;
  process.env.KIMI_BOOST_HOME = join(tmp, "kboost");
});

afterAll(() => {
  delete process.env.KIMI_CODE_HOME;
  delete process.env.KIMI_BOOST_HOME;
  rmSync(tmp, { recursive: true, force: true });
});

describe("kimi config", () => {
  it("reads an existing config.toml and returns empty for a missing one", async () => {
    const { readKimiConfig } = await import("../src/core/config.js");

    const empty = readKimiConfig();
    expect(empty.data).toEqual({});

    writeFileSync(join(tmp, "config.toml"), 'default_model = "kimi-code/k3"\n', "utf8");
    const config = readKimiConfig();
    expect(config.data.default_model).toBe("kimi-code/k3");
    expect(existsSync(config.path)).toBe(true);
  });

  it("backs up an existing config before mutation", async () => {
    const { readKimiConfig, backupFile } = await import("../src/core/config.js");
    const config = readKimiConfig();
    const bak = backupFile(config.path);
    expect(bak).toBeTruthy();
    expect(existsSync(bak!)).toBe(true);
  });
});
