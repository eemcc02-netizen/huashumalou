# 浏览器文本补全插件技术文档

## 1. 文档信息

- 产品名称：话术补全助手
- 产品形态：Edge 浏览器插件
- 技术版本：V1.0 MVP
- 关联文档：`docs/prd-edge-text-expander.md`
- 文档用途：指导开发、联调、测试与后续扩展

## 2. 技术目标

- 基于 `Manifest V3` 实现 Edge 浏览器插件。
- 在常见网页输入区域内稳定识别快捷词并完成文本替换。
- 支持用户自定义任意形式的快捷词，例如 `、zd`、`/refund`、`;qm`。
- 支持 `input`、`textarea`、`contenteditable` 三类输入区域。
- 提供片段管理、候选面板、变量渲染、设置管理等基础能力。
- 保证插件对页面原有输入行为影响最小，失败时可安全降级。

## 3. 技术范围

### 3.1 MVP 范围

- 插件基础架构搭建
- 本地片段存储
- 弹窗管理界面
- 设置页
- 内容脚本输入监听
- 快捷词匹配与文本展开
- 候选面板渲染
- 变量弹窗与渲染
- 右键菜单保存片段
- 黑名单站点控制

### 3.2 非 MVP 范围

- 云同步
- 账号体系
- 团队共享
- AI 话术生成
- 服务端存储
- 管理后台

## 4. 技术架构

### 4.1 总体架构

插件采用浏览器扩展标准分层：

- `background service worker`
  - 负责插件生命周期管理、右键菜单、消息转发、安装初始化
- `content scripts`
  - 注入网页，监听输入、识别快捷词、定位光标、插入文本、渲染候选面板
- `popup`
  - 提供片段搜索、增删改查、最近使用和收藏管理
- `options page`
  - 提供插件设置、黑名单、导入导出、触发策略管理
- `chrome.storage`
  - 存储片段、设置、使用记录

### 4.2 模块关系

```text
用户输入
  -> content script 监听输入事件
  -> 读取本地缓存片段与设置
  -> 执行快捷词匹配
  -> 命中后触发候选面板或直接展开
  -> 如存在变量则弹出变量表单
  -> 将渲染结果插入输入框
  -> 更新使用记录到 storage

popup / options
  -> 读写 storage
  -> 向 content script 发送同步消息

background
  -> 注册右键菜单
  -> 处理安装初始化
  -> 协调跨页面消息
```

## 5. 目录建议

建议项目目录如下：

```text
src/
  background/
    index.ts
    context-menu.ts
    runtime.ts
  content/
    index.ts
    detector.ts
    matcher.ts
    replacer.ts
    caret.ts
    editable.ts
    panel/
      suggestion-panel.ts
      variable-modal.ts
  popup/
    index.tsx
    pages/
    components/
  options/
    index.tsx
    pages/
    components/
  shared/
    types/
    constants/
    storage/
    messaging/
    utils/
    template/
manifest.json
```

说明：

- `content` 负责网页内输入能力，是核心模块。
- `shared` 用于统一类型、常量、存储读写和消息协议。
- `popup` 与 `options` 可采用同一套 UI 技术栈。

## 6. 技术选型建议

- 构建工具：`Vite`
- 语言：`TypeScript`
- UI：`React`
- 状态管理：轻量方案优先，建议 `Zustand` 或 React Context
- 存储封装：基于 `chrome.storage.local`
- 样式：`Tailwind CSS` 或简洁 CSS Modules
- 包管理：`pnpm`
- 单元测试：`Vitest`
- 端到端验证：手动为主，后续可引入 `Playwright`

技术原则：

- MVP 优先稳定与可维护，避免过重依赖。
- 核心输入逻辑尽量无框架、低耦合，方便在 content script 中运行。
- UI 与网页注入逻辑分层，避免 DOM 污染和样式冲突。

## 7. Manifest 设计

### 7.1 关键字段

```json
{
  "manifest_version": 3,
  "name": "话术补全助手",
  "version": "0.1.0",
  "action": {
    "default_popup": "popup.html"
  },
  "background": {
    "service_worker": "background.js"
  },
  "options_page": "options.html",
  "permissions": [
    "storage",
    "activeTab",
    "scripting",
    "contextMenus"
  ],
  "host_permissions": [
    "<all_urls>"
  ],
  "content_scripts": [
    {
      "matches": ["<all_urls>"],
      "js": ["content.js"],
      "run_at": "document_idle"
    }
  ]
}
```

### 7.2 权限说明

- `storage`
  - 存储片段、设置、最近使用记录
- `activeTab`
  - 与当前标签页交互
- `scripting`
  - 页面脚本注入与动态控制
- `contextMenus`
  - 右键“保存为话术片段”
- `host_permissions`
  - 在网页输入区域内工作所需

生产版本建议：

- 保持最小权限原则
- 对敏感站点提供显式禁用能力
- 在插件说明中明确权限用途

## 8. 数据模型设计

### 8.1 Snippet

```ts
type Snippet = {
  id: string;
  title: string;
  shortcut: string;
  content: string;
  shortcutNormalized: string;
  category?: string;
  tags: string[];
  isFavorite: boolean;
  createdAt: string;
  updatedAt: string;
  lastUsedAt?: string;
  useCount: number;
};
```

### 8.2 Settings

```ts
type TriggerKey = "Tab" | "Space" | "Enter";
type MatchMode = "exact-token";

type UserSettings = {
  triggerPrefixes: string[];
  triggerKey: TriggerKey;
  matchMode: MatchMode;
  enableSuggestionPanel: boolean;
  blacklistSites: string[];
  defaultSignature: string;
  disableInPasswordFields: boolean;
  disableInSensitiveFields: boolean;
};
```

### 8.3 Recent Usage

```ts
type SnippetUsage = {
  snippetId: string;
  usedAt: string;
  host: string;
};
```

### 8.4 Variable Definition

```ts
type TemplateVariable = {
  key: string;
  label: string;
  type: "text" | "date" | "time" | "signature";
  required: boolean;
  defaultValue?: string;
};
```

## 9. 存储设计

### 9.1 Storage Key 规划

- `tb.snippets`
- `tb.settings`
- `tb.usage`
- `tb.version`

### 9.2 存储策略

- `snippets` 使用完整数组或按 `id` 映射均可，MVP 推荐完整数组，便于导入导出。
- `settings` 单对象存储。
- `usage` 保留最近一定数量记录，例如 `100` 条。
- 内容脚本启动后可将 `snippets` 和 `settings` 缓存在内存中，减少每次输入时读取 `storage` 的开销。
- `shortcutNormalized` 用于统一做匹配索引，原始 `shortcut` 保留给用户展示和编辑。

### 9.3 初始化默认值

首次安装时由 `background service worker` 执行初始化：

- 写入默认设置
- 可选写入默认模板
- 默认 `triggerPrefixes` 建议包含 `/`、`、`
- 注册右键菜单

## 10. 消息通信设计

### 10.1 通信方向

- `popup -> background / storage`
- `options -> background / storage`
- `background -> content`
- `content -> background`

### 10.2 消息类型建议

```ts
type RuntimeMessage =
  | { type: "SNIPPETS_UPDATED" }
  | { type: "SETTINGS_UPDATED" }
  | { type: "OPEN_QUICK_SAVE"; payload: { selectedText: string } }
  | { type: "TRACK_USAGE"; payload: { snippetId: string; host: string } };
```

### 10.3 通信原则

- 与输入性能强相关的逻辑优先在 `content script` 本地完成。
- 非输入时机的数据同步通过消息广播完成。
- 避免每次按键都走 `runtime.sendMessage`。

## 11. 内容脚本设计

### 11.1 目标职责

- 监听输入相关事件
- 识别当前激活输入元素
- 提取光标前文本
- 执行快捷词匹配
- 展示候选面板
- 插入文本和渲染变量
- 同步使用记录

### 11.2 监听事件

建议监听：

- `focusin`
- `input`
- `keydown`
- `click`
- `selectionchange`

说明：

- `focusin` 用于识别当前激活输入区域。
- `input` 用于更新快捷词匹配和候选面板。
- `keydown` 用于拦截 `Tab`、`Enter`、方向键等触发行为。
- `selectionchange` 用于富文本和候选面板定位辅助。

### 11.3 输入区域识别

支持以下元素：

- `HTMLInputElement`
- `HTMLTextAreaElement`
- `HTMLElement[contenteditable="true"]`

过滤规则：

- `input[type="password"]` 禁用
- `readonly`、`disabled` 禁用
- 命中黑名单站点禁用
- 可扩展：验证码、支付、卡号类输入框禁用

## 12. 快捷词识别设计

### 12.1 基本思路

MVP 采用“精确快捷词 + 结束键触发”的简单方案。

用户可以自定义任意快捷词文本，只要它在输入区域中是一个完整 token，即可触发替换。例如：

- `、zd`
- `/refund`
- `;qm`

每次输入后，从当前光标前提取一个局部文本窗口，判断是否存在符合规则的快捷词。

例如：

```text
您好，我想咨询 、zd
```

提取光标前文本后，只匹配最后一个可能作为快捷词的 token。

### 12.2 匹配策略

- 读取光标前文本片段
- 使用分词边界或空白字符定位最后一个 token
- 判断 token 是否命中已配置快捷词
- 若配置了 `triggerPrefixes`，则优先匹配这些前缀开头的 token
- 完整命中时支持直接展开
- 前缀命中时展示候选项

示例：

```text
用户定义快捷词：、zd
用户输入内容：麻烦看下 、zd
用户按下 Tab
系统替换为：麻烦看下 这是一段我自定义的话术
```

设计原则：

- 不强制快捷词必须以 `/` 开头
- 快捷词本质上就是用户自定义字符串
- 优先支持中文输入习惯下常见的 `、` 前缀
- 先用“完整匹配后再展开”的策略，降低误触概率

### 12.3 索引策略

为提升性能，启动时构建以下内存结构：

- `shortcut -> snippet` 映射
- 按前缀搜索的列表缓存

建议：

- 所有快捷词统一转小写匹配
- 保留原始显示内容
- 去除前后空格后写入 `shortcutNormalized`
- 配置更新时重建索引

### 12.4 结束键触发策略

为满足“定义一个快捷方式，输入后直接替换”的简单体验，MVP 采用结束键触发，而不是复杂语法解析。

支持方式：

- 输入完整快捷词后按 `Tab`
- 输入完整快捷词后按 `Space`
- 输入完整快捷词后按 `Enter`

建议默认：

- 默认使用 `Tab`
- 在设置页允许切换为 `Space` 或 `Enter`

原因：

- 逻辑简单，最容易稳定落地
- 误触率低于“输入到一半自动替换”
- 对 `、zd` 这种中文场景也更稳定

## 13. 文本替换设计

### 13.1 原生输入框替换

适用于 `input` 和 `textarea`：

1. 获取 `selectionStart` 和 `selectionEnd`
2. 计算快捷词起止位置
3. 拼接新字符串
4. 设置 `value`
5. 派发 `input` 和 `change` 相关事件
6. 重置光标位置

### 13.2 contenteditable 替换

适用于富文本或可编辑区域：

1. 读取当前 `Selection` 和 `Range`
2. 定位快捷词对应文本范围
3. 删除原文本范围
4. 插入新的文本节点
5. 恢复光标位置
6. 派发必要输入事件

### 13.3 受控组件兼容

React、Vue 等前端框架可能监听原生 setter 与输入事件。

兼容策略：

- 对 `value` 使用原生 `setter`
- 主动派发 `InputEvent`
- 必要时补发 `change` 事件
- 替换动作集中封装，避免到处散落兼容代码

## 14. 候选面板设计

### 14.1 渲染方式

- 在页面中动态插入一个高层级容器
- 使用 Shadow DOM 或独立命名空间 class，避免样式冲突
- 候选面板只在需要时渲染

### 14.2 展示位置

优先策略：

- 基于输入框的 `getBoundingClientRect()` 定位

增强策略：

- 对 `contenteditable` 尝试基于 `Range.getBoundingClientRect()` 获取光标坐标

降级策略：

- 若无法获取光标位置，则显示在输入框底部左侧

### 14.3 交互行为

- 输入触发后展示
- `ArrowUp` 和 `ArrowDown` 切换高亮
- `Enter` 选中
- `Esc` 关闭
- 输入框失焦时关闭

## 15. 变量模板设计

### 15.1 变量解析

使用简单正则解析：

```text
\{\{([a-zA-Z0-9_]+)\}\}
```

### 15.2 变量处理流程

1. 命中片段后解析变量
2. 若无变量，直接插入
3. 若存在变量，打开轻量弹窗
4. 收集变量值
5. 执行模板渲染
6. 插入最终文本

### 15.3 内置变量

- `{{date}}`
- `{{time}}`
- `{{signature}}`

### 15.4 渲染函数建议

```ts
function renderTemplate(content: string, values: Record<string, string>) {
  return content.replace(/\{\{([a-zA-Z0-9_]+)\}\}/g, (_, key) => values[key] ?? "");
}
```

## 16. 右键保存设计

### 16.1 Background 职责

- 注册右键菜单项
- 获取用户选中文本
- 触发快速保存流程

### 16.2 保存流程

1. 用户选中文本
2. 右键点击“保存为话术片段”
3. `background` 获取选中文本
4. 打开弹窗或新建快速保存页面
5. 预填内容字段
6. 用户填写标题与快捷词后保存

### 16.3 MVP 建议

MVP 可采用较简单方案：

- 右键后打开 `popup` 或 `options` 页面中的快速新建页
- 使用临时 `storage` 保存选中文本

## 17. 设置与黑名单设计

### 17.1 黑名单匹配

支持以下维度：

- 完整域名
- 子域名前缀
- 简单通配模式

MVP 建议先支持：

- 基于 `hostname` 的精确匹配
- 基于 `endsWith` 的域名后缀匹配

### 17.2 敏感场景禁用

默认禁用：

- 密码输入框
- 支付类输入框
- 银行卡类输入框
- 一次性验证码输入框

MVP 可先通过 `type`、`name`、`autocomplete`、`aria-label` 的关键词进行识别。

## 18. 性能设计

### 18.1 性能原则

- 尽量使用本地缓存，减少异步存储读取
- 限制每次匹配的文本窗口大小，例如光标前 `100` 到 `200` 字符
- 候选渲染按需触发，不常驻复杂节点
- 高频事件中避免重排和重复测量

### 18.2 防抖策略

- `input` 匹配不建议重防抖，避免输入体验延迟
- 面板定位与窗口变化可适当节流
- 设置更新和存储同步可防抖处理

## 19. 安全与隐私设计

- 默认仅本地存储，不上传用户输入内容
- 对敏感输入框默认禁用
- 禁止在插件日志中打印完整用户输入内容
- 仅在需要的页面范围内启用内容脚本
- 导入数据需校验结构，防止异常内容破坏本地状态

## 20. 错误处理与降级

### 20.1 降级原则

- 不能插入时不修改原文本
- 面板渲染失败时不影响正常输入
- 变量弹窗失败时允许用户取消并返回原状态

### 20.2 错误分类

- 存储读取失败
- 输入区域识别失败
- 光标位置获取失败
- 富文本替换失败
- 消息通信失败

### 20.3 日志建议

- 开发环境输出详细日志
- 生产环境只输出必要错误摘要
- 所有日志避免包含敏感文本

## 21. 测试方案

### 21.1 单元测试

重点覆盖：

- 快捷词匹配函数
- 模板变量解析
- 模板渲染函数
- 黑名单匹配逻辑
- 存储读写封装

### 21.2 集成测试

重点覆盖：

- `popup` 对 `storage` 的增删改查
- `content script` 与面板联动
- 快捷展开后使用记录更新

### 21.3 手动兼容测试

建议优先验证以下页面类型：

- 原生 `input`
- 原生 `textarea`
- `contenteditable`
- Gmail
- Google Docs 简化场景
- 常见 CRM / 工单系统
- React 表单页面

测试关注点：

- 输入不卡顿
- 展开结果正确
- 光标位置正确
- 候选面板不遮挡核心输入区域
- 失败时不污染原始文本

## 22. 里程碑拆分

### 22.1 第一阶段

- 初始化工程
- 配置 `Manifest V3`
- 打通 `popup`、`options`、`background`、`content script`
- 完成基础存储封装

### 22.2 第二阶段

- 实现片段管理
- 实现快捷词匹配
- 实现原生输入框替换
- 完成设置中心

### 22.3 第三阶段

- 实现候选面板
- 支持 `contenteditable`
- 实现变量弹窗
- 加入右键保存

### 22.4 第四阶段

- 黑名单与敏感场景控制
- 稳定性优化
- 兼容性测试
- 打包与提审准备

## 23. 后续扩展建议

- 将 `shortcut` 索引抽象为可扩展搜索服务，便于后续接入 AI 推荐
- 将模板变量系统升级为表单系统，支持下拉、枚举、条件渲染
- 为共享片段库预留数据结构，如 `ownerId`、`scope`、`source`
- 为云同步预留版本字段和数据迁移方案

## 24. 一句话总结

该插件的核心技术目标，是在不干扰网页原有输入行为的前提下，稳定完成“输入识别、快捷匹配、文本替换、变量渲染、候选交互”这一整条链路。
