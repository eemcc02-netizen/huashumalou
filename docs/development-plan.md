# 话术马喽开发文档与版本规划

本文档记录后续功能路线，方便按版本推进。当前目标包为 `02/nihao`。

## 项目定位

话术马喽是一款浏览器话术补全插件，核心目标是在网页输入框中快速插入常用文本、AI 回复建议、扩展处理内容，并逐步支持图片话术、自动发送、监听规则和页面内悬浮工作台。

## 当前核心能力

- 快捷话术补全。
- 候选面板选择和键盘操作。
- AI 回复建议。
- AI 扩展指令。
- 猴名备忘录。
- 猴目功能。
- 图片自动确认。
- Popup 快速开关。
- Options 设置和管理。

## 数据与设置规划

### 图片自动确认策略

字段：

- `autoSendImageConfirm: boolean`
- `imageAutoSendStrategy: "click" | "enter"`

策略：

- `click`：自动发送，点击图片确认弹窗按钮。
- `enter`：回车发送，图片插入后监听/模拟 Enter，并按需要回落到自动确认流程。

默认：

- `autoSendImageConfirm = false`
- `imageAutoSendStrategy = "click"`

### 图片话术规划

建议字段：

- `id`
- `shortcut`
- `title`
- `type: "image"`
- `imageName`
- `imageMime`
- `imageData`
- `autoSendAfterInsert`
- `createdAt`
- `updatedAt`

### 文本热分隔规划

建议字段：

- `textHotSeparatorEnabled`
- `textHotSeparator`
- `textHotSeparatorMode: "newline" | "paragraph"`
- `textHotSeparatorTrimParts`
- `textHotSeparatorKeepEmpty`

### 监听规则规划

建议字段：

- `siteRules`
- `sendButtonSelector`
- `confirmButtonTexts`
- `imageConfirmModalSelector`
- `enterSendEnabled`
- `listenDomChanges`

### 悬浮球规划

建议字段：

- `floatingBallEnabled`
- `floatingBallSiteDisabledHosts`
- `floatingBallPosition`
- `floatingBallCollapsed`

## 版本路线

### V1.9.2 图片自动确认策略

目标：把图片自动确认拆成 `自动发送` 和 `回车发送` 两种策略。

状态：已完成第一版。

验收：

- Popup 可切换策略。
- 设置页可切换策略。
- 默认保持旧行为。
- 关闭总开关后不自动触发。
- 文本话术不受影响。

### V1.9.3 图片话术第一版

目标：支持创建和插入图片话术。

范围：

- 设置页新增图片话术创建 UI。
- 支持选择/粘贴图片并保存到本地设置。
- 话术列表能区分文本和图片。
- 快捷词命中图片话术后，将图片粘贴到当前输入框。
- 单条图片话术支持 `插入后自动发送`。

验收：

- 新建图片话术后刷新仍存在。
- 在网页输入框输入快捷词可插入图片。
- 可开启或关闭单条图片话术自动发送。
- 导入导出不破坏旧文本话术。

### V1.9.4 文本热分隔

目标：让长文本话术可以按用户定义的分隔符自动换行或分段。

范围：

- 设置页新增文本热分隔配置。
- 文本话术插入前按规则转换。
- 支持启用/关闭。

验收：

- 配置分隔符后插入文本时能按规则转换。
- 关闭后保持原文。
- AI 建议和图片话术不受影响。

### V1.9.5 监听增强

目标：提升复杂网页适配能力。

范围：

- 可配置发送按钮 selector。
- 可配置确认按钮文案。
- 可配置站点级规则。
- 增强图片确认弹窗识别。

验收：

- 特定站点可单独配置规则。
- 监听功能可关闭。
- 不影响普通输入框性能。

### V1.9.6 更多自定义

目标：把高频行为做成可配置项。

范围：

- 候选面板展示样式。
- 触发策略。
- 发送策略站点覆盖。
- 快捷词匹配规则。
- 导入导出兼容新增字段。

### V2.0.0 悬浮球

目标：页面内提供独立入口，不依赖输入快捷词也能找话术。

范围：

- 全局悬浮球开关。
- 拖拽和位置保存。
- 展开迷你话术面板。
- 搜索、选择、插入文本和图片话术。
- 站点级禁用。

验收：

- 悬浮球不会遮挡或破坏页面输入。
- 位置可保存。
- 可从悬浮面板插入话术到当前输入框。

## 发布前检查

- 确认 `manifest.json` 版本号。
- 更新 `CHANGELOG.md`。
- 检查 Popup、Options、Content Script 语法。
- 在真实聊天页面做手动回归。
- 确认旧设置能自动补默认值。
