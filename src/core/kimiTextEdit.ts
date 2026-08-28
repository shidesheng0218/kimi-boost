/**
 * config.toml 文本级增量编辑。
 *
 * 目标:只改 kimi-boost 管理的片段,用户手写的注释、格式与无关内容全部原样保留。
 * 策略:
 *  - 顶层数组键(extra_skill_dirs/extra_agent_dirs):定位现有数组行/块,原位合并;
 *  - [[hooks]]:追加到 managed 标记区块内(# >>> kimi-boost managed >>>),幂等去重。
 *
 * 读取/查重走 smol-toml 解析(只读不写,不触碰原文);写回只做文本拼接。
 */
import { parse as parseToml } from "smol-toml";

export interface ManagedHook {
  event: string;
  matcher?: string;
  command: string;
  timeout?: number;
}

export const MANAGED_BEGIN = "# >>> kimi-boost managed >>>";
export const MANAGED_END = "# <<< kimi-boost managed <<<";

/** TOML 字符串转义:反斜杠与双引号(Windows 路径含反斜杠,必须转义) */
export function tomlStr(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

/** 还原 TOML 转义(\ -> \, \" -> ") */
function unescapeToml(s: string): string {
  return s.replace(/\\\\/g, "\\").replace(/\\"/g, '"');
}

/** 在数组块内提取引号字符串元素(还原转义) */
function extractElements(block: string): string[] {
  const out: string[] = [];
  const re = /"((?:[^"\\]|\\.)*)"/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(block)) !== null) out.push(unescapeToml(m[1]));
  return out;
}

function toArrayLine(key: string, elements: string[]): string {
  return `${key} = [ ${elements.map((e) => `"${tomlStr(e)}"`).join(", ")} ]`;
}

/**
 * 在顶层数组键中 upsert 一个目录。
 * 支持内联 `key = [ ... ]` 与多行数组块两种形态;不存在该键时追加到文件末尾。
 */
export function upsertDirArray(text: string, key: string, path: string): { text: string; changed: boolean } {
  const blockRe = new RegExp(`^\\s*${key}\\s*=\\s*\\[`, "m");
  const m = blockRe.exec(text);
  if (!m) {
    const append = text.length > 0 && !text.endsWith("\n") ? "\n" : "";
    return { text: text + append + `${toArrayLine(key, [path])}\n`, changed: true };
  }

  const start = m.index;
  const from = text.indexOf("[", m.index + m[0].indexOf("[")) + 1;
  if (from <= 0) return { text, changed: false };
  // 扫描到匹配的 ](字符串内可能含 ] 的情况忽略,路径中几乎不会出现)
  let depth = 1;
  let end = from;
  let inStr = false;
  let esc = false;
  for (; end < text.length; end++) {
    const ch = text[end];
    if (esc) {
      esc = false;
      continue;
    }
    if (ch === "\\" && inStr) {
      esc = true;
      continue;
    }
    if (ch === '"') inStr = !inStr;
    if (inStr) continue;
    if (ch === "[") depth++;
    else if (ch === "]") {
      depth--;
      if (depth === 0) break;
    }
  }
  const blockEnd = end + 1;
  const block = text.slice(start, blockEnd);
  const elements = extractElements(block);
  if (elements.includes(path)) return { text, changed: false };
  elements.push(path);
  const indent = /^(\s*)/.exec(block)?.[1] ?? "";
  const replacement = indent + toArrayLine(key, elements);
  return { text: text.slice(0, start) + replacement + text.slice(blockEnd), changed: true };
}

export function removeDirEntry(text: string, key: string, path: string): { text: string; changed: boolean } {
  const blockRe = new RegExp(`^\\s*${key}\\s*=\\s*\\[`, "m");
  const m = blockRe.exec(text);
  if (!m) return { text, changed: false };
  const start = m.index;
  const from = text.indexOf("[", m.index + m[0].indexOf("[")) + 1;
  let depth = 1;
  let end = from;
  let inStr = false;
  let esc = false;
  for (; end < text.length; end++) {
    const ch = text[end];
    if (esc) {
      esc = false;
      continue;
    }
    if (ch === "\\" && inStr) {
      esc = true;
      continue;
    }
    if (ch === '"') inStr = !inStr;
    if (inStr) continue;
    if (ch === "[") depth++;
    else if (ch === "]") {
      depth--;
      if (depth === 0) break;
    }
  }
  const blockEnd = end + 1;
  const block = text.slice(start, blockEnd);
  const elements = extractElements(block).filter((e) => e !== path);
  if (elements.length === extractElements(block).length) return { text, changed: false };
  const indent = /^(\s*)/.exec(block)?.[1] ?? "";
  const replacement = indent + toArrayLine(key, elements);
  return { text: text.slice(0, start) + replacement + text.slice(blockEnd), changed: true };
}

function findManagedBlock(text: string): { start: number; end: number; body: string } | undefined {
  const beginIdx = text.indexOf(MANAGED_BEGIN);
  if (beginIdx < 0) return undefined;
  const endIdx = text.indexOf(MANAGED_END, beginIdx);
  if (endIdx < 0) return undefined;
  return {
    start: beginIdx,
    end: endIdx + MANAGED_END.length,
    body: text.slice(beginIdx + MANAGED_BEGIN.length, endIdx),
  };
}

function hookToToml(h: ManagedHook): string[] {
  const lines = ["[[hooks]]", `event = "${tomlStr(h.event)}"`, `command = "${tomlStr(h.command)}"`];
  if (h.matcher) lines.push(`matcher = "${tomlStr(h.matcher)}"`);
  if (h.timeout !== undefined) lines.push(`timeout = ${h.timeout}`);
  return lines;
}

function commandOfBlock(block: string): string | undefined {
  const m = block.match(/^command\s*=\s*"((?:[^"\\]|\\.)*)"/m);
  return m ? m[1] : undefined;
}

/** 解析整个文本中的 hooks 命令集合(TOML 解析,转义会被还原) */
function existingHookCommands(text: string): Set<string> {
  try {
    const data = parseToml(text) as { hooks?: Array<{ command?: string }> };
    return new Set((data.hooks ?? []).map((h) => h.command ?? ""));
  } catch {
    return new Set();
  }
}

/**
 * 幂等追加 managed hooks:更新或创建 managed 区块。
 * 同 command 的 hook(整个 config 内)视为已存在,跳过。
 */
export function upsertManagedHooks(text: string, hooks: ManagedHook[]): { text: string; added: number; skipped: number } {
  const block = findManagedBlock(text);
  const existing = existingHookCommands(text);

  const hookBlocks: string[] = [];
  if (block) {
    const re = /\[\[hooks\]\](?:(?!\[\[hooks\]\]).)*/gs;
    let m: RegExpExecArray | null;
    while ((m = re.exec(block.body)) !== null) hookBlocks.push(m[0]);
  }

  let added = 0;
  let skipped = 0;
  for (const h of hooks) {
    if (existing.has(h.command) || hookBlocks.some((b) => commandOfBlock(b) === h.command)) {
      skipped++;
      continue;
    }
    hookBlocks.push(hookToToml(h).join("\n"));
    added++;
  }
  if (added === 0) return { text, added, skipped };

  const newBlock = [MANAGED_BEGIN, ...hookBlocks, MANAGED_END].join("\n");
  if (block) {
    return {
      text: text.slice(0, block.start) + newBlock + text.slice(block.end),
      added,
      skipped,
    };
  }
  const append = text.length > 0 && !text.endsWith("\n") ? "\n" : "";
  const sep = text.length > 0 ? "\n" : "";
  return { text: text + append + sep + newBlock + "\n", added, skipped };
}

/**
 * 移除属于某 preset 的 hooks(command 路径含 hooks/<id>/),并清理空 managed 区块。
 * 兼容两种来源:managed 标记块内的(从标记块剔除)与块外的(旧版写入,直接删块)。
 */
export function removePresetHooks(text: string, presetId: string): { text: string; removed: number } {
  // + 匹配一个或多个分隔符:文本里的路径可能是 TOML 转义形态(Windows 下
  // hooks\\<id>\\ 为两个连续反斜杠),单分隔符正则会漏匹配导致 hook 清不掉
  const needleRe = new RegExp(`hooks[\\\\/]+${presetId}[\\\\/]+`);
  const block = findManagedBlock(text);

  // 1) 块外的 [[hooks]]:整块删除(旧版兼容)
  const hookRe = /\[\[hooks\]\](?:(?!\[\[hooks\]\]).)*/gs;
  let removed = 0;
  const deletions: Array<{ start: number; end: number }> = [];
  let m: RegExpExecArray | null;
  while ((m = hookRe.exec(text)) !== null) {
    const inManaged = block !== undefined && m.index >= block.start && m.index < block.end;
    if (!inManaged && needleRe.test(m[0])) {
      deletions.push({ start: m.index, end: m.index + m[0].length });
      removed++;
    }
  }
  let out = text;
  for (const d of deletions.reverse()) {
    let s = d.start;
    if (s > 0 && out[s - 1] === "\n") s--;
    out = out.slice(0, s) + out.slice(d.end);
  }

  // 2) managed 块内:从标记块剔除,空块则移除
  const b2 = findManagedBlock(out);
  if (!b2) return { text: out, removed };
  const re = /\[\[hooks\]\](?:(?!\[\[hooks\]\]).)*/gs;
  const keep: string[] = [];
  let m2: RegExpExecArray | null;
  while ((m2 = re.exec(b2.body)) !== null) {
    if (needleRe.test(m2[0])) removed++;
    else keep.push(m2[0]);
  }
  if (removed === 0) return { text: out, removed };

  if (keep.length === 0) {
    let start = b2.start;
    if (start > 0 && out[start - 1] === "\n") start--;
    let end = b2.end;
    if (end < out.length && out[end] === "\n") end++;
    return { text: out.slice(0, start) + out.slice(end), removed };
  }

  const newBlock = [MANAGED_BEGIN, ...keep, MANAGED_END].join("\n");
  return { text: out.slice(0, b2.start) + newBlock + out.slice(b2.end), removed };
}

/**
 * 把 config 中 command 为 fromCommand 的 hook 条目重定向为 toCommand
 * (hook 共享卸载场景:条目还指向被卸载预设的脚本路径时,改指下一个共享者的副本)。
 * 同时尝试原始与 TOML 转义两种形态(Windows 路径在文本中是转义存储的)。
 */
export function retargetHookCommand(
  text: string,
  fromCommand: string,
  toCommand: string,
): { text: string; changed: boolean } {
  const candidates: Array<[string, string]> = [
    [fromCommand, toCommand],
    [tomlStr(fromCommand), tomlStr(toCommand)],
  ];
  for (const [from, to] of candidates) {
    if (from && text.includes(from)) {
      return { text: text.split(from).join(to), changed: true };
    }
  }
  return { text, changed: false };
}
