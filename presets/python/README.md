# Python 工程化（kimi-boost-python）

Python 最佳实践:类型标注、测试、依赖管理,外加危险 Shell 命令拦截 hook。

## 安装

**Kimi Code CLI**（TUI 内）：

```
/plugins install https://github.com/shidesheng0218/kimi-boost-python
```

或用安装器（支持 Kimi Code / Claude Code / Codex 三端）：

```bash
npx kimi-boost install python
```

安装后在 TUI 运行 `/reload` 或开新会话生效。

## 包含

- **Agent Skills**：`skills/`
- **Subagents**：`agents/`
- **Hooks**：`hooks/`

## 说明

本仓库是 [kimi-boost](https://github.com/shidesheng0218/kimi-boost) monorepo 的**只读镜像**，由 CI 从 `presets/python/` 自动同步，请勿直接提 PR；贡献请到主仓库。MIT License。
