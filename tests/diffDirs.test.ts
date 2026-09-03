import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { diffDirs } from "../src/core/diffDirs.js";

let dir: string;

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

/** 建两个临时目录 current/next,各写入给定文件 */
function setup(current: Record<string, string>, next: Record<string, string>): { cur: string; nxt: string } {
  dir = mkdtempSync(join(tmpdir(), "kboost-diff-"));
  const cur = join(dir, "current");
  const nxt = join(dir, "next");
  for (const [root, files] of [[cur, current], [nxt, next]] as const) {
    for (const [rel, content] of Object.entries(files)) {
      const fp = join(root, rel);
      mkdirSync(dirname(fp), { recursive: true });
      writeFileSync(fp, content, "utf8");
    }
  }
  return { cur, nxt };
}

describe("diffDirs", () => {
  it("detects added, modified and removed files", () => {
    const { cur, nxt } = setup(
      { "a.txt": "same", "b.txt": "old", "c.txt": "gone" },
      { "a.txt": "same", "b.txt": "new", "d.txt": "born" },
    );
    expect(diffDirs(cur, nxt)).toEqual({ added: ["d.txt"], modified: ["b.txt"], removed: ["c.txt"] });
  });

  it("returns empty diff for identical trees", () => {
    const { cur, nxt } = setup({ "x/a.txt": "1", "y/b.txt": "2" }, { "x/a.txt": "1", "y/b.txt": "2" });
    expect(diffDirs(cur, nxt)).toEqual({ added: [], modified: [], removed: [] });
  });

  it("handles nested paths", () => {
    const { cur, nxt } = setup({ "skills/x/SKILL.md": "v1" }, { "skills/x/SKILL.md": "v2", "hooks/h.mjs": "x" });
    const d = diffDirs(cur, nxt);
    expect(d.added).toEqual(["hooks/h.mjs"]);
    expect(d.modified).toEqual(["skills/x/SKILL.md"]);
    expect(d.removed).toEqual([]);
  });

  it("treats a missing current dir as all-added", () => {
    const { nxt } = setup({}, { "a.txt": "1" });
    const missing = join(dir, "does-not-exist");
    expect(diffDirs(missing, nxt)).toEqual({ added: ["a.txt"], modified: [], removed: [] });
  });

  it("treats a missing next dir as all-removed", () => {
    const { cur } = setup({ "a.txt": "1" }, {});
    const missing = join(dir, "does-not-exist");
    expect(diffDirs(cur, missing)).toEqual({ added: [], modified: [], removed: ["a.txt"] });
  });
});
