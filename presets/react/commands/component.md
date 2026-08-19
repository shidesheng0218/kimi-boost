---
description: 按 React + TypeScript 规范脚手架一个组件
---

按本预设的 React + TypeScript 最佳实践创建组件:$ARGUMENTS

要求:

1. 先观察项目现有结构(src/components 目录、命名约定、状态管理方案),与项目保持一致
2. 函数组件 + TypeScript;props 用 interface 显式声明并导出
3. 遵守 Hooks 规范:不在条件/循环中调用 Hook,依赖数组完整
4. 样式方案跟随项目已有约定(CSS Modules / styled-components / Tailwind 等),不引入新依赖
5. 创建后用一段注释在组件内给出最小使用示例
