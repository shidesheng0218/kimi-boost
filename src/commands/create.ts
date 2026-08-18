import { existsSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { presetsRoot } from "../registry/presets.js";

export interface CreateOptions {
  name?: string;
  tags?: string;
}

/**
 * 生成一个预设骨架,方便社区贡献者 1 分钟起步。
 * 输出到 <repo>/presets/<id>/ 下,提交后 CI 会校验。
 */
export function createPreset(id: string, opts: CreateOptions = {}): string[] {
  if (!/^[a-z0-9][a-z0-9_-]*$/.test(id)) {
    throw new Error(`Invalid preset id '${id}'. Use kebab-case (a-z0-9, -, _).`);
  }
  const root = presetsRoot();
  const dir = join(root, id);
  if (existsSync(dir)) {
    throw new Error(`Preset '${id}' already exists at ${dir}.`);
  }

  const name = opts.name ?? id;
  const tags = (opts.tags ?? "").split(",").map((t) => t.trim()).filter(Boolean);

  mkdirSync(join(dir, "skills", `${id}-best-practices`), { recursive: true });
  mkdirSync(join(dir, "agents"), { recursive: true });
  mkdirSync(join(dir, "hooks"), { recursive: true });

  const preset = {
    id,
    name,
    description: "One-line pitch shown in the installer.",
    tags: tags.length ? tags : ["stack"],
    version: "1.0.0",
    hooks: [
      { event: "PreToolUse", matcher: "Bash", script: "protect-main.mjs", timeout: 5 },
    ],
  };
  const plugin = {
    name: id,
    version: "1.0.0",
    description: preset.description,
    keywords: tags,
    license: "MIT",
    interface: {
      displayName: name,
      shortDescription: "Best practices for " + name,
      developerName: "kimi-boost",
      websiteURL: "https://github.com/shidesheng0218/kimi-boost",
    },
    skills: "./skills/",
    agents: "./agents/",
    hooks: [
      { event: "PreToolUse", matcher: "Bash", command: "node ./hooks/protect-main.mjs", timeout: 5 },
    ],
  };

  const files: Array<[string, string]> = [
    ["preset.json", JSON.stringify(preset, null, 2) + "\n"],
    ["kimi.plugin.json", JSON.stringify(plugin, null, 2) + "\n"],
    [
      `skills/${id}-best-practices/SKILL.md`,
      `---\nname: ${id}-best-practices\ndescription: ${name} 最佳实践规范,自动加载。\n---\n\n# ${name} 工程规范\n\n当项目包含对应标记文件时,按以下规范行事:\n\n## 结构\n- (补充你的技术栈目录/分层规范)\n\n## 质量\n- (补充命名、类型、性能规范)\n\n## 提交\n- 遵守 protect-main 守卫(默认 hook)\n`,
    ],
    [
      `agents/${id}-reviewer.md`,
      `---\nname: ${id}-reviewer\ndescription: 严格的 ${name} 代码审查 Agent\nwhenToUse: 审查 ${name} 代码改动时\ntools: Read, Grep, Glob\ndisallowedTools: Bash, Write, Edit\n---\n\n你是严格的 ${name} 代码审查者。你的最后一条消息必须是完整、自包含的审查报告。\n\n按严重度分级输出:\`[P0 必须修]\` / \`[P1 建议修]\` / \`[P2 可忽略]\`。\n\n(补充审查重点)\n`,
    ],
    [
      "hooks/protect-main.mjs",
      `import { execFileSync } from "node:child_process";\n\nlet input = "";\nprocess.stdin.on("data", (c) => (input += c));\nprocess.stdin.on("end", () => {\n  try {\n    const payload = JSON.parse(input);\n    const command = String(payload.tool_input?.command ?? "");\n    if (!/git push/i.test(command)) process.exit(0);\n    let branch = "";\n    try {\n      branch = execFileSync("git", ["branch", "--show-current"], { encoding: "utf8" }).trim();\n    } catch { /* not a git repo */ }\n    if (branch === "main" || branch === "master") {\n      console.error("[kimi-boost] Blocked: direct push to " + branch + ". Use a feature branch and open a PR instead.");\n      process.exit(2);\n    }\n  } catch { /* fail-open */ }\n  process.exit(0);\n});\n`,
    ],
  ];

  for (const [rel, content] of files) {
    writeFileSync(join(dir, rel), content, "utf8");
  }
  return files.map(([rel]) => rel);
}
