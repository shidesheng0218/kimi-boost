import { summarize, today, type UsageSummary } from "./usage.js";

/**
 * 用量统计聚合(stats 命令用):基于 usage.json 的每日数据算出
 * 总量、活跃天数、连续 streak、最佳一天等可展示指标。纯函数、可单测。
 */

export interface StatsTotals {
  sessions: number;
  prompts: number;
  toolCalls: number;
  minutes: number;
}

export interface StatsData {
  /** 统计窗口天数 */
  days: number;
  /** 窗口内逐日序列(含无活动的 0 天),供柱状图用 */
  series: UsageSummary[];
  totals: StatsTotals;
  /** 有任一活动(sessions/prompts/toolCalls > 0)的天数 */
  activeDays: number;
  /** 连续活跃天数:今天已有活动则从今天算起,否则从昨天起算(当天还没开始不打断 streak) */
  streak: number;
  /** prompts 最多的一天(无活动时 undefined) */
  bestDay?: { day: string; prompts: number };
  /** 每个活跃日的平均 prompts */
  avgPromptsPerActiveDay: number;
}

function isActive(s: UsageSummary): boolean {
  return s.sessions > 0 || s.prompts > 0 || s.toolCalls > 0;
}

export function computeStats(days: number): StatsData {
  const series = summarize(days);
  const totals = series.reduce<StatsTotals>(
    (acc, r) => ({
      sessions: acc.sessions + r.sessions,
      prompts: acc.prompts + r.prompts,
      toolCalls: acc.toolCalls + r.toolCalls,
      minutes: acc.minutes + r.minutes,
    }),
    { sessions: 0, prompts: 0, toolCalls: 0, minutes: 0 },
  );

  const activeDays = series.filter(isActive).length;

  // streak:从窗口内最后一天(今天)往前数;今天无活动则跳过今天从昨天算起
  let streak = 0;
  let i = series.length - 1;
  if (i >= 0 && series[i].day === today() && !isActive(series[i])) i--;
  for (; i >= 0; i--) {
    if (!isActive(series[i])) break;
    streak++;
  }

  let bestDay: StatsData["bestDay"];
  for (const r of series) {
    if (r.prompts > 0 && (!bestDay || r.prompts > bestDay.prompts)) {
      bestDay = { day: r.day, prompts: r.prompts };
    }
  }

  return {
    days,
    series,
    totals,
    activeDays,
    streak,
    bestDay,
    avgPromptsPerActiveDay: activeDays > 0 ? Math.round((totals.prompts / activeDays) * 10) / 10 : 0,
  };
}
