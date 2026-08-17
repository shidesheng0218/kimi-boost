import { describe, expect, it } from "vitest";
import { upsertDirArray, removeDirEntry, upsertManagedHooks, removePresetHooks } from "../src/core/kimiTextEdit.js";

const DIR = "/home/user/.kimi-boost/skills";

describe("upsertDirArray", () => {
  it("appends a new key when absent, preserving comments", () => {
    const text = "# my config\n# important comment\ndefault_model = \"k3\"\n";
    const r = upsertDirArray(text, "extra_skill_dirs", DIR);
    expect(r.changed).toBe(true);
    expect(r.text).toContain("# my config");
    expect(r.text).toContain("# important comment");
    expect(r.text).toContain('extra_skill_dirs = [ "/home/user/.kimi-boost/skills" ]');
    expect(r.text).toContain('default_model = "k3"');
  });

  it("merges into an existing inline array, preserving the rest of the line", () => {
    const text = '# keep me\nextra_skill_dirs = [ "/other/dir" ] # trailing note\ndefault_model = "k3"\n';
    const r = upsertDirArray(text, "extra_skill_dirs", DIR);
    expect(r.changed).toBe(true);
    expect(r.text).toContain('# keep me');
    expect(r.text).toContain('extra_skill_dirs = [ "/other/dir", "/home/user/.kimi-boost/skills" ]');
    expect(r.text).toContain('default_model = "k3"');
  });

  it("handles multi-line arrays", () => {
    const text = 'extra_skill_dirs = [\n  "/other/dir",\n]\n';
    const r = upsertDirArray(text, "extra_skill_dirs", DIR);
    expect(r.text).toContain('"/other/dir"');
    expect(r.text).toContain(DIR);
    expect(r.text).not.toContain("[\n");
  });

  it("is idempotent", () => {
    const text = 'extra_skill_dirs = [ "/home/user/.kimi-boost/skills" ]\n';
    const r = upsertDirArray(text, "extra_skill_dirs", DIR);
    expect(r.changed).toBe(false);
  });
});

describe("removeDirEntry", () => {
  it("removes a single entry and keeps others", () => {
    const text = '# c\nextra_skill_dirs = [ "/home/user/.kimi-boost/skills", "/keep" ]\n';
    const r = removeDirEntry(text, "extra_skill_dirs", DIR);
    expect(r.changed).toBe(true);
    expect(r.text).toContain('"/keep"');
    expect(r.text).not.toContain("/home/user/.kimi-boost");
  });
});

describe("upsertManagedHooks", () => {
  const hook = { event: "PreToolUse", matcher: "Bash", command: 'node "/home/user/.kimi-boost/hooks/vue3/protect-main.mjs"', timeout: 5 };

  it("appends a managed block at the end", () => {
    const text = '# user stuff\ndefault_model = "k3"\n';
    const r = upsertManagedHooks(text, [hook]);
    expect(r.added).toBe(1);
    expect(r.text).toContain("# >>> kimi-boost managed >>>");
    expect(r.text).toContain("# <<< kimi-boost managed <<<");
    expect(r.text).toContain('[[hooks]]');
    expect(r.text).toContain('matcher = "Bash"');
    expect(r.text).toContain('timeout = 5');
    // 用户内容原样保留
    expect(r.text).toContain('# user stuff');
    expect(r.text).toContain('default_model = "k3"');
  });

  it("is idempotent: same command is skipped", () => {
    const text = '# c\ndefault_model = "k3"\n';
    const once = upsertManagedHooks(text, [hook]).text;
    const twice = upsertManagedHooks(once, [hook]);
    expect(twice.added).toBe(0);
    expect(twice.skipped).toBe(1);
    expect(once.match(/\[\[hooks\]\]/g)).toHaveLength(1);
  });

  it("updates an existing managed block without duplicating the marker", () => {
    const text = '# c\ndefault_model = "k3"\n';
    const once = upsertManagedHooks(text, [hook]).text;
    const other = { event: "Stop", command: 'node "/h/vue3/other.mjs"' };
    const twice = upsertManagedHooks(once, [other]);
    expect(twice.text.match(/# >>> kimi-boost managed >>>/g)).toHaveLength(1);
    expect(twice.text.match(/\[\[hooks\]\]/g)).toHaveLength(2);
  });
});

describe("removePresetHooks", () => {
  it("removes hooks for a preset and drops an emptied managed block", () => {
    const text = '# c\n';
    const once = upsertManagedHooks(text, [{ event: "PreToolUse", command: 'node "/home/user/.kimi-boost/hooks/vue3/protect-main.mjs"' }]);
    const r = removePresetHooks(once.text, "vue3");
    expect(r.removed).toBe(1);
    expect(r.text).not.toContain("kimi-boost managed");
    expect(r.text).not.toContain("[[hooks]]");
    expect(r.text).toContain('# c');
  });

  it("keeps hooks belonging to other presets", () => {
    const text = '# c\n';
    const a = upsertManagedHooks(text, [
      { event: "PreToolUse", command: 'node "/home/user/.kimi-boost/hooks/vue3/protect-main.mjs"' },
      { event: "PreToolUse", command: 'node "/home/user/.kimi-boost/hooks/python/block.mjs"' },
    ]).text;
    const r = removePresetHooks(a, "vue3");
    expect(r.removed).toBe(1);
    expect(r.text).toContain("python/block.mjs");
    expect(r.text).not.toContain("vue3");
    expect(r.text).toContain("# >>> kimi-boost managed >>>");
  });
});
