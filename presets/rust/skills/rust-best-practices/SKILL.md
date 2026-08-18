---
name: rust-best-practices
description: Rust 工程最佳实践:所有权与借用、错误处理、cargo 与测试。
---

# Rust 工程规范

当项目包含 `Cargo.toml` 时,按以下规范行事:

## 所有权与借用

- 优先借用(`&T`/`&mut T`)而非 clone;clone 仅在语义需要时使用
- 用 `Rc`/`Arc` 共享所有权时确认线程安全需求;跨线程用 `Arc<Mutex<T>>` 或锁-free 结构
- 避免无谓的 `unwrap()`/`expect()`;仅在 invariant 成立处使用并附说明

## 错误处理

- 错误类型实现 `std::error::Error`;库代码返回 `Result<T, E>` 而非 panic
- 用 `thiserror` 定义领域错误、`anyhow` 做应用层上下文错误;二选一,不要混用
- 错误传播用 `?`;边界处(CLI 入口、线程边界)集中处理并给出可读信息

## 类型与设计

- 用类型表达状态(如 `Option`/`Result`/新类型包装),避免魔法值
- `enum` + `match` 优先;少用字符串/整数做分支
- `unsafe` 代码必须带注释说明安全性论证,并尽量隔离在模块内

## Cargo 与依赖

- 依赖版本用 semver;`Cargo.lock` 提交(应用项目)
- 二进制与库分层清楚;feature 开关命名清晰
- 提交前 `cargo fmt` + `cargo clippy -D warnings` 通过

## 测试

- 单元测试与实现同文件或 `tests/` 模块;公共 API 集成测试放 `tests/`
- 错误路径与边界条件必须覆盖;异步代码用 `tokio::test`
