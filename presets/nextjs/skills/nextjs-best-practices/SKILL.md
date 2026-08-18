---
name: nextjs-best-practices
description: Next.js 最佳实践:App Router、服务端组件、数据获取与性能。
---

# Next.js 工程规范

当项目包含 `next.config.js` 或使用 `next` 时,按以下规范行事:

## App Router

- 优先 App Router;页面/布局按目录组织(`app/` 下 `page.tsx` / `layout.tsx` / `route.ts`)
- 默认服务端组件(RSC);客户端组件只放交互部分,并明确 `"use client"`
- 路由参数用类型化 `params`/`searchParams`;动态路由 `[slug]` 加 `generateStaticParams`

## 数据获取

- 服务端获取数据:缓存语义明确(`cache`/`revalidate`);避免客户端瀑布式请求
- 用 Server Actions 做变更操作,带输入校验与错误处理
- 敏感数据只服务端访问;客户端不渲染密钥

## 性能

- 图片用 `next/image`;字体 `next/font`;代码按路由拆分
- 关键页面做 Streaming/Suspense;避免整页阻塞渲染
- 静态生成优先(`generateStaticParams` + ISR),按需再 SSG

## 类型与规范

- 全量 TypeScript;组件 props 精确类型
- 表单校验用 `zod`(服务端复用);`next lint` 无警告
- 环境变量 `NEXT_PUBLIC_*` 前缀只在必须暴露时使用

## 提交

- 遵守 `protect-main` 守卫(默认 hook);提交信息遵循 Conventional Commits
