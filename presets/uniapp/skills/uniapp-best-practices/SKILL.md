---
name: uniapp-best-practices
description: uni-app 跨端最佳实践:页面结构、条件编译、性能与平台兼容性。
---

# uni-app 工程规范

当项目包含 `pages.json` 或使用 `uni-app`(`@dcloudio`)时,按以下规范行事:

## 页面与组件

- 页面在 `pages/`,公共组件在 `components/`;组件 props 传值类型明确
- 页面逻辑抽到 composables(或 `uni-app` 的组合式 API),避免 Page 里堆逻辑
- 全局样式放 `App.vue`,组件样式 scoped;尺寸用 `rpx`(设计稿 750)

## 条件编译

- 平台差异用条件编译(`#ifdef MP-WEIXIN` 等)显式处理,不要运行时到处判断平台
- 涉及平台 API 的调用统一封装,避免散落各处

## 性能

- 首屏避免过大 JS 包;非首屏页面用分包(`pages.json` 的 subPackages)
- `setData`/数据更新控制频率与体积;长列表分页加载或 `recycle-view`
- 图片压缩 + 懒加载;静态资源尽量放 CDN

## 兼容性

- 不使用某端不支持的 API 而不做降级;keyboard/安全区等系统差异有兜底
- 网络请求统一封装(超时、错误码、token 注入);签名/敏感信息不放前端

## 提交

- 遵守 `protect-main` 守卫(默认 hook);提交信息遵循 Conventional Commits
