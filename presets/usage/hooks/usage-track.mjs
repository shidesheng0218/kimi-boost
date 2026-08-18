import { readFileSync, existsSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";

// 用量追踪 hook:监听 SessionStart / UserPromptSubmit / PreToolUse / SessionEnd,
// 把计数写入 ~/.kimi-boost/usage.json(每日聚合)。全部 fail-open。
// 可选阈值:设置 KIMI_BOOST_DAILY_LIMIT=N 后,当日提示数超过 N 时在 stderr 提示。

const HOME = process.env.KIMI_BOOST_HOME ?? join(homedir(), ".kimi-boost");
const FILE = join(HOME, "usage.json");
const DAY_LIMIT = Number(process.env.KIMI_BOOST_DAILY_LIMIT ?? 0);

let input = "";
process.stdin.on("data", (c) => (input += c));
process.stdin.on("end", () => {
  try {
    const payload = JSON.parse(input);
    const event = String(payload.hook_event_name ?? "");
    const day = new Date().toISOString().slice(0, 10);

    let data = { days: {} };
    if (existsSync(FILE)) {
      try {
        data = JSON.parse(readFileSync(FILE, "utf8"));
      } catch {
        /* unreadable: start fresh */
      }
    }
    const d = (data.days[day] ??= { sessions: 0, prompts: 0, toolCalls: 0 });

    if (event === "SessionStart") {
      d.sessions++;
      if (!d.startedAt) d.startedAt = new Date().toISOString();
    } else if (event === "SessionEnd") {
      d.endedAt = new Date().toISOString();
    } else if (event === "UserPromptSubmit") {
      d.prompts++;
      if (DAY_LIMIT > 0 && d.prompts > DAY_LIMIT) {
        console.error(
          `[kimi-boost] 今日提示 ${d.prompts} 次,已超过阈值 ${DAY_LIMIT}。注意用量与成本。`,
        );
      }
    } else if (event === "PreToolUse") {
      d.toolCalls++;
    }

    mkdirSync(HOME, { recursive: true });
    writeFileSync(FILE, JSON.stringify(data, null, 2));
  } catch {
    /* fail-open: never block the agent */
  }
});
