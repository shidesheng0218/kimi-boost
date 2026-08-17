import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import type { DetectResult, Platform, ToolEnv, ToolName } from "./types.js";

export function detectPlatform(): Platform {
  if (process.platform === "darwin") return "darwin";
  if (process.platform === "win32") return "win32";
  if (process.platform === "linux") return "linux";
  return "unknown";
}

function findBin(names: string[]): string | undefined {
  for (const n of names) {
    try {
      execFileSync(n, ["--version"], { stdio: "ignore", shell: process.platform === "win32" });
      return n;
    } catch {
      /* not found */
    }
  }
  return undefined;
}

function readVersion(bin: string): string | undefined {
  try {
    return execFileSync(bin, ["--version"], { encoding: "utf8", shell: process.platform === "win32" }).trim().split("\n")[0];
  } catch {
    return undefined;
  }
}

const KIMI_DIRS = [process.env.KIMI_CODE_HOME, join(homedir(), ".kimi-code"), join(homedir(), ".kimi")].filter(Boolean) as string[];

export function kimiHomeDir(): string {
  return KIMI_DIRS.find((d) => existsSync(d)) ?? KIMI_DIRS[0];
}

/**
 * 除了 PATH 之外,再检查工具的常见安装位置(安装脚本往往只改 shell 配置,
 * 当前 shell 可能尚未生效)。
 */
function findBinInCommonPaths(name: string, homeDir: string): string | undefined {
  const candidates: string[] = [];
  if (process.platform === "win32") {
    candidates.push(join(homeDir, "bin", `${name}.exe`));
  } else {
    candidates.push(join(homeDir, "bin", name));
  }
  for (const c of candidates) {
    if (existsSync(c)) {
      try {
        execFileSync(c, ["--version"], { stdio: "ignore" });
        return c;
      } catch {
        /* exists but not executable */
      }
    }
  }
  return undefined;
}

function toolEnv(tool: ToolName): ToolEnv {
  if (tool === "kimi") {
    const bin = findBin(["kimi", "kimi-code"]) ?? findBinInCommonPaths("kimi", kimiHomeDir());
    return {
      tool,
      installed: Boolean(bin),
      version: bin ? readVersion(bin) : undefined,
      homeDir: kimiHomeDir(),
      configured: existsSync(join(kimiHomeDir(), "config.toml")),
    };
  }
  if (tool === "claude") {
    const bin = findBin(["claude"]);
    const dir = join(homedir(), ".claude");
    return {
      tool,
      installed: Boolean(bin),
      version: bin ? readVersion(bin) : undefined,
      homeDir: dir,
      configured: existsSync(join(dir, "settings.json")),
    };
  }
  const bin = findBin(["codex"]);
  const dir = join(homedir(), ".codex");
  return {
    tool,
    installed: Boolean(bin),
    version: bin ? readVersion(bin) : undefined,
    homeDir: dir,
    configured: existsSync(join(dir, "config.toml")),
  };
}

export function detect(): DetectResult {
  return {
    platform: detectPlatform(),
    tools: {
      kimi: toolEnv("kimi"),
      claude: toolEnv("claude"),
      codex: toolEnv("codex"),
    },
  };
}
