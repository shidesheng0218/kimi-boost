---
description: 按 Go 约定为指定代码补表驱动测试
---

为以下 Go 代码补充测试:$ARGUMENTS

若上方为空,则为当前改动过的包补测试。

要求:

1. 先运行 go test ./... 确认现有测试状态,不要破坏已有测试
2. 表驱动测试(table-driven tests),子测试用 t.Run 命名
3. 覆盖正常路径、错误路径和边界条件;错误断言用 errors.Is/As
4. 需要外部依赖时用接口 mock 或 httptest 等标准库方案,不引入项目没有的测试框架
5. 完成后运行 go test ./... 与 go vet ./... 确认全部通过
