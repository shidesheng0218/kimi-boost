# 需求验证帖(中文)

发布渠道:V2EX(节点:程序员 / 分享创造)、Kimi 官方开发者群、即刻、知乎想法。

## V2EX 完整版

标题:**调研:你希望 Kimi Code / AI 编程助手内置哪些增强?(附开源工具预告)**

正文:

---

用 Kimi Code / Claude Code / Codex 这类终端 AI 编程助手的同学,你们有没有这种感受:

默认配置"能用,但不够强"。不教它,它就会:
- 写泛泛的、不符合你团队规范的代码
- 直接 `git push` 到 main 分支
- 执行 `rm -rf` 时从不犹豫
- 完全没有代码审查意识,改了也不测

手动配置又很繁琐:SKILL.md、hooks、agents、MCP…… 官方文档一份份啃,配完就再也不想动了。

**所以想做个调研,顺便预告一个开源小工具:**

1. **你希望 AI 编程助手默认内置哪些增强?**(优先级排序)
   - A. 技术栈规范 skill(Vue3 / React / 微信小程序 / Python / Go / Flutter…)
   - B. 代码审查 subagent(提交前自动过一遍 review)
   - C. 安全 hook(危险命令拦截,如 `rm -rf`、`curl | sh`)
   - D. Git 工作流(conventional commit、main 分支保护)
   - E. MCP 服务器(数据库 / 浏览器 / 内部工具)
   - F. token 成本监控
   - G. 其他(评论区补充)

2. **哪个技术栈的规范最让你头痛?**(比如"AI 写 Vue 永远不用 `<script setup>`"之类)

3. 如果有个工具能**一条命令**把这些装好、还能一键更新,你会用吗?

---

我们做了个开源工具 **[kimi-boost](https://github.com/shidesheng0218/kimi-boost)**:一条命令把 skills + hooks + agents 装进 Kimi Code / Claude Code / Codex,带交互选择、自动备份、一键更新,还有配套的插件 marketplace。

一期已经上架 npm:

```bash
npx kimi-boost install
```

内置 3 个预设:vue3(组合式 API 规范 + main 分支保护)、weapp(小程序分包/性能/安全)、python(PEP8 + 危险命令拦截)。

**你的回复就是二期预设的优先级。** 想要什么预设/功能,直接评论或到仓库提 issue,都能落地。

---

## Kimi 官方开发者群短版

> 调研:Kimi Code 用户们,你们最想让 Kimi Code 增强什么?技术栈规范 skill / 代码审查 subagent / 危险命令 hook / git 工作流 / MCP / 成本监控?
>
> 我们做了个开源工具 kimi-boost,一条命令把 skills+hooks+agents 装进 Kimi Code,还对接了官方的 /plugins marketplace,想听听大家真实需求,回复即反馈(选项 A~G 见 V2EX 帖),仓库:github.com/shidesheng0218/kimi-boost,欢迎体验和提 PR

## 即刻/知乎想法短版

> 用 Kimi Code / Claude Code 的开发者注意:AI 编程助手默认配置真的很弱——不教它,它乱推 main 分支、裸 rm -rf、代码全无规范。我们做了个开源工具 kimi-boost,`npx kimi-boost install` 一条命令把技术栈规范 skill + 代码审查 subagent + 安全 hook 全装好,支持一键更新和插件市场。一期 3 个预设(Vue3/小程序/Python),想要什么新预设评论区说,我们排期做。github.com/shidesheng0218/kimi-boost
