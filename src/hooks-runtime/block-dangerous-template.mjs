import { appendFileSync, existsSync, mkdirSync, readFileSync, renameSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

// ---- kimi-boost guard runtime(GENERATED:改 src/hooks-runtime/ 后运行 npm run build:hooks) ----
const GUARD_NAME = "block-dangerous";
{{GUARD_RUNTIME}}
// ---- end guard runtime ----

let input = "";
process.stdin.on("data", (c) => (input += c));
process.stdin.on("end", () => {
  try {
    if (guardDisabled(GUARD_NAME)) process.exit(0);
    const payload = JSON.parse(input);
    const command = String(payload.tool_input?.command ?? "");
    const blocked = [
      // rm 带递归/强制参数,目标为 / 、 /* 、 * 、 . 、 ./ 、 .. 、 ../ 等危险路径
      /(^|[\s|;&])rm(\s+-[a-zA-Z]*[rRfF][a-zA-Z]*)+\s+(?:\/\*?|\*|\.\.?\/?)(\s|$)/,
      // rm -rf 路径里含未加引号的 $变量(变量为空时会误删,如 rm -rf $HOME 的悲剧)
      /(^|[\s|;&])rm(\s+-[a-zA-Z]*[rRfF][a-zA-Z]*)+\s+[^|;&]*\$\w+/,
      // sudo + 危险命令
      /(^|[\s|;&])sudo\s+(rm\s+-[a-zA-Z]*[rRfF]|mkfs|dd|chmod\s+-R\s+777)/,
      /(^|[\s|;&])mkfs/,
      /(^|[\s|;&])dd\s+if=.*of=\/dev\/sd/,
      // 管道执行远程脚本
      /(curl|wget)\s+.*\|\s*(ba)?sh/,
      // git 破坏性操作
      /(^|[\s|;&])git\s+(clean\s+-[a-zA-Z]*f|reset\s+--hard)/,
      // 递归 chmod 777
      /(^|[\s|;&])chmod\s+-[a-zA-Z]*R[a-zA-Z]*\s+777/,
      // eval + base64(常见的混淆注入)
      /eval.*base64/,
    ];
    // 用户自定义拦截模式(guards.json 的 customPatterns,由 kimi-boost guard --add-pattern 写入)
    for (const p of guardsConfig().customPatterns ?? []) {
      try {
        blocked.push(new RegExp(p));
      } catch {
        /* 非法正则忽略 */
      }
    }
    const hit = blocked.find((re) => re.test(command));
    if (hit) {
      blockOrWarn(GUARD_NAME, "Bash", command, `Blocked dangerous shell command (${hit})`);
    }
  } catch {
    /* fail-open */
  }
  process.exit(0);
});
