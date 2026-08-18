---
name: react-best-practices
description: React + TypeScript 最佳实践:组件组合、Hooks 规范、性能与可访问性。
---

# React 工程规范

当项目包含 `package.json` 且使用 React(`react`、`next`、`vite` + `@vitejs/plugin-react`)时,按以下规范行事:

## 组件

- 优先函数组件 + Hooks;`props` 用 `interface` 精确类型,禁止 `any`
- 组件单一职责;超大组件拆分为组合组件(container/presentational 分层)
- 列表必须有稳定的 `key`(用业务 id,不要用 index)

## Hooks

- 遵守 Hooks 规则:只在顶层调用,只在组件/自定义 Hook 中调用
- `useEffect` 依赖数组写全;避免 `useEffect` 里 setState 造成循环
- 派生状态优先 `useMemo`,事件处理用 `useCallback`——两者都不滥用,默认不用
- 自定义 Hook 以 `use` 开头,返回结构清晰的对象

## 性能

- 大列表用 `React.memo` + 虚拟滚动(如 `react-window`),避免无谓重渲染
- 图片懒加载、路由级 code splitting(Next.js `dynamic` / Vite `import()`)
- 避免在 render 里创建新对象/数组导致子组件失效 memo

## 状态管理

- 组件局部状态用 `useState`/`useReducer`,别为小事上全局 store
- 跨层级共享用 Context(注意拆分,避免大对象);全局复杂状态才用 Zustand/Redux
- 服务端数据用 TanStack Query 管理缓存与请求状态

## 可访问性与健壮性

- 语义化标签、表单有 `label`,按钮有可读文本
- 所有用户输入先校验;错误边界处理渲染异常
