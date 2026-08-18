---
name: fastapi-best-practices
description: FastAPI 最佳实践:pydantic 校验、异步、依赖注入与测试。
---

# FastAPI 工程规范

当项目包含 `main.py` 且使用 `fastapi` 时,按以下规范行事:

## 结构与路由

- 按功能域拆分 APIRouter;`main.py` 只做应用组装
- 路径与查询参数定义类型与校验(不裸用 `dict`)
- 版本化 API(如 `/api/v1`);响应模型明确

## Pydantic 与校验

- 请求/响应全部用 pydantic model;禁止信任原始 body
- 用 `model_validator`/`field_validator` 做跨字段校验;错误信息对用户友好
- 数据库 ORM 模型与 API 模型分离,不直接返回 ORM 对象

## 异步与依赖注入

- IO 操作用 `async`/`await`;阻塞 CPU 任务用线程池(`run_in_executor` 或独立进程)
- 依赖(数据库、Redis、当前用户)用 FastAPI Depends 管理,不用全局变量
- 数据库会话用 `yield` 依赖自动关闭

## 错误与安全

- 业务错误用 `HTTPException` 或自定义异常处理器;不裸抛 `RuntimeError`
- 认证用 OAuth2/OIDC 或 API Key,依赖注入到受保护路由
- 敏感操作审计;限流与 CORS 按需配置

## 测试

- 用 `TestClient` 或 `httpx.AsyncClient` 覆盖核心接口
- 测试隔离数据库(内存/独立 schema);异步测试用 `pytest-asyncio`
