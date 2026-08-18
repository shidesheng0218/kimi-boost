---
name: java-best-practices
description: Spring Boot 最佳实践:分层架构、依赖注入、事务、测试与安全。
---

# Java (Spring Boot) 工程规范

当项目包含 `pom.xml` 或 `build.gradle` 且使用 Spring 时,按以下规范行事:

## 分层架构

- Controller → Service → Repository 三层清晰;业务逻辑只放 Service
- Controller 只做参数绑定与状态码映射;禁止 Controller 里写 SQL 或事务
- DTO/VO/Entity 分层,禁止 Entity 直接暴露给前端

## 依赖注入与配置

- 构造器注入优先(不用 `@Autowired` 字段注入)
- 配置集中:`application.yml` 分层(dev/prod),敏感配置走环境变量
- Bean 作用域明确;避免大量单例之间互相依赖成环

## 事务与数据

- 写操作按需 `@Transactional`(只读操作不开启);事务边界放在 Service 层
- 查询避免 N+1(join fetch / EntityGraph);分页用 `Pageable`
- 实体变更用 migration(Flyway/Liquibase),禁止手动改表

## 安全

- 接口鉴权用 Spring Security + JWT;方法级权限 `@PreAuthorize`
- 入参校验用 Bean Validation(`@Valid` + 注解);禁止信任裸参数
- 不返回敏感字段;日志脱敏

## 测试

- Service 单测 mock Repository;Controller 用 `@WebMvcTest`
- 集成测试 `@SpringBootTest` + Testcontainers 或 H2;覆盖核心事务路径
