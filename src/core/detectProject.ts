import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * 项目技术栈探测:扫描项目根目录的标记文件,推断匹配的 preset。
 * 纯函数、只读、无副作用,可独立单测。v1 只看项目根,不递归 monorepo 子包。
 */

export interface ProjectSignal {
  /** preset id */
  id: string;
  /** 人类可读依据,如 "go.mod" 或 "package.json 依赖: next" */
  evidence: string;
}

/** 单文件/多文件标记 → preset。全部采集,支持多技术栈 monorepo。 */
const MARKER_RULES: Array<{ files: string[]; id: string }> = [
  { files: ["pages.json"], id: "uniapp" },
  { files: ["project.config.json"], id: "weapp" },
  { files: ["go.mod"], id: "go" },
  { files: ["Cargo.toml"], id: "rust" },
  { files: ["pubspec.yaml"], id: "flutter" },
  { files: ["pom.xml", "build.gradle", "build.gradle.kts"], id: "java" },
];

/** package.json 依赖 → preset。按序取首个匹配(next 优先于 react,避免 nextjs 项目重复命中)。 */
const NODE_DEP_RULES: Array<{ dep: string; id: string }> = [
  { dep: "next", id: "nextjs" },
  { dep: "react-native", id: "react-native" },
  { dep: "@nestjs/core", id: "nestjs" },
  { dep: "vue", id: "vue3" },
  { dep: "react", id: "react" },
  { dep: "express", id: "express" },
];

/** Python 项目标记文件;存在时读取文本判断是否 fastapi。 */
const PYTHON_MARKERS = ["requirements.txt", "pyproject.toml", "setup.py", "Pipfile"];

function readJson(path: string): Record<string, unknown> | undefined {
  try {
    return JSON.parse(readFileSync(path, "utf8")) as Record<string, unknown>;
  } catch {
    return undefined;
  }
}

/** 汇总 package.json 的 dependencies + devDependencies 依赖名;文件缺失/非法时返回空集。 */
function nodeDeps(root: string): Set<string> {
  const pkg = readJson(join(root, "package.json"));
  if (!pkg) return new Set();
  const deps = new Set<string>();
  for (const key of ["dependencies", "devDependencies"] as const) {
    const section = pkg[key];
    if (section && typeof section === "object") {
      for (const name of Object.keys(section)) deps.add(name);
    }
  }
  return deps;
}

function pythonSignal(root: string): ProjectSignal | undefined {
  const marker = PYTHON_MARKERS.find((f) => existsSync(join(root, f)));
  if (!marker) return undefined;
  let text = "";
  try {
    text = readFileSync(join(root, marker), "utf8");
  } catch {
    /* 读取失败按普通 python 处理 */
  }
  if (/\bfastapi\b/i.test(text)) return { id: "fastapi", evidence: `${marker} 含 fastapi` };
  return { id: "python", evidence: marker };
}

export function detectProjectPresets(root: string): ProjectSignal[] {
  const signals: ProjectSignal[] = [];

  for (const rule of MARKER_RULES) {
    const hit = rule.files.find((f) => existsSync(join(root, f)));
    if (hit) signals.push({ id: rule.id, evidence: hit });
  }

  const deps = nodeDeps(root);
  for (const rule of NODE_DEP_RULES) {
    if (deps.has(rule.dep)) {
      signals.push({ id: rule.id, evidence: `package.json 依赖: ${rule.dep}` });
      break; // 首个匹配即停
    }
  }

  const py = pythonSignal(root);
  if (py) signals.push(py);

  // 去重(同一 preset 被多条规则命中时只保留首个依据)
  const seen = new Set<string>();
  return signals.filter((s) => (seen.has(s.id) ? false : (seen.add(s.id), true)));
}
