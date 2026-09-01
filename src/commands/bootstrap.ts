import { chmodSync, existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { findProjectRoot, projectInstalledPresets } from "../core/project.js";
import { writeFileIfWritable } from "../core/fsguard.js";

export interface BootstrapOptions {
  /** 强制生成 Makefile target 而非 setup.sh */
  makefile?: boolean;
  /** 测试用:显式指定项目根 */
  cwd?: string;
}

export interface BootstrapResult {
  mode: "setup.sh" | "makefile";
  path: string;
  presetIds: string[];
  created: boolean;
}

const MARK_BEGIN = "# >>> kimi-boost setup >>>";
const MARK_END = "# <<< kimi-boost setup <<<";

function detectionBlock(): string {
  return `echo "🔍 检测 AI coding CLI..."

if ! command -v kimi &> /dev/null; then
  echo "❌ Kimi Code 未安装"
  echo "   安装: https://www.kimi.com/code/docs/kimi-code-cli/guides/getting-started.html"
  exit 1
fi
echo "✓ Kimi Code $(kimi --version)"

if command -v claude &> /dev/null; then
  echo "✓ Claude Code $(claude --version)"
else
  echo "⚠ Claude Code 未安装（可选，跳过）"
fi`;
}

function installLines(presetIds: string[]): string {
  if (presetIds.length === 0) {
    return 'echo "⚠ 未检测到项目级预设记录 (.kimi-boost/installed.json)，跳过安装"';
  }
  return presetIds.map((id) => `npx kimi-boost install ${id} --project`).join("\n");
}

function setupShContent(presetIds: string[]): string {
  return `#!/bin/bash
set -e

${detectionBlock()}

echo "📦 安装项目预设..."
${installLines(presetIds)}

echo "✅ 完成！项目预设已生效"
`;
}

function makefileTarget(presetIds: string[]): string {
  const detectCmd = `@command -v kimi >/dev/null || (echo "Install Kimi Code first: https://www.kimi.com/code/docs/kimi-code-cli/guides/getting-started.html"; exit 1)`;
  const installCmds =
    presetIds.length > 0
      ? presetIds.map((id) => `\tnpx kimi-boost install ${id} --project`).join("\n")
      : `\t@echo "⚠ no project presets recorded in .kimi-boost/installed.json"`;
  return `${MARK_BEGIN}
setup:
\t${detectCmd}
${installCmds}
\t@echo "✅ Project presets installed"
${MARK_END}`;
}

/** 往已有 Makefile 里插入/替换 setup target(按标记块定位,幂等) */
function mergeMakefile(existing: string, presetIds: string[]): string {
  const block = makefileTarget(presetIds);
  const re = new RegExp(`${MARK_BEGIN}[\\s\\S]*?${MARK_END}`, "m");
  if (re.test(existing)) {
    return existing.replace(re, block);
  }
  const sep = existing.length > 0 && !existing.endsWith("\n") ? "\n\n" : existing.length > 0 ? "\n" : "";
  return `${existing}${sep}${block}\n`;
}

/**
 * 生成团队 onboarding 脚本:检测 CLI → 安装 CLI(提示) → 安装项目已记录的预设。
 * 默认写 setup.sh;若项目根已有 Makefile 或显式 --makefile,则改为追加/更新 setup target。
 */
export function generateBootstrap(opts: BootstrapOptions = {}): BootstrapResult {
  const { root } = findProjectRoot(opts.cwd);
  const presetIds = projectInstalledPresets(opts.cwd).map((p) => p.id);
  const makefilePath = join(root, "Makefile");
  const useMakefile = opts.makefile || (opts.makefile !== false && existsSync(makefilePath));

  if (useMakefile) {
    const existing = existsSync(makefilePath) ? readFileSync(makefilePath, "utf8") : "";
    const created = !existsSync(makefilePath);
    writeFileIfWritable(makefilePath, mergeMakefile(existing, presetIds));
    return { mode: "makefile", path: makefilePath, presetIds, created };
  }

  const scriptPath = join(root, "setup.sh");
  const created = !existsSync(scriptPath);
  writeFileIfWritable(scriptPath, setupShContent(presetIds));
  try {
    chmodSync(scriptPath, 0o755);
  } catch {
    /* 只读文件系统等场景忽略 */
  }
  return { mode: "setup.sh", path: scriptPath, presetIds, created };
}
