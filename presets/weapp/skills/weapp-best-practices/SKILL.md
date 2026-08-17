---
name: weapp-best-practices
description: 微信小程序开发规范:页面结构、分包、渲染性能、数据请求与安全。
---

# 微信小程序开发规范

当项目包含 `app.json` / `project.config.json` 时,按以下规范行事:

## 目录结构

- `pages/` 放页面,`components/` 放可复用组件,`utils/` 放纯函数工具
- 页面遵循 4 件套:`wxml` / `wxss` / `js(或 ts)` / `json`
- 每个页面目录最多 2 个子组件目录,避免过深嵌套

## 分包

- 主包保持精简,静态资源尽量放 CDN 或 `miniprogram_npm`
- 非首屏页面放 `subpackages/`,注意 `preloadRule` 与 `prefetch`
- 超过 2MB 主包限制时优先分析 `wxss` 冗余与图片资源

## 渲染性能

- `setData` 数据量控制:每次 < 256KB,高频更新使用 `throttle`
- 列表使用 `wx:key`,禁止用 index 作为唯一 key
- 长列表(>50 项)启用 `recycle-view` 或分页加载
- 避免在 `onShow` 做重计算;页面间传值优先使用 `EventChannel`

## 数据请求

- 统一封装 `request` 工具:自动携带 token、统一错误处理、超时与重试
- 敏感接口签名防篡改;用户输入一律校验后再上行
- 禁止把 `appid` / `secret` 写进前端代码
