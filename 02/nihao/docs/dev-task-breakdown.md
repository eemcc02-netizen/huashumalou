# Dev Task Breakdown

## 图片话术第一版

### 设置页

- 新增话术类型选择：文本话术 / 图片话术。
- 图片类型下显示上传、预览和元信息区域。
- 新增单条开关：插入后自动发送。
- 列表展示图片类型、缩略图和 `[图片] 文件名`。
- 图片话术编辑回填到完整表单。

### 存储

- 文本话术默认 `type: "text"`。
- 图片话术使用 `type: "image"`。
- 图片字段：`imageName`、`imageMime`、`imageSize`、`imageData`、`autoSendAfterInsert`。
- `normalizeSnippets` 兼容旧数据。

### 内容脚本

- 命中图片话术后删除当前快捷词。
- dataURL 转为 `File`。
- 写入 `navigator.clipboard`。
- 向当前输入框派发粘贴事件。
- 单条开关与全局图片自动确认同时开启时，复用现有点击或回车策略。

### 导入导出

- JSON 导出包含图片字段。
- JSON 导入恢复图片话术。
- 旧 JSON 文本话术导入默认兼容。
