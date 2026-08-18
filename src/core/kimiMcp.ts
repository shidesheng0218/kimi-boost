import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { kimiHomeDir } from "./detect.js";
import { writeFileIfWritable, ensureDir } from "./fsguard.js";

/**
 * ~/.kimi-code/mcp.json 的文本级合并。
 * MCP server 声明写在 mcp.json(官方文档:不在 config.toml 中)。
 * JSON 无注释,合并 = parse → merge mcpServers → stringify(保留用户其余键)。
 */

export interface McpFile {
  mcpServers: Record<string, unknown>;
  [k: string]: unknown;
}

export function mcpFilePath(): string {
  return join(kimiHomeDir(), "mcp.json");
}

export function readMcpFile(): McpFile {
  const path = mcpFilePath();
  if (!existsSync(path)) return { mcpServers: {} };
  try {
    const data = JSON.parse(readFileSync(path, "utf8")) as Partial<McpFile>;
    return { mcpServers: data.mcpServers ?? {}, ...data };
  } catch {
    return { mcpServers: {} };
  }
}

/** 合并 MCP servers,返回是否变更。已存在的 server 以用户侧为准(不覆盖)。 */
export function upsertMcpServers(data: McpFile, servers: Record<string, unknown>): { changed: boolean; added: string[] } {
  const added: string[] = [];
  for (const [name, cfg] of Object.entries(servers)) {
    if (!(name in data.mcpServers)) {
      data.mcpServers[name] = cfg;
      added.push(name);
    }
  }
  return { changed: added.length > 0, added };
}

export function removeMcpServers(data: McpFile, names: string[]): { changed: boolean; removed: string[] } {
  const removed: string[] = [];
  for (const n of names) {
    if (n in data.mcpServers) {
      delete data.mcpServers[n];
      removed.push(n);
    }
  }
  return { changed: removed.length > 0, removed };
}

export function saveMcpFile(data: McpFile): void {
  const path = mcpFilePath();
  ensureDir(join(kimiHomeDir()));
  writeFileIfWritable(path, JSON.stringify(data, null, 2) + "\n");
}
