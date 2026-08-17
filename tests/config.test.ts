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
  it("mounts boost dirs into config.toml", async () => {
    const { kimiHomeDir } = await import("../src/core/detect.js");
    const { readKimiConfig, mountBoostDirs, saveKimiConfig, skillsDir, agentsDir } = await import("../src/core/config.js");

    writeFileSync(join(kimiHomeDir(), "config.toml"), "default_model = \"kimi-code/k3\"\n", "utf8");

    const config = readKimiConfig();
    expect(mountBoostDirs(config)).toBe(true);
    expect(config.data.extra_skill_dirs).toContain(skillsDir());
    expect(config.data.extra_agent_dirs).toContain(agentsDir());
    saveKimiConfig(config);

    const reread = readKimiConfig();
    expect(reread.data.default_model).toBe("kimi-code/k3");
    expect(reread.data.extra_skill_dirs).toContain(skillsDir());
    expect(mountBoostDirs(reread)).toBe(false);
  });

  it("upserts hooks without duplicating", async () => {
    const { readKimiConfig, upsertKimiHooks, listKimiHooks, saveKimiConfig } = await import("../src/core/config.js");

    const config = readKimiConfig();
    const hook = { event: "PreToolUse", matcher: "Bash", command: "node /tmp/h.mjs", timeout: 5 };
    expect(upsertKimiHooks(config, [hook])).toBe(true);
    expect(upsertKimiHooks(config, [hook])).toBe(false);
    expect(listKimiHooks(config)).toHaveLength(1);
    saveKimiConfig(config);

    const reread = readKimiConfig();
    expect(listKimiHooks(reread)).toHaveLength(1);
    expect(reread.data.hooks).toMatchObject([hook]);
  });

  it("backs up existing config before mutation", async () => {
    const { readKimiConfig, backupFile } = await import("../src/core/config.js");
    const config = readKimiConfig();
    const bak = backupFile(config.path);
    expect(bak).toBeTruthy();
    expect(existsSync(bak!)).toBe(true);
  });
});
