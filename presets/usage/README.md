# 用量守卫（kimi-boost-usage）

会话/提示/工具调用用量统计与每日阈值提示(KIMI_BOOST_DAILY_LIMIT)。

## 安装

**Kimi Code CLI**（TUI 内）：

```
/plugins install https://github.com/shidesheng0218/kimi-boost-usage
```

或用安装器（支持 Kimi Code / Claude Code / Codex 三端）：

```bash
npx kimi-boost install usage
```

安装后在 TUI 运行 `/reload` 或开新会话生效。

## 包含

- **Hooks**：`hooks/`

## 说明

本仓库是 [kimi-boost](https://github.com/shidesheng0218/kimi-boost) monorepo 的**只读镜像**，由 CI 从 `presets/usage/` 自动同步，请勿直接提 PR；贡献请到主仓库。MIT License。
