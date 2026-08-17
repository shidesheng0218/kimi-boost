<div align="center">

# kimi-boost

**一条命令,让你的 AI 编程助手瞬间获得完整开发工作流。**

把久经实战检验的 **Skills · Hooks · Agents** 一键装进 **Kimi Code**、Claude Code 和 Codex CLI。

`npx kimi-boost install` → 选一个预设 → 完成。

</div>

---

## 为什么需要它

AI 编程助手只会做你教它的事。不加以引导,它会写出泛泛的代码、直接推 main 分支、对你还想保留的文件执行 `rm -rf`。手动配置 skills / hooks / agents 要花几个小时——大多数人永远不会去做。

**kimi-boost** 几秒钟内把完整、有主张的开发工作流装进你的助手:

- **Skills** — 自动加载,教助手你的技术栈最佳实践
- **Hooks** — 跨平台 `node` 守卫(危险命令拦截、main 分支保护)
- **Agents** — 现成的代码审查 subagent,助手可以直接委派

## 快速开始

```bash
npx kimi-boost install
# ✔ vue3 — Vue 3 + TypeScript
# ✔ weapp — 微信小程序
# ✔ python — Python 工程化
```

交互式选择,结束。下一个会话立即生效。

> 需要 [Kimi Code](https://www.kimi.com/code/docs/kimi-code-cli/guides/getting-started.html)、Claude Code 或 Codex CLI。支持 macOS、Windows、Linux。

## 预设

| 预设 | 技术栈 | 包含内容 |
|---|---|---|
| `vue3` | Vue 3 + TypeScript | 最佳实践 skill · 审查 agent · **main 分支推送保护 hook** |
| `weapp` | 微信小程序 | 目录/分包/性能/安全规范 · 审查 agent |
| `python` | Python | PEP 8 + 类型标注 skill · 审查 agent · **危险命令拦截 hook** |

## 命令

| 命令 | 作用 |
|---|---|
| `kimi-boost install [preset]` | 安装预设(`--dry-run` 预览,`--with-hooks` 强制 hooks) |
| `kimi-boost list` | 查看可用/已安装预设 |
| `kimi-boost remove <preset>` | 干净卸载 |
| `kimi-boost update [--repo owner/repo]` | 从 registry 拉取最新版本并重新应用(支持 fork 仓库) |
| `kimi-boost marketplace` | 生成 Kimi Code 自定义 marketplace JSON |
| `kimi-boost doctor [--fix]` | 诊断配置语法/hooks/挂载目录/一致性(--fix 自动修复) |
| `kimi-boost status` | 检测已安装 CLI 与平台 |

## 同时也是插件市场

Kimi Code 自带原生插件系统(`/plugins`)。kimi-boost 同时充当它的**第三方 marketplace**:

```bash
kimi-boost marketplace
# 终端执行: /plugins marketplace https://raw.githubusercontent.com/shidesheng0218/kimi-boost/main/marketplace.json
# 或环境变量: export KIMI_CODE_PLUGIN_MARKETPLACE_URL=<同一地址>
```

每个预设同时也是合法的 `kimi.plugin.json` 插件——可用 `/plugins install` 安装,manifest 中声明了 skills、agents、hooks 与 MCP servers。

## 工作原理

- **Kimi Code** — 文本级编辑 `~/.kimi-code/config.toml`(managed 区块 + 原位数组合并),**用户注释与格式原样保留**;agent 文件遵循原生 frontmatter 格式(按官方文档与 Claude Code / OpenCode agent 文件互兼容)
- **Hooks 是纯 Node `.mjs`** — 与 Kimi Code 官方文档示例一致,macOS / Windows / Linux 行为完全相同
- **Fail-open 设计** — hook 崩溃永远不会阻塞你的工作(退出码 `0` 放行 · `2` 阻断)
- **默认安全** — 每次修改前自动备份配置到 `<config>.kboost.bak`
- **幂等** — 重装/更新绝不产生重复条目

## 贡献

预设目录由 PR 驱动:在 `presets/` 下新增目录,CI 自动校验 schema、hook 事件与文件存在性。见 [CONTRIBUTING.md](CONTRIBUTING.md)。

## 路线图

- [ ] Claude Code + Codex 适配器(agent 文件已天然兼容)
- [ ] MCP server 预设
- [ ] token/成本用量守卫 hooks
- [ ] 项目级(`.kimi-boost/`)预设

## 协议

MIT
