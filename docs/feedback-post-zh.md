# 发布文案(中文,v0.6.0 版)

发布渠道:V2EX(节点:程序员 / 分享创造)、Kimi 官方开发者群、即刻、知乎想法。

## V2EX 完整版

标题:**[开源] kimi-boost v0.6.0:Kimi Code 官方 /plugins 渠道直接装了,一条命令配好 AI 编程助手的开发工作流**

正文:

---

用 Kimi Code / Claude Code / Codex 这类终端 AI 编程助手的同学,你们有没有这种感受:

默认配置"能用,但不够强"。不教它,它就会:

- 写泛泛的、不符合你团队规范的代码
- 直接 `git push` 到 main 分支
- 执行 `rm -rf` 时从不犹豫
- 完全没有代码审查意识,改了也不测

手动配置又很繁琐:SKILL.md、hooks、agents、MCP…… 官方文档一份份啃,配完就再也不想动了。

**kimi-boost 就是来解决这个的**:把一套完整的、有主见的开发工作流(技术栈规范 skill + 代码审查 subagent + 安全 hook)一条命令装好。

### v0.6.0 的新东西:官方插件渠道直连

五个旗舰预设已经镜像成独立插件仓库,**不用装我们的 CLI**,在 Kimi Code TUI 里直接:

```
/plugins install https://github.com/shidesheng0218/kimi-boost-vue3
```

现有镜像仓:vue3 / react / go / python / usage(用量监控)。也可以接入我们的市场源,在 `/plugins` 面板里浏览:

```bash
export KIMI_CODE_PLUGIN_MARKETPLACE_URL=https://raw.githubusercontent.com/shidesheng0218/kimi-boost/main/marketplace.json
```

### 完整 16 个预设,一个 CLI 装三端

```bash
npx kimi-boost install
```

- 预设覆盖:vue3 / react / nextjs / react-native / flutter / uniapp / weapp(小程序)/ nestjs / express / fastapi / go / rust / java / python + usage(用量监控)+ mcp-tools(零配置 MCP)
- 同一个安装器支持 **Kimi Code / Claude Code / Codex CLI** 三端
- 配置改动前自动备份、只动受管区块、hook 全部 fail-open(崩了也不阻塞你)

### 质量是测出来的

CI 会把全部 16 个预设**实装进真实的 Kimi Code CLI** 逐个验证(每个 PR + 每周定期),manifest 有任何官方格式漂移会立刻报警。

---

**你的回复就是下一批预设的优先级。** 想要什么技术栈/功能,评论或到仓库提 issue:

- 主仓:https://github.com/shidesheng0218/kimi-boost
- npm:`npx kimi-boost install`

## Kimi 官方开发者群短版

> kimi-boost v0.6.0 更新:五个旗舰预设(vue3/react/go/python/usage)现在可以直接用官方 `/plugins install` 安装了,不用装任何额外工具,比如 `/plugins install https://github.com/shidesheng0218/kimi-boost-vue3`。
>
> 完整版是 16 个技术栈预设 + 一个三端安装器(Kimi Code / Claude Code / Codex):`npx kimi-boost install`,一条命令把规范 skill + 审查 agent + 安全 hook 装好。CI 每周把全部预设实装进真实 CLI 验证。
>
> 主仓 https://github.com/shidesheng0218/kimi-boost ,想要什么预设直接提 issue,投票驱动排期。

## 即刻/知乎想法短版

> 用 Kimi Code / Claude Code 的开发者:AI 助手默认配置真的很弱——乱推 main、裸 rm -rf、代码没规范。开源工具 kimi-boost 一条命令把技术栈规范 skill + 代码审查 subagent + 安全 hook 全装好,16 个预设(vue3/react/go/python/小程序/Flutter……),支持三端。
>
> v0.6.0 起旗舰预设还能直接用 Kimi Code 官方 /plugins 安装:`/plugins install https://github.com/shidesheng0218/kimi-boost-vue3`,连 CLI 都不用装。
>
> github.com/shidesheng0218/kimi-boost
