# kimi-boost 竞品深度比较(2026-08)

> 数据抓取自 GitHub API(star 数为当次抓取值)。

## 1. 竞品全景

按"解决什么问题"分四类:

| 类别 | 代表项目 | star | 定位 |
|---|---|---|---|
| **配置/插件合集(静态)** | fcakyon/claude-codex-settings | 1076 | Claude/Codex/Cursor/Gemini 四工具的插件合集,含 Kimi/MiniMax/GLM API 支持;32 个 plugin |
| **单功能增强插件** | YD-233/kimi-usage | 13 | token 用量+缓存命中率显示在终端标题栏 |
| | arsfy/kimi-code-statusbar-plugin | 5 | TUI 状态栏额外指标(TPS/plan 用量) |
| **跨模型委派** | linxule/kimi-plugin-cc | 33 | Claude Code 插件,委派本地 Kimi 做 review/rescue |
| | luanmorenommaciel/kimi-plugin-cc | 9 | Kimi for Claude Code |
| | winmin/codex-plugin-kimi-code | 7 | Codex ↔ Kimi 互委派 |
| **多 agent 编排 / skill 聚合** | null0xxx/kimi-atlas | 14 | 115 个官方 skill 打包 + 多 agent 编排 + 确定性验证门 |
| **官方平台** | MoonshotAI/kimi-code | 6859 | 官方本体:内置 skills/plugins/agents/hooks + 官方插件(Datasource/WebBridge/ComputerUse) |

kimi-boost(★0,npm 0.2.1)属于"**增强工作流预设 + 安装器 + 市场**"——本表内无直接同形态对手。

## 2. 功能矩阵

| 能力 | kimi-boost | claude-codex-settings | kimi-usage 等单功能 | kimi-atlas | 官方 |
|---|---|---|---|---|---|
| 一键安装 | ✅ `npx install` 交互选预设 | ❌ 手动 `plugin marketplace add` + 逐个 install | 半(手动装插件) | 半(克隆+脚本) | ✅ /plugins |
| 一键更新 | ✅ update(--repo 支持 fork) | ❌ 无(手动) | ❌ | ❌ | ✅ 官方市场 |
| 配置安全(备份/可预览/诊断) | ✅ 备份+--dry-run+doctor+白名单 | ❌ | ❌ | ❌ | ❌ |
| **保留用户注释(文本级编辑)** | ✅ 独家 | ❌ 覆盖式 | n/a | ❌ | n/a |
| 跨工具适配 | ✅ Kimi/Claude/Codex | ✅ Claude/Codex/Cursor/Gemini(4 个) | ❌ | 仅 Kimi | 仅 Kimi |
| 工作流预设(组合 skills+hooks+agents) | ✅ 核心 | ⚠️ 插件内含,但需逐个启用 | ❌ | ⚠️ 编排层 | ⚠️ 官方插件 |
| 兼容官方 /plugins marketplace | ✅(预设即 kimi.plugin.json + Release 自动打包) | ❌(走各工具官方市场,非 Kimi) | ✅ 是官方插件 | ❌ | — |
| 内容规模 | 3 预设(精) | 32 插件(全) | 1 功能 | 115 skills(打包) | 3 官方插件 |
| Windows 验证 | ✅ CI 双平台 | ⚠️ 未验证 | ⚠️ | ❌ | ✅ |
| 测试覆盖 | 27 单测+CI | 无 | 无 | 有(验证 harness) | 内部 |

## 3. 逐竞品深析

### fcakyon/claude-codex-settings(★1076,最强竞品)
- **优势**:内容量大(32 插件)、跨 4 工具、被 awesome-claude-code 收录、有维护热度(今日仍在 push)。
- **本质**:高质量的**静态内容合集**,寄生各工具官方插件机制;体验=手动 add marketplace → 手动 install → 手动维护。
- **短板**(kimi-boost 的机会):
  1. 非 Kimi 专属,叙事重心在 Claude/Codex/Cursor,Kimi 只是"API 支持"之一
  2. 无更新/诊断/备份/预览机制
  3. 用户手动安装 → 配置变更无审计、无回滚
  4. 覆盖式写入,不动用户注释是它的死穴
- **威胁**:若它后续给仓库加一个 installer,形态会撞车。但它的 32 插件是"单个功能插件"而非"技术栈预设",定位仍有差异。

### kimi-usage / statusbar-plugin(★5~13)
- 单功能(用量/状态栏),与 kimi-boost 无直接竞争;但证明"Kimi 用户关心成本/用量"是真需求。
- **启示**:kimi-boost 的 roadmap(成本守卫 hooks)可吸收该需求,做成预设级能力。

### kimi-plugin-cc 系(★7~33)
- 跨模型委派(用 Kimi 审 Claude 的活),是"多模型协作"方向;kimi-boost 不与之竞争,但 agent 预设未来可集成"用其他模型审"的能力。

### kimi-atlas(★14,2026-07 新出现)
- 方向接近 kimi-boost 的"skill 聚合",但形态不同:多 agent 编排 + 115 个**vendored 官方 skill** + 确定性验证门。
- **威胁点**:它把"官方 skill 一键引入"做成卖点;但它是"编排器"不是"安装器+更新+市场",且依赖 vendored 内容(维护重)。
- **应对**:kimi-boost 强调"活的机制 + 社区 PR 生态 + 跨工具",而非静态打包。

### 官方 MoonshotAI/kimi-code(★6859)
- 平台级:内置 skills/plugins/agents/hooks 机制 + 3 个官方插件(Datasource/WebBridge/ComputerUse)+ 官方 marketplace。
- **不是直接竞品,而是生态基础**:kimi-boost 寄生其上、与之互补(官方不会做"技术栈工作流预设合集",那正是第三方空间)。
- **风险**:官方未来若自出预设功能,会挤压;对策=做官方不会做的事(跨工具、社区 PR 驱动、技术栈深度预设)。

## 4. kimi-boost 的差异化护城河

1. **形态唯一**:本表内唯一"安装器+更新器+诊断器+市场"的活工具(其余是静态合集/单功能插件)。
2. **配置安全独家**:文本级编辑保留注释、自动备份、--dry-run、doctor、白名单——竞品全无。
3. **跨工具适配**:同一预设三端翻译(Kimi/Claude/Codex),agent 文件官方确认跨工具兼容。
4. **官方生态互补**:预设=合法 kimi.plugin.json,tag 后自动出 zip 市场,零成本接入 /plugins。
5. **可验证**:27 单测 + CI 双平台 + 预设 schema 校验(竞品基本无测试)。

**当前短板**:star 少、预设仅 3 个、社区生态未起、Windows 无实机(仅 CI)。

## 5. 威胁与应对

| 威胁 | 概率 | 应对 |
|---|---|---|
| fcakyon 加 installer 撞形态 | 中 | 靠"中文社区+技术栈预设深度+安全机制"差异化;预设内容社区 PR 驱动,先发注册关键生态位 |
| kimi-atlas 类 skill 打包竞争 | 中 | 强调"活的更新+跨工具+市场"而非静态打包;合作而非对抗(可吸收其 skill 索引思路) |
| 官方自出预设 | 低 | 做官方不会做的:跨工具、社区驱动、技术栈深度 |
| 内容被抄 | 高(开源必然) | 护城河在机制与生态,不在内容;保持更新节奏与社区活跃 |

## 6. 结论

kimi-boost 与现有竞品**形态不重叠**:竞品要么是静态内容合集(靠数量),要么是单功能插件(靠单一痛点),要么是编排器(靠架构)。kimi-boost 是唯一把"预设(内容)+ 安装/更新/诊断(机制)+ 跨工具 + 官方市场兼容(生态)"做成一体的项目。真正的竞争不是某个现有项目,而是**时间窗口**——趁 Kimi 生态早期抢占"技术栈工作流"心智,同时补足预设数量与社区。
