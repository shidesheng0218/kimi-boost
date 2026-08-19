---
description: 用 vue3-reviewer 审查代码改动,按严重度分级输出
---

委派 vue3-reviewer subagent 审查 Vue 3 + TypeScript 代码。审查范围:$ARGUMENTS

若上方范围为空,则审查当前未提交的改动(先 git status,再 git diff 全部变更文件)。

要求:

1. 只读分析,不要修改任何文件
2. 按严重度分级输出:Blocker(必须修复)/ Major(应该修复)/ Minor(建议改进)
3. 每条问题给出 文件:行号、问题描述、具体修改建议
4. 结尾给一段总体评价与是否建议合并的结论
