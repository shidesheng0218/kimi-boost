---
name: express-best-practices
description: Express 最佳实践:中间件、错误处理、校验、安全与测试。
---

# Express (Node.js) 工程规范

当项目包含 `package.json` 且使用 `express` 时,按以下规范行事:

## 结构与中间件

- 按功能域拆分路由模块,`app.js` 只做装配;禁止把所有路由写在一个文件
- 中间件顺序:安全 → 解析 → 日志 → 鉴权 → 路由 → 错误处理;错误中间件 4 参签名
- 所有 `async` 路由错误必须捕获,统一错误处理中间件处理(禁止裸 promise 崩溃)

## 校验与类型

- 入参校验用 `zod` 或 `express-validator`;不信任裸 `req.body`
- TypeScript 全量类型;`req`/`res` 扩展类型明确
- 响应结构统一(错误码、消息、数据),便于客户端处理

## 安全

- 依赖注入 + 分层(controller/service/repository);业务逻辑不进路由回调
- 认证用 JWT 中间件,授权按角色;敏感操作审计
- 安全头(`helmet`)、CORS 白名单、限流(`express-rate-limit`)按需启用

## 数据库与性能

- 查询避免 N+1;连接池配置合理;事务包裹写操作
- 大文件/流式响应避免整读内存;缓存层(Redis)按需引入

## 测试

- 用 `supertest` + 测试库覆盖核心接口;测试数据库隔离
- 覆盖错误路径(401/404/校验失败);CI 里跑 lint + test
