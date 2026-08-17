import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

let input = "";
process.stdin.on("data", (c) => (input += c));
process.stdin.on("end", () => {
  try {
    const payload = JSON.parse(input);
    const command = String(payload.tool_input?.command ?? "");
    const blocked = [
      /(^|\s|\||;|&)rm\s+(-[a-z]*r[a-z]*\s+)+(-[a-z]*f[a-z]*)?\s+\/?(\*|\.|\.\.)/,
      /(^|\s|\||;|&)\s*rm\s+-[a-z]*rf[a-z]*\s+.*\$\w*/,
      /(^|\s|\||;|&)mkfs/,
      /(^|\s|\||;|&)dd\s+if=.*of=\/dev\/sd/,
      /curl\s+.*\|\s*(ba)?sh/,
    ];
    const hit = blocked.find((re) => re.test(command));
    if (hit) {
      console.error(`[kimi-boost] Blocked dangerous shell command (${hit})`);
      process.exit(2);
    }
  } catch {
    /* fail-open */
  }
  process.exit(0);
});
