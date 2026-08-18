import pc from "picocolors";
import { summarize, today } from "../core/usage.js";

export function printUsage(days = 7): void {
  const rows = summarize(days);
  const t = rows.find((r) => r.day === today());
  const total = rows.reduce(
    (acc, r) => ({ prompts: acc.prompts + r.prompts, toolCalls: acc.toolCalls + r.toolCalls, sessions: acc.sessions + r.sessions }),
    { prompts: 0, toolCalls: 0, sessions: 0 },
  );

  console.log(pc.bold(`📊 kimi-boost usage (last ${days} days)`));
  console.log("");
  for (const r of rows) {
    const mark = r.day === today() ? pc.green(" ← today") : "";
    console.log(
      `${r.day}${mark}  sessions ${pc.bold(String(r.sessions))}  prompts ${pc.bold(String(r.prompts))}  toolCalls ${pc.bold(String(r.toolCalls))}  active ${r.minutes}m`,
    );
  }
  console.log("");
  console.log(
    `Total: ${pc.bold(String(total.sessions))} sessions, ${pc.bold(String(total.prompts))} prompts, ${pc.bold(String(total.toolCalls))} tool calls`,
  );
  if (t) {
    console.log(`\nToday: ${t.prompts} prompts` + (t.minutes ? `, ~${t.minutes}min active` : ""));
  }
  console.log(`\nThreshold: set ${pc.cyan("KIMI_BOOST_DAILY_LIMIT=50")} in the agent env to get a warning when daily prompts exceed it.`);
}

export function formatUsageLine(): string {
  const rows = summarize(1);
  const t = rows[0];
  return `kimi-boost: today ${t.sessions}s/${t.prompts}p/${t.toolCalls}t`;
}
