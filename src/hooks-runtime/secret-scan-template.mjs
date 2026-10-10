import { appendFileSync, existsSync, mkdirSync, readFileSync, renameSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

// ---- kimi-boost guard runtime(GENERATED:改 src/hooks-runtime/ 后运行 npm run build:hooks) ----
const GUARD_NAME = "secret-scan";
{{GUARD_RUNTIME}}
// ---- end guard runtime ----

let input = "";
process.stdin.on("data", (c) => (input += c));
process.stdin.on("end", () => {
  try {
    if (guardDisabled(GUARD_NAME)) process.exit(0);
    const payload = JSON.parse(input);
    // Write 工具用 tool_input.content,Edit 用 tool_input.new_string;都取不到则放行
    const ti = payload.tool_input ?? {};
    const content = String(ti.content ?? ti.new_string ?? "");
    if (!content) process.exit(0);

    const patterns = [
      { name: "AWS Access Key ID", re: /\bAKIA[0-9A-Z]{16}\b/ },
      { name: "private key block", re: /-----BEGIN (?:RSA |EC |OPENSSH |DSA |PGP |ENCRYPTED )?PRIVATE KEY(?: BLOCK)?-----/ },
      { name: "GitHub token", re: /\bgh[pousr]_[A-Za-z0-9]{20,}\b/ },
      { name: "Slack token", re: /\bxox[baprs]-[A-Za-z0-9-]{10,}\b/ },
      { name: "Slack webhook", re: /https:\/\/hooks\.slack\.com\/services\/[A-Z0-9]+\/[A-Z0-9]+\/[A-Za-z0-9]+/ },
      {
        name: "hardcoded credential",
        re: /\b(?:api[_-]?key|api[_-]?secret|client[_-]?secret|secret|access[_-]?token|auth[_-]?token|password|passwd)\b\s*[:=]\s*["'][A-Za-z0-9/_+=.-]{16,}["']/i,
      },
    ];
    const hit = patterns.find((p) => p.re.test(content));
    if (hit) {
      // 日志只记命中的模式名,绝不记录密钥内容本身
      blockOrWarn(
        GUARD_NAME,
        "Write/Edit",
        `pattern:${hit.name}`,
        `Blocked: content looks like a hardcoded secret (${hit.name}). Move it to an env var or a secrets manager instead of writing it into a file.`,
      );
    }
  } catch {
    /* fail-open */
  }
  process.exit(0);
});
