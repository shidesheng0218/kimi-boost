# 官方 Curated 收录申请文案

渠道优先级:① Kimi Code 飞书交流群(直接 @ 官方同学)② support@moonshot.cn 邮件(附账号 ID)

## 飞书群短版

> 官方同学好,想申请把我们的开源插件系列 kimi-boost 收录进 /plugins 的 Curated 栏。
>
> 形态与现有 Curated(superpowers / vercel-plugin)完全一致:单插件独立仓库 + 根目录 kimi.plugin.json,当前 5 个:
>
> - https://github.com/shidesheng0218/kimi-boost-vue3
> - https://github.com/shidesheng0218/kimi-boost-react
> - https://github.com/shidesheng0218/kimi-boost-go
> - https://github.com/shidesheng0218/kimi-boost-python
> - https://github.com/shidesheng0218/kimi-boost-usage
>
> 质量保障:主仓 CI 会把全部 16 个预设实装进真实 Kimi Code CLI 验证(每个 PR + 每周定期,防上游格式漂移),5 个镜像仓由 CI 自动同步、只读。
>
> 用户价值:技术栈最佳实践 skill(自动加载)、代码审查 subagent、安全 hook(main 分支保护/危险命令拦截,fail-open)、用量监控。安装后零配置生效。
>
> 主仓:https://github.com/shidesheng0218/kimi-boost (npm: kimi-boost)。如需调整任何格式/规范,我们随时配合。

## 邮件完整版

**主题:申请收录 Curated:kimi-boost 插件系列(5 个单插件仓库)**

Kimi Code 团队好,

我们是 kimi-boost 的作者,一个面向 Kimi Code(兼 Claude Code / Codex)的开源预设与插件项目,申请将我们的旗舰插件收录至 `/plugins` 面板的 Curated 栏。

**为什么适合 Curated**

1. **形态对齐**:每个插件都是独立仓库 + 根目录 `kimi.plugin.json`,与现有 Curated 插件(superpowers、vercel-plugin、modern-web-guidance)结构完全一致,`/plugins install <repo-url>` 即装即用。
2. **质量可验证**:主仓 CI 在 PR 和每周定时任务中,通过 `kimi web` REST API 把全部 16 个预设实装进真实 Kimi Code CLI,断言 `state:ok` 且无诊断;官方 manifest 有任何格式变化我们会第一时间修复。
3. **持续维护**:镜像仓由主仓 CI 自动同步(subtree split)、只读;issue 响应和版本迭代都在主仓进行。

**插件清单(首批 5 个)**

| 仓库 | 内容 |
|---|---|
| [kimi-boost-vue3](https://github.com/shidesheng0218/kimi-boost-vue3) | Vue 3 + TS 最佳实践 skill、vue3-reviewer 审查 agent、main 分支保护 hook |
| [kimi-boost-react](https://github.com/shidesheng0218/kimi-boost-react) | React + TS 同上组合 |
| [kimi-boost-go](https://github.com/shidesheng0218/kimi-boost-go) | Go 工程化规范 + 审查 + 分支保护 |
| [kimi-boost-python](https://github.com/shidesheng0218/kimi-boost-python) | Python 规范 + 审查 + 危险命令拦截 |
| [kimi-boost-usage](https://github.com/shidesheng0218/kimi-boost-usage) | 会话/提示/工具调用用量统计与每日阈值提醒 |

**设计原则**

- 零配置生效:skill 自动加载,hook 全部 fail-open(退出码 0 放行 / 2 拦截),绝不阻塞用户工作
- 安全:不读写插件自身目录以外的任何文件,不含网络外发

**链接**

- 主仓:https://github.com/shidesheng0218/kimi-boost
- npm:https://www.npmjs.com/package/kimi-boost
- 联系:<你的邮箱> / GitHub @shidesheng0218

如需对插件格式、描述或功能做任何调整,我们随时配合。期待收录,也欢迎任何形式的反馈。

祝好,
kimi-boost 作者
