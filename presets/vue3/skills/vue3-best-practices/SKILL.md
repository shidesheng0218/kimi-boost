---
name: vue3-best-practices
description: Vue 3 + TypeScript + Vite 项目开发规范,遵循组合式 API、tsconfig 严格模式与性能最佳实践。
---

# Vue 3 开发规范

当项目包含 `package.json` 且依赖 `vue@^3` 时,按以下规范行事:

## 组件

- 优先使用 `<script setup lang="ts">` 组合式 API,避免 Options API
- 使用 `<script lang="ts">` 定义 `defineProps` / `defineEmits` 类型,禁止 `any`
- 组件按目录组织:`components/`,每个组件一个目录(组件 + 专用子组件 + 测试)
- props 尽量扁平化,避免深层嵌套对象;复杂对象用 `defineProps<T>()` 接口描述

## 状态管理

- 小型状态优先 `reactive` + 组合式函数(composables),不要为简单状态引入 Pinia
- 跨页面/模块共享的状态才使用 Pinia store;store 内禁止直接修改其他 store

## 性能

- 长列表使用 `v-memo` / 虚拟滚动,禁止渲染超过 1000 行的裸 v-for
- 频繁切换的组件优先 `keep-alive`,并设置合理的 `max`
- 监听大对象时使用 `watch(() => [a, b], ...)` 而非 `watch(obj, ...)`

## 提交

- commit message 使用 Conventional Commits(默认 hook 已保护 main 分支)
