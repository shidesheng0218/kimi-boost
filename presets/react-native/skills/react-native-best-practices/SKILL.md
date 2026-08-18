---
name: react-native-best-practices
description: React Native 最佳实践:组件组织、性能、原生桥接与发布。
---

# React Native 工程规范

当项目包含 `react-native` 或 `expo` 时,按以下规范行事:

## 组件与结构

- 页面组件在 `screens/`,可复用组件在 `components/`;按功能域组织
- 纯 UI 组件无状态优先;业务逻辑放 hooks 或状态层
- 样式用 StyleSheet 或统一主题常量,避免内联样式散落

## 性能

- 长列表用 `FlatList`/`SectionList`(必带稳定 key),禁用 scroll-view 内嵌 list
- 图片指定尺寸 + 缓存策略;避免大图直接渲染
- 高频率更新(动画/滚动)用 `Animated`/`Reanimated` 驱动,避免 setState 刷整屏
- `useMemo`/`React.memo` 克制使用;注册表/大对象避免频繁重建

## 原生与平台

- 平台差异用 `Platform.select`/`useWindowDimensions` 显式处理;需要时条件引入原生模块
- 异步存储/键值存储选用合适的库(如 AsyncStorage/SecureStore),敏感数据用 Keychain/Keystore
- 原生代码改动最小化;能用 JS/TS 表达就不写原生

## 状态与数据

- 服务端数据用 TanStack Query;全局状态按需(轻量 Zustand 优先)
- 离线场景考虑缓存与重试;网络错误统一处理与提示

## 发布

- 版本号与构建号统一管理;发版前跑 TypeScript + lint + 核心测试
- 提审前检查权限声明、隐私清单与图标/启动屏
