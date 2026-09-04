import { describe, expect, it } from "vitest";
import { badgeMarkdown } from "../src/commands/badge.js";

describe("badgeMarkdown", () => {
  it("renders the default powered-by badge linking to the repo", () => {
    const md = badgeMarkdown();
    expect(md).toBe(
      "[![kimi-boost](https://img.shields.io/badge/kimi--boost-powered-7c3aed)](https://github.com/shidesheng0218/kimi-boost)",
    );
  });

  it("renders a preset-specific badge with shields.io escaping", async () => {
    const md = badgeMarkdown("go");
    expect(md).toContain("kimi--boost-preset%3A_go");
    expect(md).toContain("](https://github.com/shidesheng0218/kimi-boost)");
    // 再确认 escapeShield 对连字符的处理
    const { badgeMarkdown: bm } = await import("../src/commands/badge.js");
    expect(bm("react-native")).toContain("preset%3A_react--native");
  });
});
