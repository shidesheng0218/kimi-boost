import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

const PROTECT_MAIN = join(dirname(fileURLToPath(import.meta.url)), "..", "presets", "core", "hooks", "protect-main.mjs");

let tmp: string;
let home: string;

beforeEach(() => {
  tmp = mkdtempSync(join(tmpdir(), "kboost-protectmain-"));
  home = mkdtempSync(join(tmpdir(), "kboost-home-"));
});

afterEach(() => {
  rmSync(tmp, { recursive: true, force: true });
  rmSync(home, { recursive: true, force: true });
});

function initRepo(branch = "main") {
  spawnSync("git", ["init", "-b", branch], { cwd: tmp, stdio: "ignore" });
  spawnSync("git", ["config", "user.email", "t@t"], { cwd: tmp, stdio: "ignore" });
  spawnSync("git", ["config", "user.name", "t"], { cwd: tmp, stdio: "ignore" });
  writeFileSync(join(tmp, "f"), "x");
  spawnSync("git", ["add", "."], { cwd: tmp, stdio: "ignore" });
  spawnSync("git", ["commit", "-m", "init"], { cwd: tmp, stdio: "ignore" });
}

function runHook(cmd: string, cwd = tmp): number | null {
  const res = spawnSync(process.execPath, [PROTECT_MAIN], {
    input: JSON.stringify({ tool_input: { command: cmd }, cwd }),
    env: { ...process.env, KIMI_BOOST_HOME: home },
    encoding: "utf8",
  });
  return res.status;
}

describe("protect-main: basic", () => {
  it("blocks git push on main", () => {
    initRepo("main");
    expect(runHook("git push")).toBe(2);
  });

  it("blocks git push on master", () => {
    initRepo("master");
    expect(runHook("git push")).toBe(2);
  });

  it("allows on feature branch", () => {
    initRepo("feat/x");
    expect(runHook("git push")).toBe(0);
  });

  it("allows outside a git repo", () => {
    expect(runHook("git push", tmpdir())).toBe(0);
  });
});

describe("protect-main: refspec targeting", () => {
  beforeEach(() => initRepo("feat/x"));

  it("blocks push HEAD:main", () => {
    expect(runHook("git push origin HEAD:main")).toBe(2);
  });

  it("blocks push feat:master", () => {
    expect(runHook("git push origin feat/x:master")).toBe(2);
  });

  it("blocks push refs/heads/main", () => {
    expect(runHook("git push origin refs/heads/main")).toBe(2);
  });

  it("blocks force push +main", () => {
    expect(runHook("git push origin +main")).toBe(2);
  });

  it("allows push feat:feat", () => {
    expect(runHook("git push origin feat/x:feat/x")).toBe(0);
  });

  it("allows push HEAD on feature branch", () => {
    expect(runHook("git push origin HEAD")).toBe(0);
  });
});

describe("protect-main: flags", () => {
  beforeEach(() => initRepo("feat/x"));

  it("blocks --mirror", () => {
    expect(runHook("git push --mirror origin")).toBe(2);
  });

  it("blocks --all when main exists", () => {
    spawnSync("git", ["branch", "main"], { cwd: tmp, stdio: "ignore" });
    expect(runHook("git push --all")).toBe(2);
  });

  it("allows --all when main does not exist", () => {
    expect(runHook("git push --all")).toBe(0);
  });

  it("blocks --force to main", () => {
    expect(runHook("git push --force origin main")).toBe(2);
  });
});

describe("protect-main: command wrapping", () => {
  beforeEach(() => initRepo("main"));

  it("blocks sudo git push", () => {
    expect(runHook("sudo git push")).toBe(2);
  });

  it("blocks VAR=1 git push", () => {
    expect(runHook("VAR=1 git push")).toBe(2);
  });

  it("blocks command git push", () => {
    expect(runHook("command git push")).toBe(2);
  });

  it("blocks sh -c 'git push'", () => {
    expect(runHook("sh -c 'git push'")).toBe(2);
  });

  it("blocks bash -c 'git push origin main'", () => {
    expect(runHook("bash -c 'git push origin main'")).toBe(2);
  });

  it("blocks eval 'git push'", () => {
    expect(runHook("eval 'git push'")).toBe(2);
  });
});

describe("protect-main: compound commands", () => {
  beforeEach(() => initRepo("main"));

  it("blocks git commit && git push", () => {
    expect(runHook("git commit -m x && git push")).toBe(2);
  });

  it("blocks git push || echo fail", () => {
    expect(runHook("git push || echo fail")).toBe(2);
  });

  it("blocks (git push)", () => {
    expect(runHook("(git push)")).toBe(2);
  });

  it("blocks git push; echo done", () => {
    expect(runHook("git push; echo done")).toBe(2);
  });
});

describe("protect-main: -C / --git-dir", () => {
  it("blocks git -C <repo> push when that repo is on main", () => {
    initRepo("main");
    const other = mkdtempSync(join(tmpdir(), "other-"));
    try {
      expect(runHook(`git -C "${tmp}" push`, other)).toBe(2);
    } finally {
      rmSync(other, { recursive: true, force: true });
    }
  });

  it("allows git -C <repo> push when that repo is on feat", () => {
    initRepo("feat/x");
    const other = mkdtempSync(join(tmpdir(), "other-"));
    try {
      expect(runHook(`git -C "${tmp}" push`, other)).toBe(0);
    } finally {
      rmSync(other, { recursive: true, force: true });
    }
  });
});

describe("protect-main: edge cases", () => {
  it("allows 'git push' substring in comments", () => {
    initRepo("feat/x");
    expect(runHook("echo 'not git push'")).toBe(0);
  });

  it("allows non-push git commands on main", () => {
    initRepo("main");
    expect(runHook("git status")).toBe(0);
  });

  it("allows git pull", () => {
    initRepo("main");
    expect(runHook("git pull")).toBe(0);
  });
});
