---
name: flutter-best-practices
description: Flutter / Dart 最佳实践:Widget 组织、状态管理、性能与测试。
---

# Flutter 工程规范

当项目包含 `pubspec.yaml` 时,按以下规范行事:

## Widget 组织

- 组件遵循单一职责;`build` 方法保持精简,复杂 UI 拆分为小组件
- 无状态 Widget 优先;只在需要时才用 StatefulWidget
- 文件命名 snake_case(`login_button.dart`),类名 PascalCase,与文件名对应

## 状态管理

- 页面级状态用 `setState` 即可时不要引入状态库
- 跨页面共享状态用 `Riverpod` 或 `Provider`;`Bloc` 适用于复杂业务流
- 状态库的 Store/Provider 分层清晰,业务逻辑不进 Widget

## 性能

- 常量优先:`const` 构造减少重建成本
- 长列表用 `ListView.builder`/`GridView.builder`,不用 `children:` 一次性构建
- 高刷新区域(动画、滚动)局部重建,避免整个页面 setState
- 图片按需加载:`cacheWidth`、懒加载、避免超大图直接解码

## Dart 规范

- 全量 null-safety;避免 `dynamic`/`as` 硬转换
- 私有成员 `_` 前缀;避免不必要的外部依赖
- 异步用 `async/await`,避免 `then` 链式过深

## 测试

- Widget 测试覆盖关键交互;纯逻辑用单元测试
- 集成测试覆盖核心用户路径;`flutter analyze` 无警告再提交
