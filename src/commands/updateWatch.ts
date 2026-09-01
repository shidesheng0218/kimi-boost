import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { detectPlatform } from "../core/detect.js";
import { writeFileIfWritable, removeIfWritable } from "../core/fsguard.js";
import { runOutdated, type OutdatedRow, type OutdatedOptions } from "./outdated.js";

export interface WatchOptions {
  /** 检查间隔(小时),默认 6 */
  interval?: number;
}

const CRON_MARKER = "# kimi-boost-watch";
const LAUNCH_AGENT_LABEL = "com.kimi-boost.update";

export function launchAgentPath(): string {
  return join(homedir(), "Library", "LaunchAgents", `${LAUNCH_AGENT_LABEL}.plist`);
}

/** 纯函数,不依赖磁盘/进程,便于测试 */
export function launchAgentPlist(intervalHours: number, execPath: string, entryScript: string): string {
  const seconds = Math.max(1, Math.round(intervalHours * 3600));
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>${LAUNCH_AGENT_LABEL}</string>
  <key>ProgramArguments</key>
  <array>
    <string>${execPath}</string>
    <string>${entryScript}</string>
    <string>update</string>
    <string>--check</string>
  </array>
  <key>StartInterval</key>
  <integer>${seconds}</integer>
  <key>RunAtLoad</key>
  <true/>
  <key>StandardOutPath</key>
  <string>/tmp/kimi-boost-watch.log</string>
  <key>StandardErrorPath</key>
  <string>/tmp/kimi-boost-watch.log</string>
</dict>
</plist>
`;
}

export function cronLine(intervalHours: number, execPath: string, entryScript: string): string {
  const n = Math.max(1, Math.round(intervalHours));
  return `0 */${n} * * * ${execPath} ${entryScript} update --check  ${CRON_MARKER}`;
}

export function schtasksCommand(intervalHours: number, execPath: string, entryScript: string): string {
  const minutes = Math.max(1, Math.round(intervalHours * 60));
  return `schtasks /create /tn "kimi-boost-watch" /tr "\\"${execPath}\\" \\"${entryScript}\\" update --check" /sc minute /mo ${minutes} /f`;
}

function schtasksDeleteCommand(): string {
  return `schtasks /delete /tn "kimi-boost-watch" /f`;
}

function readCrontab(): string {
  try {
    return execFileSync("crontab", ["-l"], { encoding: "utf8" });
  } catch {
    return "";
  }
}

function writeCrontab(content: string): void {
  execFileSync("crontab", ["-"], { input: content });
}

function stripMarkerLines(content: string): string {
  return content
    .split("\n")
    .filter((line) => !line.includes(CRON_MARKER))
    .join("\n")
    .replace(/\n{3,}/g, "\n\n");
}

/** 注册周期性后台检查(幂等:重复执行不会重复注册) */
export function installWatch(opts: WatchOptions = {}): { platform: string; message: string } {
  const interval = opts.interval && opts.interval > 0 ? opts.interval : 6;
  const execPath = process.execPath;
  const entryScript = process.argv[1] ?? "kimi-boost";
  const platform = detectPlatform();

  if (platform === "darwin") {
    const path = launchAgentPath();
    writeFileIfWritable(path, launchAgentPlist(interval, execPath, entryScript));
    try {
      execFileSync("launchctl", ["unload", path], { stdio: "ignore" });
    } catch {
      /* 未加载过,忽略 */
    }
    execFileSync("launchctl", ["load", "-w", path], { stdio: "ignore" });
    return { platform, message: `已启用自动检查(每 ${interval} 小时): ${path}` };
  }

  if (platform === "linux") {
    const cleaned = stripMarkerLines(readCrontab());
    const line = cronLine(interval, execPath, entryScript);
    const next = `${cleaned.trimEnd()}\n${line}\n`.replace(/^\n/, "");
    writeCrontab(next);
    return { platform, message: `已启用自动检查(每 ${interval} 小时): crontab -l 查看` };
  }

  if (platform === "win32") {
    const cmd = schtasksCommand(interval, execPath, entryScript);
    return { platform, message: `请手动运行以注册计划任务:\n  ${cmd}` };
  }

  return { platform, message: "当前平台不支持自动检查" };
}

/** 移除已注册的周期性后台检查 */
export function uninstallWatch(): { platform: string; message: string } {
  const platform = detectPlatform();

  if (platform === "darwin") {
    const path = launchAgentPath();
    try {
      execFileSync("launchctl", ["unload", path], { stdio: "ignore" });
    } catch {
      /* 未加载,忽略 */
    }
    if (existsSync(path)) removeIfWritable(path);
    return { platform, message: "已移除自动检查" };
  }

  if (platform === "linux") {
    const cleaned = stripMarkerLines(readCrontab());
    writeCrontab(cleaned);
    return { platform, message: "已移除自动检查" };
  }

  if (platform === "win32") {
    return { platform, message: `请手动运行以移除计划任务:\n  ${schtasksDeleteCommand()}` };
  }

  return { platform, message: "当前平台不支持自动检查" };
}

export async function checkUpdates(opts: OutdatedOptions = {}): Promise<{ rows: OutdatedRow[]; updateCount: number }> {
  const rows = await runOutdated(opts);
  const updateCount = rows.filter((r) => r.status === "update-available").length;
  return { rows, updateCount };
}

/** 发送桌面通知;任何失败都吞掉(fail-open,绝不阻塞 --check) */
export function notify(message: string): void {
  const platform = detectPlatform();
  try {
    if (platform === "darwin") {
      execFileSync("osascript", ["-e", `display notification "${message}" with title "kimi-boost"`], { stdio: "ignore" });
    } else if (platform === "linux") {
      execFileSync("notify-send", ["kimi-boost", message], { stdio: "ignore" });
    } else {
      console.log(`[kimi-boost] ${message}`);
    }
  } catch {
    console.log(`[kimi-boost] ${message}`);
  }
}
