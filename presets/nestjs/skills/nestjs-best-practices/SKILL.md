---
name: nestjs-best-practices
description: NestJS / TypeScript 后端最佳实践:模块化、依赖注入、守卫管道与测试。
---

# NestJS 工程规范

当项目包含 `nest-cli.json` 或使用 `@nestjs/common` 时,按以下规范行事:

## 分层与模块化

- 按功能域划分模块(feature module),每个模块一个目录:controller / service / dto / entities
- 依赖通过构造注入(Nest DI),禁止在 Service 里 new 其他 Service 或直接使用全局单例
- 公共能力(认证、日志、数据库)提取为共享模块,用 `@Module` 导出

## 控制器与 DTO

- Controller 只做路由与参数校验,业务逻辑全在 Service
- 入参一律用 DTO + `class-validator` 校验(`@IsString` 等),禁止信任原始 body
- 返回统一结构;错误用 Nest 内置异常(`NotFoundException` 等),不要裸返回错误对象

## 安全与守卫

- 认证用 `AuthGuard`(JWT/OAuth),授权用角色守卫,组合守卫不要写在 Controller 里
- 敏感操作记录审计日志;禁止把密码等敏感字段返回给客户端
- 限流、防重放按需加 `ThrottlerGuard`

## 数据库

- 用 TypeORM/Prisma 时:实体定义完整类型,迁移用版本化 migration
- 查询避免 N+1;分页、索引合理;事务用 `@Transactional` 或 manager 事务

## 测试

- Service 用单元测试(注入 mock Repository);e2e 用 `supertest` 覆盖核心接口
- 测试不依赖真实数据库外部服务,用内存库或 mock
