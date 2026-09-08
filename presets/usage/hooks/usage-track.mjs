import { readFileSync, existsSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";

// 用量追踪 hook:监听 SessionStart / UserPromptSubmit / PreToolUse / SessionEnd,
// 把计数写入 ~/.kimi-boost/usage.json(每日聚合)。全部 fail-open。
// 可选阈值:设置 KIMI_BOOST_DAILY_LIMIT=N 后,当日提示数超过 N 时在 stderr 提示。
// v1.1:支持分工具计数——preset.json 通过 args 传入 --tool=<name>,
// 无 matcher 的 PreToolUse 记总量,带 matcher 的按工具记入 days[].tools。

const HOME = process.env.KIMI_BOOST_HOME ?? join(homedir(), ".kimi-boost");
const FILE = join(HOME, "usage.json");
const DAY_LIMIT = Number(process.env.KIMI_BOOST_DAILY_LIMIT ?? 0);

// args 里带的 --tool=<name>(同一脚本被多个 matcher 注册时区分工具)
const toolArg = process.argv.slice(2).find((a) => a.startsWith("--tool="));
const TOOL = toolArg ? toolArg.slice("--tool=".length).toLowerCase() : "";

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
      if (TOOL) {
        // 带 matcher 的注册:只记分工具(总量由无 matcher 的注册记)
        d.tools ??= {};
        d.tools[TOOL] = (d.tools[TOOL] ?? 0) + 1;
      } else {
        // 无 matcher 的注册:记全部工具调用总量
        d.toolCalls++;
      }
    }

    mkdirSync(HOME, { recursive: true });
    writeFileSync(FILE, JSON.stringify(data, null, 2));
  } catch {
    /* fail-open: never block the agent */
  }
});
