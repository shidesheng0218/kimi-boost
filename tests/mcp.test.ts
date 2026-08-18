import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { existsSync, mkdtempSync, rmSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

let tmp: string;

beforeAll(() => {
  tmp = mkdtempSync(join(tmpdir(), "kimi-boost-mcp-"));
  process.env.KIMI_CODE_HOME = join(tmp, ".kimi-code");
  process.env.KIMI_BOOST_HOME = join(tmp, "kboost");
});

afterAll(() => {
  delete process.env.KIMI_CODE_HOME;
  delete process.env.KIMI_BOOST_HOME;
  rmSync(tmp, { recursive: true, force: true });
});

describe("mcp.json merge", () => {
  it("upserts servers and preserves user entries", async () => {
    const { readMcpFile, upsertMcpServers, saveMcpFile } = await import("../src/core/kimiMcp.js");
    const data = readMcpFile();
    data.mcpServers["user-custom"] = { url: "https://example.com/mcp" };

    const up = upsertMcpServers(data, {
      fetch: { command: "uvx", args: ["mcp-server-fetch"] },
      time: { command: "uvx", args: ["mcp-server-time"] },
    });
    expect(up.added).toEqual(["fetch", "time"]);
    expect(upsertMcpServers(data, { fetch: { command: "uvx" } }).changed).toBe(false);

    saveMcpFile(data);
    const reread = readMcpFile();
    expect(reread.mcpServers["user-custom"]).toEqual({ url: "https://example.com/mcp" });
    expect(reread.mcpServers.fetch).toBeTruthy();
  });

  it("removes only the requested servers", async () => {
    const { readMcpFile, removeMcpServers } = await import("../src/core/kimiMcp.js");
    const data = readMcpFile();
    const rm = removeMcpServers(data, ["fetch"]);
    expect(rm.removed).toEqual(["fetch"]);
    expect(data.mcpServers.time).toBeTruthy();
    expect(data.mcpServers["user-custom"]).toBeTruthy();
  });
});
