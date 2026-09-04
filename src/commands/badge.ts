import pc from "picocolors";

/**
 * badge 命令:生成可贴到项目 README 的 shields.io 徽章 markdown。
 * 使用者的 README 由此成为 kimi-boost 的传播渠道。
 */

const REPO_URL = "https://github.com/shidesheng0218/kimi-boost";

function escapeShield(text: string): string {
  // shields.io 静态徽章转义:- 要写成 --,_ 写成 __,空格写成 _
  return text.replace(/-/g, "--").replace(/_/g, "__").replace(/ /g, "_");
}

/** 徽章 markdown;preset 存在时展示"使用的 preset" */
export function badgeMarkdown(preset?: string): string {
  const message = encodeURIComponent(escapeShield(preset ? `preset: ${preset}` : "powered"));
  const badge = `https://img.shields.io/badge/kimi--boost-${message}-7c3aed`;
  return `[![kimi-boost](${badge})](${REPO_URL})`;
}

export function runBadge(preset?: string): void {
  const md = badgeMarkdown(preset);
  console.log(md);
  console.log("");
  console.log(pc.dim("把上面这行贴到你的 README 顶部,展示这个项目用 kimi-boost 管理 AI 编码工作流。"));
  if (!preset) {
    console.log(pc.dim("提示:`kimi-boost badge <preset>` 可生成带 preset 名的徽章,如 `kimi-boost badge go`。"));
  }
}
