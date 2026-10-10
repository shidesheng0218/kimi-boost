import { readFileSync } from "node:fs";
import { existsSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { presetsRoot } from "../registry/presets.js";

// 项目根目录(用于读取 hook 模板源文件,不受测试 mock 影响)
const projectRoot = join(dirname(fileURLToPath(import.meta.url)), "../..");

export interface CreateOptions {
  name?: string;
  tags?: string;
  /** 预设形态,默认 skill(skill+agent+hook)。mcp = 仅 mcpServers;command = 附带 slash 命令而非 hook */
  shape?: "skill" | "mcp" | "command";
  /** 已存在同名预设时是否覆盖 */
  force?: boolean;
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
  if (existsSync(dir) && !opts.force) {
    throw new Error(`Preset '${id}' already exists at ${dir}. Pass --force to overwrite.`);
  }

  const shape = opts.shape ?? "skill";
  const name = opts.name ?? id;
  const tags = (opts.tags ?? "").split(",").map((t) => t.trim()).filter(Boolean);
  const description = "One-line pitch shown in the installer.";

  const files: Array<[string, string]> = [];

  if (shape === "mcp") {
    mkdirSync(dir, { recursive: true });
    const preset = {
      id,
      name,
      description,
      tags: tags.length ? tags : ["mcp"],
      version: "1.0.0",
      hooks: [],
      mcpServers: {
        [`${id}-server`]: { command: "uvx", args: [`mcp-server-${id}`] },
      },
    };
    const plugin = {
      name: id,
      version: "1.0.0",
      description,
      keywords: tags,
      license: "MIT",
      interface: {
        displayName: name,
        shortDescription: "Best practices for " + name,
        developerName: "kimi-boost",
        websiteURL: "https://github.com/shidesheng0218/kimi-boost",
      },
      mcpServers: preset.mcpServers,
    };
    files.push(["preset.json", JSON.stringify(preset, null, 2) + "\n"]);
    files.push(["kimi.plugin.json", JSON.stringify(plugin, null, 2) + "\n"]);
    for (const [rel, content] of files) {
      writeFileSync(join(dir, rel), content, "utf8");
    }
    return files.map(([rel]) => rel);
  }

  mkdirSync(join(dir, "skills", `${id}-best-practices`), { recursive: true });
  mkdirSync(join(dir, "agents"), { recursive: true });
  if (shape === "skill") mkdirSync(join(dir, "hooks"), { recursive: true });
  if (shape === "command") mkdirSync(join(dir, "commands"), { recursive: true });

  const preset = {
    id,
    name,
    description,
    tags: tags.length ? tags : ["stack"],
    version: "1.0.0",
    hooks: shape === "skill" ? [{ event: "PreToolUse", matcher: "Bash", script: "protect-main.mjs", timeout: 5 }] : [],
  };
  const plugin: Record<string, unknown> = {
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
  };
  if (shape === "skill") {
    plugin.hooks = [{ event: "PreToolUse", matcher: "Bash", command: "node ./hooks/protect-main.mjs", timeout: 5 }];
  }

  files.push(["preset.json", JSON.stringify(preset, null, 2) + "\n"]);
  files.push(["kimi.plugin.json", JSON.stringify(plugin, null, 2) + "\n"]);
  files.push([
    `skills/${id}-best-practices/SKILL.md`,
    `---\nname: ${id}-best-practices\ndescription: ${name} 最佳实践规范,自动加载。\n---\n\n# ${name} 工程规范\n\n当项目包含对应标记文件时,按以下规范行事:\n\n## 结构\n- (补充你的技术栈目录/分层规范)\n\n## 质量\n- (补充命名、类型、性能规范)\n\n## 提交\n- 遵守 protect-main 守卫(默认 hook)\n`,
  ]);
  files.push([
    `agents/${id}-reviewer.md`,
    `---\nname: ${id}-reviewer\ndescription: 严格的 ${name} 代码审查 Agent\nwhenToUse: 审查 ${name} 代码改动时\ntools: Read, Grep, Glob\ndisallowedTools: Bash, Write, Edit\n---\n\n你是严格的 ${name} 代码审查者。你的最后一条消息必须是完整、自包含的审查报告。\n\n按严重度分级输出:\`[P0 必须修]\` / \`[P1 建议修]\` / \`[P2 可忽略]\`。\n\n(补充审查重点)\n`,
  ]);

  if (shape === "skill") {
    // protect-main 从真实项目目录读取(避免测试 mock 影响)
    const protectMainSource = join(projectRoot, "presets", "core", "hooks", "protect-main.mjs");
    if (!existsSync(protectMainSource)) {
      throw new Error("core/hooks/protect-main.mjs not found — run npm run build:hooks first");
    }
    files.push(["hooks/protect-main.mjs", readFileSync(protectMainSource, "utf8")]);
  }
  if (shape === "command") {
    files.push([
      `commands/${id}-report.md`,
      `---\ndescription: ${name} 相关的一份汇总报告\n---\n\n(补充这条 slash 命令的具体产出要求,如需读取哪些文件/数据、汇总口径、提醒阈值等)\n`,
    ]);
  }

  for (const [rel, content] of files) {
    writeFileSync(join(dir, rel), content, "utf8");
  }
  return files.map(([rel]) => rel);
}
