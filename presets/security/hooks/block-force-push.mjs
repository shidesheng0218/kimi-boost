import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

// ---- kimi-boost guard runtime(各守卫脚本内联同一份逻辑) ----
const GUARD_NAME = "block-force-push";
const HOME = process.env.KIMI_BOOST_HOME ?? join(homedir(), ".kimi-boost");
const GUARDS_FILE = join(HOME, "guards.json");
const GUARD_LOG = join(HOME, "guard-log.jsonl");

function guardDisabled(name) {
  try {
    if (!existsSync(GUARDS_FILE)) return false;
    const cfg = JSON.parse(readFileSync(GUARDS_FILE, "utf8"));
    return Array.isArray(cfg.disabled) && cfg.disabled.includes(name);
  } catch {
    return false;
  }
}

function logBlock(name, tool, preview) {
  try {
    mkdirSync(HOME, { recursive: true });
    const line = JSON.stringify({ ts: new Date().toISOString(), guard: name, tool, preview: String(preview ?? "").slice(0, 40) });
    let lines = [];
    if (existsSync(GUARD_LOG)) lines = readFileSync(GUARD_LOG, "utf8").split("\n").filter(Boolean);
    lines.push(line);
    if (lines.length > 1000) lines = lines.slice(-1000);
    writeFileSync(GUARD_LOG, lines.join("\n") + "\n");
  } catch {
    /* 日志失败不影响拦截 */
  }
}
// ---- end guard runtime ----

let input = "";
process.stdin.on("data", (c) => (input += c));
process.stdin.on("end", () => {
  try {
    if (guardDisabled(GUARD_NAME)) process.exit(0);
    const payload = JSON.parse(input);
    const command = String(payload.tool_input?.command ?? "");
    const m = command.match(/\bgit\s+push\b([\s\S]*)/);
    if (!m) process.exit(0);

    // --force-with-lease 是相对安全的强推(远端被别人更新时会拒绝),放行;先从参数里剔除再判
    const args = m[1].replace(/--force-with-lease(=\S+)?/g, "");
    const dangerous = /--force\b|--delete\b|(?:^|\s)-[a-zA-Z]*f[a-zA-Z]*(?=\s|$)/.test(args);
    if (dangerous) {
      logBlock(GUARD_NAME, "Bash", command);
      console.error(
        "[kimi-boost] Blocked: dangerous git push (--force / --delete). " +
          "如确需覆盖远端,请用 --force-with-lease 并先确认无他人协作。",
      );
      process.exit(2);
    }
  } catch {
    /* fail-open */
  }
  process.exit(0);
});
