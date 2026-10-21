import { describe, expect, it } from "vitest";
import { runDemo } from "../src/commands/demo.js";

describe("demo command", () => {
  it("executes sandboxed replay and confirms block and allow behaviors", () => {
    const res = runDemo({ json: true });
    expect(res.isolated).toBe(true);
    expect(res.blocked.command).toBe("git push origin HEAD:main");
    expect(res.blocked.exitCode).toBe(2);
    expect(res.blocked.output).toContain("Blocked: direct push to main");

    expect(res.allowed.command).toBe("git status");
    expect(res.allowed.exitCode).toBe(0);
  });
});
