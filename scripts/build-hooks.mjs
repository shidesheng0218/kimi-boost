#!/usr/bin/env node
/**
 * 从 src/hooks-runtime/ 的模板生成各预设的 hooks/*.mjs
 * 每个 hook 模板会注入 guard-runtime.mjs 的内容
 *
 * 用法:
 *   node scripts/build-hooks.mjs          # 生成所有 hook 文件
 *   node scripts/build-hooks.mjs --check  # 仅检查,有漂移则非零退出
 */
import { readFileSync, writeFileSync, readdirSync, existsSync } from "fs";
import { join, dirname, relative } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = join(__dirname, "..");
const runtimeDir = join(projectRoot, "src/hooks-runtime");
const presetsDir = join(projectRoot, "presets");
const check = process.argv.includes("--check");

// 读取 guard runtime
const guardRuntime = readFileSync(join(runtimeDir, "guard-runtime.mjs"), "utf8");

// 每个 hook 模板文件 -> 需要注入 runtime 的预设列表
const hookTemplates = {
  "protect-main-template.mjs": [
    "core", "express", "fastapi", "flutter", "go", "java", "nestjs",
    "nextjs", "python", "react", "react-native", "rust", "security",
    "uniapp", "vue3"
  ],
  "block-dangerous-template.mjs": ["core", "python", "security"],
  "secret-scan-template.mjs": ["core", "security"]
};

let generated = 0;
const drift = [];

for (const [template, presets] of Object.entries(hookTemplates)) {
  const templatePath = join(runtimeDir, template);
  if (!existsSync(templatePath)) {
    console.error(`⚠️  Template not found: ${template}`);
    continue;
  }

  const templateContent = readFileSync(templatePath, "utf8");
  const hookName = template.replace("-template.mjs", ".mjs");

  // 注入 runtime: 替换 {{GUARD_RUNTIME}} 占位符
  const hookContent = templateContent.replace("{{GUARD_RUNTIME}}", guardRuntime.trim());

  for (const preset of presets) {
    const targetDir = join(presetsDir, preset, "hooks");
    const targetPath = join(targetDir, hookName);

    generated++;

    if (check) {
      if (!existsSync(targetPath)) {
        drift.push(relative(projectRoot, targetPath));
      } else {
        const existing = readFileSync(targetPath, "utf8");
        if (existing !== hookContent) {
          drift.push(relative(projectRoot, targetPath));
        }
      }
    } else {
      writeFileSync(targetPath, hookContent, "utf8");
    }
  }
}

if (check) {
  if (drift.length > 0) {
    console.error(`hook runtime drift in ${drift.length} file(s) — run \`npm run build:hooks\`:`);
    for (const f of drift) console.error(`  ${f}`);
    process.exit(1);
  }
  console.log(`✅ Hook runtime in sync (${generated} guard scripts)`);
} else {
  console.log(`✅ Generated ${generated} hook files from ${Object.keys(hookTemplates).length} templates`);
}
