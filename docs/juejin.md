# 我把 Kimi Code 的「配置地狱」,做成了一条命令 | kimi-boost 开源

> 一句话:一个命令行工具,把 skills + hooks + agents 一键装进 Kimi Code / Claude Code / Codex,还附赠插件市场。

---

## 先说我的痛点

用终端型 AI 编程助手(Kimi Code、Claude Code、Codex 这类)久了,你一定遇到过这些瞬间:

- 它兴致勃勃地 `git push` 到 `main` 分支,你差点心梗
- 它执行 `rm -rf` 时从不犹豫,你只能祈祷路径没写错
- 它写的代码永远"能用但不对味"——不遵循你的技术栈规范
- 你想教它:写 SKILL.md、配 hooks、调 agents……**然后就没有然后了**

手动配置到底有多劝退?

> 读官方文档 → 研究 SKILL.md 格式 → 配 hooks → 写 review agent → 调 MCP → 试错 3 小时 → 放弃,回到"裸奔"状态。

而且更扎心的是:大部分配置仓库给你的是**一堆静态文件**,你要自己复制、自己粘贴、自己维护,版本更新了也不自知。

所以我决定把它做成一个**工具**而不是"文件包"。

---

## 它是谁:kimi-boost

[kimi-boost](https://github.com/shidesheng0218/kimi-boost) 是一个开源的 CLI(MIT 协议),核心就一句话:

> **一条命令,把久经实战的 skills / hooks / agents 装进你的 AI 编程助手。**

支持三个工具:Kimi Code、Claude Code、Codex CLI。

```bash
npx kimi-boost install
```

然后你会看到:

```text
✔ 选择一个预设:
    python — Python 工程化
  > vue3 — Vue 3 + TypeScript
    weapp — 微信小程序

✓ [kimi] 已安装预设 'vue3' 到 Kimi Code
  config.toml[extra_skill_dirs], config.toml[extra_agent_dirs], config.toml[[hooks]] (+1)
  Run /reload or start a new session.
```

结束。下一个会话立即生效。

![kimi-boost 演示](https://github.com/shidesheng0218/kimi-boost/raw/main/assets/demo.gif)

---

## 装上之后你得到什么

以 `vue3` 预设为例,你一次获得三样东西:

| 组件 | 作用 |
| --- | --- |
| 🧠 **Skill** | 助手**自动加载**的 Vue3 组合式 API / props 类型 / 状态管理 / 性能规范,不用你每次提醒 |
| 🔍 **Reviewer Agent** | 一个只读的代码审查 subagent,助手会委派它做提交前审查(`vue3-reviewer`) |
| 🛡️ **Hook** | 跨平台 Node 守卫:**拦截直接 push 到 main/master** |

`python` 预设还带**危险命令拦截**(`rm -rf`、`curl | sh`、`mkfs` 等直接阻断)。

每个预设 = 一个目录,既是 kimi-boost 预设,也是合法的 `kimi.plugin.json` 插件:

```text
presets/<id>/
├── preset.json          # kimi-boost 元数据
├── kimi.plugin.json     # Kimi Code 插件 manifest(原生 marketplace 形态)
├── skills/<name>/SKILL.md
├── agents/<name>-reviewer.md
└── hooks/<name>.mjs     # 跨平台 Node,fail-open 设计
```

---

## 它和"配置文件合集"有什么不同

市面上(包括很多几百 star 的项目)大多是**静态配置仓库**——你得手动 `plugin marketplace add`、手动逐条安装、手动保持更新。

kimi-boost 选择做一个**活的工具**,几个关键差异:

### 1. 只动你自己的那一段,注释全保留

这是我最满意的一点。Kimi Code 的配置是 `~/.kimi-code/config.toml`,我最初用 TOML 解析后整文件写回——**用户手写的注释全被抹掉了**,这不可接受。

后来改成**文本级增量编辑**:

- hooks 只追加到 `# >>> kimi-boost managed >>>` 标记区块内
- `extra_skill_dirs` / `extra_agent_dirs` 用正则定位原数组、原位合并
- **你手写的注释、顺序、格式,一个字节都不动**

```toml
# 这是你自己写的注释,会被原样保留
extra_skill_dirs = [ "/Users/you/.kimi-boost/skills" ]

# >>> kimi-boost managed >>>
[[hooks]]
event = "PreToolUse"
command = "node \"/Users/you/.kimi-boost/hooks/vue3/protect-main.mjs\""
matcher = "Bash"
timeout = 5
# <<< kimi-boost managed <<<
```

### 2. 默认安全,想删都删不掉不该删的

- 每次修改前自动备份:`<config>.kboost.bak`
- **受管目录白名单**:拒绝删除 `~/.kimi-boost`、`~/.kimi-code`、`~/.claude`、`~/.codex` 之外的任何路径
- hooks 全部 **fail-open**:脚本崩了也绝不阻塞你的工作
- **双通道防重**:如果你已经用 Kimi 官方 `/plugins` 装过同款,`install` 会自动跳过重复 hooks(除非 `--with-hooks` 强制)

### 3. 跨平台、跨工具

- hooks 全部用 **Node `.mjs`** 实现(和 Kimi 官方文档示例同款),macOS / Windows / Linux 行为完全一致——这是 CI 里加了 Windows 矩阵跑出来的
- 同一个预设,一份内容,三个 adapter 各自翻译成 Kimi / Claude / Codex 的原生格式
- Agent 文件遵循原生 frontmatter 格式(官方文档确认与 Claude Code / OpenCode 兼容),天然跨工具

### 4. 可诊断、可预览、可更新

```bash
# 先看这次会改什么(零副作用)
kimi-boost install vue3 --dry-run

# 诊断环境:配置语法、hook 脚本健康、挂载目录、清单一致性
kimi-boost doctor
# ✓ kimi: detected (version 0.36.1)
# ✓ kimi: config.toml parses
# ✓ kimi: hook script valid
# 1 warning(s), no errors

# 自动修复缺失的目录和 hook 脚本
kimi-boost doctor --fix

# 一键更新所有已装预设(支持 fork 仓库)
kimi-boost update --repo 你的用户名/kimi-boost
```

### 5. 还能当插件市场用

Kimi Code 有原生插件系统(`/plugins`)。kimi-boost 直接兼容:

```bash
kimi-boost marketplace
# 终端执行:
# /plugins marketplace https://raw.githubusercontent.com/shidesheng0218/kimi-boost/main/marketplace.json
```

每个预设都可用 `/plugins install` 直接安装。打了 tag 之后,GitHub Action 还会自动把每个预设打成 zip 挂到 Release,并生成指向 zip 的 marketplace——全自动。

---

## 架构长这样

![kimi-boost 架构图](https://mermaid.ink/img/Zmxvd2NoYXJ0IFRECiAgICBLQlsiPGI-a2ltaS1ib29zdCBDTEk8L2I-PGJyLz48aT5pbnN0YWxsIMK3IHJlbW92ZSDCtyBkb2N0b3IgwrcgdXBkYXRlIMK3IG1hcmtldHBsYWNlPC9pPiJdCiAgICBSRUdbInByZXNldHMvIHJlZ2lzdHJ5PGJyLz4oc2tpbGxzIMK3IGFnZW50cyDCtyBob29rcykiXQoKICAgIEtCIC0tPnx3cml0ZXN8IEtJWyJraW1pIGFkYXB0ZXI8YnIvPih0ZXh0LWxldmVsIGNvbmZpZyBlZGl0aW5nKSJdCiAgICBLQiAtLT58d3JpdGVzfCBDQ1siY2xhdWRlIGFkYXB0ZXI8YnIvPihtYW5pZmVzdC1kcml2ZW4pIl0KICAgIEtCIC0tPnx3cml0ZXN8IENYWyJjb2RleCBhZGFwdGVyPGJyLz4obWFuaWZlc3QtZHJpdmVuKSJdCgogICAgS0kgLS0-IEtDRlsifi8ua2ltaS1jb2RlL2NvbmZpZy50b21sIl0KICAgIENDIC0tPiBDQ1NbIn4vLmNsYXVkZS9zZXR0aW5ncy5qc29uIl0KICAgIENYIC0tPiBDWENbIn4vLmNvZGV4L2NvbmZpZy50b21sIl0KCiAgICBLQ0YgLS0-IEJPT1NUMVsiIyA-Pj4ga2ltaS1ib29zdCBtYW5hZ2VkID4-Pjxici8-ZXh0cmFfc2tpbGxfZGlycyDCtyBbW2hvb2tzXV0iXQogICAgQ0NTIC0tPiBCT09TVDJbImhvb2tzIMK3IHNraWxscy88aWQ-LyDCtyBhZ2VudHMvKi5tZCJdCiAgICBDWEMgLS0-IEJPT1NUM1siW1tob29rcy5FdmVudF1dIMK3IHNraWxscy88aWQ-LyJdCgogICAgUkVHIC0tPnxpbnN0YWxscyAvIHVwZGF0ZXN8IEtCCiAgICBLQiAtLT58YnVpbGRzfCBNS1RbIm1hcmtldHBsYWNlLmpzb248YnIvPih0cmVlIG9yIHJlbGVhc2UtemlwIHNvdXJjZXMpIl0KICAgIE1LVCAtLT58Ii9wbHVnaW5zIG1hcmtldHBsYWNlInwgS0lNSV9QTFVHSU5TWyJLaW1pIENvZGUgL3BsdWdpbnMiXQoKICAgIGNsYXNzRGVmIGNsaSBmaWxsOiM3YzNhZWQsY29sb3I6I2ZmZixmb250LXdlaWdodDpib2xkOwogICAgY2xhc3NEZWYgdG9vbCBmaWxsOiMxZTI5M2IsY29sb3I6I2UyZThmMDsKICAgIGNsYXNzRGVmIG91dCBmaWxsOiMwNjRlM2IsY29sb3I6I2E3ZjNkMDsKICAgIGNsYXNzIEtCLFJFRyBjbGk7CiAgICBjbGFzcyBLSSxDQyxDWCB0b29sOwogICAgY2xhc3MgS0NGLENDUyxDWEMgb3V0Owo)

---

## 接下来会做什么

- **MCP server 预设**(数据库 / 浏览器 / 内部工具)
- **token / 成本用量守卫 hooks**
- **项目级(`.kimi-boost/`)预设**
- **更多技术栈预设**(Flutter / Go / React / uni-app …)

预设的优先级由社区投票决定——你现在就可以在 [issue #1](https://github.com/shidesheng0218/kimi-boost/issues/1) 投出你想要的技术栈。

---

## 结尾(附上你想要的链接)

- 项目地址:[github.com/shidesheng0218/kimi-boost](https://github.com/shidesheng0218/kimi-boost) ⭐
- npm:[kimi-boost@0.2.1](https://www.npmjs.com/package/kimi-boost) —— `npx kimi-boost install`
- 需求投票:[issue #1](https://github.com/shidesheng0218/kimi-boost/issues/1)

如果你想加一个新预设,欢迎直接提 PR——**每个预设就是 `presets/` 下一个目录**,CI 会自动校验 schema、hook 事件和文件存在性,贡献门槛极低。

如果你觉得这个工具帮到了你,欢迎点个 Star;也欢迎告诉我你踩过的"AI 助手翻车现场",说不定就是下一个预设的灵感。

---

*MIT 协议,欢迎 fork、欢迎二次开发、欢迎提 issue 拍砖。*
