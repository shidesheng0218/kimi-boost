import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { tomlStr } from "../src/core/kimiTextEdit.js";

/**
 * hook 内容去重端到端验证:
 * 同内容脚本的两个预设安装 → config 只有一条条目(refs 共享);
 * 卸载其一 → 条目重定向到另一预设的脚本副本;全部卸载 → 条目消失。
 */
let tmp: string;
let kimiHome: string;
let claudeHome: string;
let codexHome: string;
let boostHome: string;

const GUARD_V1 = 'process.stdin.on("end", () => process.exit(0));\n';
const GUARD_V2 = 'process.stdin.on("end", () => process.exit(0)); // v2\n';

/** config.toml 文本中的路径是 TOML 转义形态(Windows 反斜杠),断言前先转义 */
const tomlPath = (p: string): string => tomlStr(p);

interface Fixture {
  id: string;
  name: string;
  description: string;
  tags: string[];
  version: string;
  hooks: Array<{ event: string; matcher: string; script: string; timeout: number }>;
}

function makeSource(id: string, content: string): { preset: Fixture; sourceDir: string } {
  const sourceDir = join(tmp, "src", id);
  mkdirSync(join(sourceDir, "hooks"), { recursive: true });
  writeFileSync(join(sourceDir, "hooks", "guard.mjs"), content, "utf8");
  return {
    preset: {
      id,
      name: id,
      description: `test preset ${id}`,
      tags: [],
      version: "1.0.0",
      hooks: [{ event: "PreToolUse", matcher: "Bash", script: "guard.mjs", timeout: 5 }],
    },
    sourceDir,
  };
}

/** 模拟 install.ts syncHooks:把脚本副本放进 <boostHome>/hooks/<id> */
function syncHooks(id: string, sourceDir: string): void {
  const dest = join(boostHome, "hooks", id);
  mkdirSync(dest, { recursive: true });
  writeFileSync(join(dest, "guard.mjs"), readFileSync(join(sourceDir, "hooks", "guard.mjs")));
}

function kimiConfig(): string {
  return readFileSync(join(kimiHome, "config.toml"), "utf8");
}

function claudeCommands(): string[] {
  const settings = JSON.parse(readFileSync(join(claudeHome, "settings.json"), "utf8")) as {
    hooks?: Record<string, Array<{ hooks: Array<{ command: string }> }>>;
  };
  return Object.values(settings.hooks ?? {})
    .flatMap((groups) => groups.map((g) => g.hooks.map((h) => h.command)))
    .flat();
}

beforeAll(() => {
  tmp = mkdtempSync(join(tmpdir(), "kimi-boost-dedup-"));
  kimiHome = join(tmp, ".kimi-code");
  claudeHome = join(tmp, ".claude");
  codexHome = join(tmp, ".codex");
  boostHome = join(tmp, "kboost");
  for (const d of [kimiHome, claudeHome, codexHome]) mkdirSync(d, { recursive: true });
  process.env.KIMI_CODE_HOME = kimiHome;
  process.env.CLAUDE_CODE_HOME = claudeHome;
  process.env.CODEX_HOME = codexHome;
  process.env.KIMI_BOOST_HOME = boostHome;
});

afterAll(() => {
  delete process.env.KIMI_CODE_HOME;
  delete process.env.CLAUDE_CODE_HOME;
  delete process.env.CODEX_HOME;
  delete process.env.KIMI_BOOST_HOME;
  rmSync(tmp, { recursive: true, force: true });
});

describe("hook dedup: kimi adapter", () => {
  it("second preset with identical hook content shares the single config entry", async () => {
    const { kimiAdapter } = await import("../src/adapters/kimi.js");
    const { readHookRegistry } = await import("../src/core/manifest.js");
    const a = makeSource("aa", GUARD_V1);
    const b = makeSource("bb", GUARD_V1);
    syncHooks("aa", a.sourceDir);
    syncHooks("bb", b.sourceDir);

    await kimiAdapter.activate({ tool: "kimi", preset: a.preset as never, sourceDir: a.sourceDir, installDir: tmp });
    expect(kimiConfig().match(/\[\[hooks\]\]/g)).toHaveLength(1);

    const report = await kimiAdapter.activate({ tool: "kimi", preset: b.preset as never, sourceDir: b.sourceDir, installDir: tmp });
    expect(report.message).toContain("shared");
    expect(kimiConfig().match(/\[\[hooks\]\]/g)).toHaveLength(1);
    expect(kimiConfig()).toContain(tomlPath(join(boostHome, "hooks", "aa", "guard.mjs")));

    const reg = readHookRegistry();
    const entries = Object.values(reg);
    expect(entries).toHaveLength(1);
    expect(entries[0].refs.sort()).toEqual(["aa", "bb"]);
  });

  it("deactivating the owner retargets the entry to the remaining ref", async () => {
    const { kimiAdapter } = await import("../src/adapters/kimi.js");
    const { readHookRegistry } = await import("../src/core/manifest.js");

    await kimiAdapter.deactivate("aa");
    const cfg = kimiConfig();
    expect(cfg.match(/\[\[hooks\]\]/g)).toHaveLength(1);
    expect(cfg).toContain(tomlPath(join(boostHome, "hooks", "bb", "guard.mjs")));
    expect(cfg).not.toContain(tomlPath(join(boostHome, "hooks", "aa", "guard.mjs")));
    expect(readHookRegistry()[Object.keys(readHookRegistry())[0]].refs).toEqual(["bb"]);
  });

  it("deactivating the last ref removes the entry and the managed block", async () => {
    const { kimiAdapter } = await import("../src/adapters/kimi.js");
    const { readHookRegistry } = await import("../src/core/manifest.js");

    await kimiAdapter.deactivate("bb");
    expect(kimiConfig()).not.toContain("[[hooks]]");
    expect(kimiConfig()).not.toContain("kimi-boost managed");
    expect(Object.keys(readHookRegistry())).toHaveLength(0);
  });

  it("content change on update creates a new entry and cleans the stale one", async () => {
    const { kimiAdapter } = await import("../src/adapters/kimi.js");
    const { readHookRegistry } = await import("../src/core/manifest.js");
    const a = makeSource("aa", GUARD_V1);
    const b = makeSource("bb", GUARD_V1);
    syncHooks("aa", a.sourceDir);
    syncHooks("bb", b.sourceDir);
    await kimiAdapter.activate({ tool: "kimi", preset: a.preset as never, sourceDir: a.sourceDir, installDir: tmp });
    await kimiAdapter.activate({ tool: "kimi", preset: b.preset as never, sourceDir: b.sourceDir, installDir: tmp });

    // aa 升级:脚本内容变化 → 旧共享条目转给 bb,aa 的新内容成为独立条目
    const a2 = makeSource("aa", GUARD_V2);
    syncHooks("aa", a2.sourceDir);
    await kimiAdapter.activate({ tool: "kimi", preset: a2.preset as never, sourceDir: a2.sourceDir, installDir: tmp });

    expect(kimiConfig().match(/\[\[hooks\]\]/g)).toHaveLength(2);
    const reg = readHookRegistry();
    expect(Object.keys(reg)).toHaveLength(2);
    const shared = Object.values(reg).find((e) => e.refs.includes("bb"))!;
    expect(shared.refs).toEqual(["bb"]);
    expect(shared.command).toContain(join("hooks", "bb", "guard.mjs"));

    // aa 卸载:只删自己的新条目,bb 的共享条目不受影响
    await kimiAdapter.deactivate("aa");
    expect(kimiConfig().match(/\[\[hooks\]\]/g)).toHaveLength(1);
    expect(kimiConfig()).toContain(tomlPath(join(boostHome, "hooks", "bb", "guard.mjs")));
  });
});

describe("hook dedup: claude adapter", () => {
  it("shares one settings.json entry across presets and retargets on uninstall", async () => {
    // 独立 boostHome,避免与本文件其他 describe 的注册表互相干扰
    boostHome = join(tmp, "kboost-claude");
    process.env.KIMI_BOOST_HOME = boostHome;
    const { claudeAdapter } = await import("../src/adapters/claude.js");
    const a = makeSource("ca", GUARD_V1);
    const b = makeSource("cb", GUARD_V1);
    syncHooks("ca", a.sourceDir);
    syncHooks("cb", b.sourceDir);

    await claudeAdapter.activate({ tool: "claude", preset: a.preset as never, sourceDir: a.sourceDir, installDir: tmp });
    await claudeAdapter.activate({ tool: "claude", preset: b.preset as never, sourceDir: b.sourceDir, installDir: tmp });
    let cmds = claudeCommands();
    expect(cmds).toHaveLength(1);
    expect(cmds[0]).toContain(join("hooks", "ca", "guard.mjs"));

    await claudeAdapter.deactivate("ca");
    cmds = claudeCommands();
    expect(cmds).toHaveLength(1);
    expect(cmds[0]).toContain(join("hooks", "cb", "guard.mjs"));

    await claudeAdapter.deactivate("cb");
    expect(claudeCommands()).toHaveLength(0);
  });
});

describe("hook dedup: codex adapter", () => {
  it("shares one config entry across presets and retargets on uninstall", async () => {
    boostHome = join(tmp, "kboost-codex");
    process.env.KIMI_BOOST_HOME = boostHome;
    const { codexAdapter } = await import("../src/adapters/codex.js");
    const a = makeSource("xa", GUARD_V1);
    const b = makeSource("xb", GUARD_V1);
    syncHooks("xa", a.sourceDir);
    syncHooks("xb", b.sourceDir);

    await codexAdapter.activate({ tool: "codex", preset: a.preset as never, sourceDir: a.sourceDir, installDir: tmp });
    await codexAdapter.activate({ tool: "codex", preset: b.preset as never, sourceDir: b.sourceDir, installDir: tmp });

    const parseConfig = async () => {
      const { parse } = await import("smol-toml");
      return parse(readFileSync(join(codexHome, "config.toml"), "utf8")) as {
        hooks?: Record<string, Array<{ hooks: Array<{ command: string }> }>>;
      };
    };
    let data = await parseConfig();
    let cmds = Object.values(data.hooks ?? {}).flatMap((groups) => groups.flatMap((g) => g.hooks.map((h) => h.command)));
    expect(cmds).toHaveLength(1);
    expect(cmds[0]).toContain(join("hooks", "xa", "guard.mjs"));

    await codexAdapter.deactivate("xa");
    data = await parseConfig();
    cmds = Object.values(data.hooks ?? {}).flatMap((groups) => groups.flatMap((g) => g.hooks.map((h) => h.command)));
    expect(cmds).toHaveLength(1);
    expect(cmds[0]).toContain(join("hooks", "xb", "guard.mjs"));
  });
});
