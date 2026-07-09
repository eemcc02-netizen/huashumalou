# 浏览器文本补全插件开发任务拆解

## 1. 目标

- 基于现有 PRD 和技术文档，完成 Edge 浏览器插件 MVP 开发
- 优先打通“自定义快捷词 -> 触发替换 -> 插入话术”主链路
- 支持像 `、zd` 这样的中文快捷词场景

## 2. 任务拆分

### 2.1 基础工程

- 创建 `package.json`
- 配置 `TypeScript`
- 配置 `Vite` 构建
- 配置 `Manifest V3`
- 建立 `src/background`、`src/content`、`src/popup`、`src/options`、`src/shared`

### 2.2 数据层

- 定义 `Snippet`、`UserSettings` 类型
- 封装 `chrome.storage.local` 读写
- 实现快捷词归一化
- 实现默认设置初始化
- 实现默认片段初始化

### 2.3 Popup

- 展示已保存片段
- 搜索片段
- 新建片段
- 删除片段
- 打开设置页

### 2.4 Options

- 配置触发键
- 配置默认前缀列表
- 配置默认签名
- 配置黑名单站点
- 承接右键选中文本快速保存

### 2.5 Content Script

- 识别当前输入元素
- 提取光标前文本
- 匹配快捷词
- 支持 `Tab` / `Space` / `Enter` 触发
- 替换 `input` / `textarea`
- 替换 `contenteditable`
- 展示候选面板
- 键盘选择候选项

### 2.6 模板能力

- 解析 `{{name}}` 格式变量
- 支持 `{{date}}`
- 支持 `{{time}}`
- 支持 `{{signature}}`
- 用轻量弹窗或 `prompt` 获取变量值

### 2.7 稳定性与安全

- 黑名单站点禁用
- 密码框禁用
- 敏感字段识别
- 替换失败不污染原文

### 2.8 测试与交付

- 安装依赖
- 执行构建
- 检查 TypeScript 诊断
- 在 Edge 中加载 `dist`
- 手动验证快捷词替换场景

## 3. 建议优先级

### 3.1 P0

- 快捷词新增与保存
- 本地存储
- `、zd` 替换链路
- `input` / `textarea` 替换
- `Tab` 触发

### 3.2 P1

- 候选面板
- `contenteditable`
- 设置页
- 右键快速保存

### 3.3 P2

- 变量表单优化
- 导入导出
- 更多兼容性优化

## 4. 当前已完成

- 技术文档已创建
- PRD 已创建
- MVP 项目骨架已初始化
- Popup / Options / Content Script 已有基础实现

## 5. 下一步建议

- 优先在 Edge 中加载插件验证 `、zd` 替换是否符合预期
- 根据验证结果再细化 `contenteditable` 和候选面板兼容性
- 完成构建后补充使用说明和截图文档
