import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { HookRegistryEntry } from "./manifest.js";

/**
 * Hook 内容指纹与共享注册表。
 *
 * 背景:多个预设常携带功能完全相同的 hook(如 vue3/nextjs 的 protect-main.mjs),
 * 按 command 字符串去重无法识别(脚本路径不同),同一段守卫逻辑会被注册多次。
 *
 * 判据:event + matcher + args + timeout + 脚本内容 sha256 → 指纹。
 * 注册表存于用户级 manifest(~/.kimi-boost/installed.json)顶层 hooks 键:
 *   指纹 -> { command(当前生效条目,指向首个安装者的脚本路径), refs(共享预设) }
 *
 * 生命周期:
 *  - install    : 先 releasePresetRefs 释放本预设旧引用(keepFps 之外的,处理内容变更),
 *                 再 claimPresetHooks——指纹命中即共享既有条目,未命中则登记并写新条目
 *  - deactivate : releasePresetRefs 全量释放;refs 清空则删条目,
 *                 仍有共享者且条目 command 指向本预设脚本 → 重定向到下一个 ref 的脚本路径
 *
 * 不改变既有目录布局(<hooksDir>/<presetId>/<script>),
 * listInstalled / doctor 的路径假设与各预设自身的脚本副本(uninstall 自足)均不受影响。
 */

export interface PendingHook {
  event: string;
  matcher?: string;
  script: string;
  timeout?: number;
  args?: string[];
}

/** releasePresetRefs 的单条结果 */
export interface ReleasedHook {
  fp: string;
  /** 释放后仍共享该条目的预设 */
  refsLeft: string[];
  oldCommand: string;
  /** 非空表示 config 条目需重定向为此 command;undefined 表示条目已删除(refs 清空) */
  newCommand?: string;
}

/** 把 command 中 <hooksDir>/<owner>/ 的 owner 段替换为 nextRef(取最后一个 hooks 段,避免路径前缀误伤) */
export function retargetCommand(command: string, nextRef: string): string {
  // 贪婪 .* 保证匹配路径中最后一个 hooks/<id>/ 段
  const m = /^(.*hooks[\\/])([^\\/]+)([\\/].*)$/s.exec(command);
  return m ? `${m[1]}${nextRef}${m[3]}` : command;
}

/** command 指向的 preset 目录名(…/hooks/<owner>/<script>),不属于该布局时为 undefined */
export function hookCommandOwner(command: string): string | undefined {
  const m = /^(.*hooks[\\/])([^\\/]+)([\\/].*)$/s.exec(command);
  return m?.[2];
}

export function fingerprintHook(
  event: string,
  matcher: string | undefined,
  scriptContent: string | Buffer,
  opts?: { timeout?: number; args?: string[] },
): string {
  const h = createHash("sha256");
  h.update(event).update("\u0000").update(matcher ?? "");
  if (opts?.args?.length) h.update("\u0000").update(JSON.stringify(opts.args));
  if (opts?.timeout !== undefined) h.update("\u0000").update(String(opts.timeout));
  h.update("\u0000").update(scriptContent);
  return h.digest("hex").slice(0, 12);
}

/** 从预设源目录计算 hooks 的指纹(脚本不可读时该项为 undefined) */
export function fingerprintPresetHooks(sourceDir: string, hooks: PendingHook[]): Array<string | undefined> {
  return hooks.map((h) => {
    try {
      const content = readFileSync(join(sourceDir, "hooks", h.script));
      return fingerprintHook(h.event, h.matcher, content, { timeout: h.timeout, args: h.args });
    } catch {
      return undefined;
    }
  });
}

/**
 * 释放某预设的全部 hook 引用(纯内存操作,调用方负责 writeHookRegistry 持久化)。
 * keepFps 中的指纹跳过不动(install 重装同内容时避免条目无谓重建)。
 */
export function releasePresetRefs(
  hooks: Record<string, HookRegistryEntry>,
  presetId: string,
  keepFps?: ReadonlySet<string>,
): ReleasedHook[] {
  const out: ReleasedHook[] = [];
  for (const [fp, entry] of Object.entries(hooks)) {
    if (keepFps?.has(fp)) continue;
    if (!entry.refs.includes(presetId)) continue;
    const oldCommand = entry.command;
    const refs = entry.refs.filter((r) => r !== presetId);
    let newCommand: string | undefined;
    if (refs.length === 0) {
      delete hooks[fp];
    } else if (hookCommandOwner(oldCommand) === presetId) {
      // 条目还指向被卸载预设的脚本路径:重定向到下一个共享者(其脚本副本仍在)
      newCommand = retargetCommand(oldCommand, refs[0]);
      entry.command = newCommand;
    }
    entry.refs = refs;
    out.push({ fp, refsLeft: refs, oldCommand, newCommand });
  }
  return out;
}

export interface ClaimResult {
  /** 应存在于 config 中的全部条目(含共享命中者,adapter 侧按 command 幂等 upsert) */
  entries: Array<PendingHook & { command: string }>;
  /** 新登记(此前无共享条目)的数量 */
  freshCount: number;
  /** 命中既有条目转为共享的数量 */
  sharedCount: number;
  registryChanged: boolean;
}

/**
 * 认领预设 hooks:指纹命中 → 复用既有条目(command 指向首个安装者路径);
 * 未命中 → 登记 ref 并写新条目。脚本不可读时退化为不登记直接写(与项目 fail-open 原则一致)。
 * 纯内存操作,调用方负责 writeHookRegistry 持久化。
 */
export function claimPresetHooks(
  hooks: Record<string, HookRegistryEntry>,
  presetId: string,
  fps: Array<string | undefined>,
  pending: PendingHook[],
  buildCommand: (presetId: string, hook: PendingHook) => string,
): ClaimResult {
  const entries: Array<PendingHook & { command: string }> = [];
  let freshCount = 0;
  let sharedCount = 0;
  let registryChanged = false;

  pending.forEach((hook, i) => {
    const fp = fps[i];
    const existing = fp ? hooks[fp] : undefined;
    if (existing) {
      if (!existing.refs.includes(presetId)) {
        existing.refs.push(presetId);
        registryChanged = true;
      }
      entries.push({ ...hook, command: existing.command });
      sharedCount++;
      return;
    }
    const command = buildCommand(presetId, hook);
    if (fp) {
      hooks[fp] = {
        event: hook.event,
        ...(hook.matcher ? { matcher: hook.matcher } : {}),
        ...(hook.timeout !== undefined ? { timeout: hook.timeout } : {}),
        ...(hook.args?.length ? { args: hook.args } : {}),
        script: hook.script,
        command,
        refs: [presetId],
      };
      registryChanged = true;
      freshCount++;
    }
    entries.push({ ...hook, command });
  });

  return { entries, freshCount, sharedCount, registryChanged };
}
