import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const PRESETS = join(dirname(fileURLToPath(import.meta.url)), "..", "presets");
const SECRET_SCAN = join(PRESETS, "security", "hooks", "secret-scan.mjs");
const FORCE_PUSH = join(PRESETS, "security", "hooks", "block-force-push.mjs");

function runHook(script: string, payload: unknown): { status: number | null; stderr: string } {
  const res = spawnSync(process.execPath, [script], { input: JSON.stringify(payload), encoding: "utf8" });
  return { status: res.status, stderr: res.stderr ?? "" };
}

function runRaw(script: string, stdin: string): number | null {
  return spawnSync(process.execPath, [script], { input: stdin, encoding: "utf8" }).status;
}

// 说明:示例密钥一律用拼接构造,不让字面量密钥出现在文件里——否则会触发 GitHub
// push protection(密钥扫描)导致推送被拒。运行时拼接结果仍能被 hook 的正则命中。
const AWS_KEY = ["AKIA", "IOSFODNN7EXAMPLE"].join("");
const PRIVATE_KEY = ["-----BEGIN ", "RSA PRIVATE KEY", "-----"].join("");
const GH_TOKEN = ["ghp_", "abcdefghijklmnopqrstuvwxyz123456"].join("");
const STRIPE_KEY = ["sk", "_live_", "4eC39HqLyjWDarjtT1zdp7dc"].join("");

describe("security/secret-scan.mjs", () => {
  it("blocks Write content containing an AWS key", () => {
    const r = runHook(SECRET_SCAN, { tool_input: { content: `const key = "${AWS_KEY}";` } });
    expect(r.status).toBe(2);
    expect(r.stderr).toContain("hardcoded secret");
  });

  it("blocks a private key block", () => {
    expect(runHook(SECRET_SCAN, { tool_input: { content: PRIVATE_KEY } }).status).toBe(2);
  });

  it("blocks a GitHub token in an Edit payload (new_string)", () => {
    const r = runHook(SECRET_SCAN, { tool_input: { new_string: `token = "${GH_TOKEN}"` } });
    expect(r.status).toBe(2);
  });

  it("blocks a generic hardcoded credential assignment", () => {
    const r = runHook(SECRET_SCAN, { tool_input: { content: `const api_key = "${STRIPE_KEY}";` } });
    expect(r.status).toBe(2);
  });

  it("allows clean content", () => {
    expect(runHook(SECRET_SCAN, { tool_input: { content: 'const greeting = "hello world";' } }).status).toBe(0);
  });

  it("allows payloads with no content field", () => {
    expect(runHook(SECRET_SCAN, { tool_input: {} }).status).toBe(0);
  });

  it("fails open on malformed stdin", () => {
    expect(runRaw(SECRET_SCAN, "not json{")).toBe(0);
  });
});

describe("security/block-force-push.mjs", () => {
  it("blocks git push --force", () => {
    expect(runHook(FORCE_PUSH, { tool_input: { command: "git push --force origin main" } }).status).toBe(2);
  });

  it("blocks git push -f", () => {
    expect(runHook(FORCE_PUSH, { tool_input: { command: "git push -f" } }).status).toBe(2);
  });

  it("blocks git push --delete", () => {
    expect(runHook(FORCE_PUSH, { tool_input: { command: "git push origin --delete feature" } }).status).toBe(2);
  });

  it("allows --force-with-lease (the safer force push)", () => {
    expect(runHook(FORCE_PUSH, { tool_input: { command: "git push --force-with-lease origin main" } }).status).toBe(0);
  });

  it("allows a normal push", () => {
    expect(runHook(FORCE_PUSH, { tool_input: { command: "git push origin feature" } }).status).toBe(0);
  });

  it("ignores non-push commands", () => {
    expect(runHook(FORCE_PUSH, { tool_input: { command: "git status" } }).status).toBe(0);
  });

  it("fails open on malformed stdin", () => {
    expect(runRaw(FORCE_PUSH, "not json{")).toBe(0);
  });
});
