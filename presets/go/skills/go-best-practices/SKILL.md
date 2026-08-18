---
name: go-best-practices
description: Go 工程最佳实践:gofmt、错误处理、并发安全、标准库优先、测试与项目结构。
---

# Go 工程规范

当项目包含 `go.mod` 时,按以下规范行事:

## 格式与命名

- 所有代码 `gofmt` + `goimports` 对齐;提交前建议 `gofmt -l .` 检查
- 标识符用 Go 惯例:`camelCase`(导出用 `CamelCase`),缩写词保持大写(如 `HTTP`,非 `Http`)
- 包名简短小写,避免 `util`/`common` 之类的通用包名

## 错误处理

- 错误是值:显式检查、显式返回;不要用 `panic` 处理普通错误
- 错误比较用 `errors.Is` / `errors.As`,不要用 `==` 比较哨兵错误
- 用 `%w` 包装错误保留链路,`fmt.Errorf("do x: %w", err)`
- 不在 defer 里吞掉错误;defer 中关闭资源时若出错至少记录

## 并发

- 优先用 channel + goroutine 表达并发;仅在需要共享可变状态时用 sync.Mutex
- 防止 goroutine 泄漏:有 for-select 循环的 goroutine 必须有退出信号(close(ch)/context)
- 用 `sync.Once` 做单例初始化;用 `sync.WaitGroup` 等待任务组
- 所有可取消操作传递 `context.Context`(函数签名第一参数)

## 标准库与依赖

- 能只用标准库就不用第三方库;引入依赖需有明确理由
- 避免全局可变状态;依赖通过构造注入

## 测试

- 优先 table-driven tests;测试覆盖正常路径 + 错误路径 + 边界
- 基准测试用 `Benchmark`;对并发代码用 `-race` 跑测试
- 测试文件与实现同包(`xxx_test.go`)
