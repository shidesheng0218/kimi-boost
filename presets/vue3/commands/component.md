---
description: 按 Vue 3 组合式 API 规范脚手架一个组件
---

按本预设的 Vue 3 + TypeScript 最佳实践创建组件:$ARGUMENTS

要求:

1. 先观察项目现有结构(src/components 目录、命名约定、是否使用 Pinia/vue-router),与项目保持一致
2. 使用 `<script setup lang="ts">`,props/emits 用类型声明(defineProps<T>() / defineEmits<T>())
3. 样式方案跟随项目已有约定( scoped / CSS Modules / Tailwind 等)
4. 不引入项目没有依赖的库
5. 创建后用一段注释在组件内给出最小使用示例
