---
name: python-best-practices
description: Python 工程化规范:PEP 8、类型标注、虚拟环境、测试与依赖管理。
---

# Python 工程化规范

当项目包含 `pyproject.toml` / `requirements.txt` / `setup.py` 时,按以下规范行事:

## 代码质量

- 遵循 PEP 8;优先使用 `ruff` 或 `black` 自动格式化
- 新代码必须带完整类型标注(`def f(x: int) -> str:`),`mypy --strict` 通过
- 禁止裸 `except:`,至少捕获具体异常并记录上下文
- 优先 dataclass / pydantic 定义数据模型,禁止手写大量样板

## 环境与依赖

- 新项目优先 `uv` 或 `poetry` 管理依赖,锁文件必须提交
- 生产依赖与开发依赖分离(`pyproject.toml` 的 `optional-dependencies`)

## 测试

- 单元测试使用 `pytest`,测试文件与模块同结构放 `tests/`
- 每个修复必须带回归测试;覆盖率目标 > 80%

## 危险操作

- 禁止 `rm -rf` 指向非明确路径的目录(默认 hook 已拦截)
- 涉及凭据的操作优先读取环境变量,禁止写入代码
