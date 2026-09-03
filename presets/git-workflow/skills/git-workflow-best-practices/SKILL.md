---
name: git-workflow-best-practices
description: Git 工作流规范:约定式提交、分支命名、PR 大小与描述规范。
---

# Git 工作流规范

适用于所有使用 git 的项目,与技术栈无关。按以下规范行事:

## 提交信息(约定式提交)

- 格式:`<type>(<scope>): <subject>`,`type` 取 `feat`/`fix`/`docs`/`refactor`/`test`/`chore`/`perf`/`style`/`build`/`ci`
- `subject` 用祈使句、小写开头、结尾不加句号、≤72 字符
- 一个提交只做一件事;大改动拆成多个语义化提交
- 提交正文(可选)说明"为什么"而非"是什么";关联 issue 用 `Refs: #123`

## 分支

- 不在 `main`/`master` 上直接开发;用 `feat/xxx`、`fix/xxx`、`chore/xxx` 短生命周期分支
- 分支尽早合入,避免长期分叉;合入后删除

## PR

- 一个 PR 聚焦一个改动,保持小——便于 review 与回滚
- 描述写清:做了什么、为什么、如何验证;关联对应 issue
- 提交前自查 diff:不含调试代码、被注释掉的死代码、与本 PR 无关的改动
