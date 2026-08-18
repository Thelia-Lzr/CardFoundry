# CardFoundry 桌游设计器

这是按照 `Documents/` 设计稿制作的浏览器端桌游原型应用首版。

## 已实现

- 桌游设计：版图设计、单卡设计、卡组设计。
- 版图四类核心对象：卡牌放置格、卡牌放置区、卡组放置区、卡堆。
- 版图对象移动、选中、属性编辑、图层列表和网格显示。
- 单卡富文本效果编辑，支持颜色、底色、粗体、斜体、列表和飞书 HTML 粘贴。
- 单卡 XLSX/CSV/TSV 批量导入（XLSX 解析使用 SheetJS CDN）。
- 卡组成员管理、数量调整、卡组 XLSX/CSV/TSV 导入。
- 基础试玩：抽牌、玩家手牌、洗牌提示、操作日志、重新开始和会话保存。
- 项目导出 / 导入：`.bgdesign`（JSON 内容）、版图 JSON、单卡 JSON。
- IndexedDB 本地保存，并用 localStorage 作为兼容性备份。
- 撤销、重做、自动保存状态和快捷键：`Cmd/Ctrl + Z`、`Cmd/Ctrl + Shift + Z`、`Cmd/Ctrl + S`。
- 首次打开时的 AI 设置向导：配置 OpenAI-compatible API Base URL、API Key 和模型；也支持“暂不设置”，之后可从 AI 助手齿轮重新配置。
- AI 助手聊天侧栏：打开后占据右侧约三分之一，版图、单卡、卡组、试玩和导出页面会自动压缩并保留可用编辑区。
- 试玩布局：版图在上方，右侧保留试玩操作栏，玩家手牌固定在最下方，支持将场上卡牌拖回手牌。
- API 设置向导支持“获取模型列表”，会调用兼容服务的 `GET /models` 并将结果填入模型选择列表。
- 页面动效：视图切换、面板进入、对象出现、卡牌悬停、弹窗和 AI 内容切换均有轻量动画，并尊重系统的减少动态效果设置。
- 本地 MCP-style 工具桥：`window.cardFoundryMCP.getTools()`、`call(name, args)`、`getContext()`，并提供 `request('initialize' | 'tools/list' | 'tools/call' | 'context/get')` 供宿主适配器接入。
- MCP 工具覆盖项目、版图对象、单卡、标签、卡组精确数量，以及试玩副本中的抽牌、出牌、移动、横置、回手、入堆、洗堆和重置。

## 本地打开

项目是零构建依赖的静态网页。进入项目目录后运行任意静态服务器，例如：

```bash
python3 -m http.server 4173
```

然后打开：<http://127.0.0.1:4173/>。

也可以直接双击 `index.html` 打开；不过部分浏览器在 `file://` 页面中会限制 IndexedDB 或本地文件选择，推荐使用静态服务器。

## 数据说明

设计数据默认保存在当前浏览器的 `BoardGameDesignerDB` IndexedDB 中。清理浏览器站点数据、使用无痕窗口或更换浏览器可能导致本地数据不可用，请定期从“文件导出”页面导出 `.bgdesign` 备份。

## AI 与 MCP 接入

设置向导完成后，AI 助手会调用用户填写的 `${API_BASE_URL}/chat/completions` 兼容端点，并以 tools/function calling 形式暴露编辑工具；也可以直接填写完整的 `/chat/completions` 地址。API Key 可留空以适配本地无鉴权代理。工具写入会进入应用撤销历史和自动保存流程。

页面同时暴露本地桥接对象：

```js
window.cardFoundryMCP.getTools()
window.cardFoundryMCP.getContext()
window.cardFoundryMCP.call('create_card', { name: '迷雾预兆', effect: '抽一张牌' })
```

该桥接对象是浏览器内的 MCP-style 适配层，方便宿主应用或后续 MCP server adapter 接入；它不会自行启动网络服务。API Key 保存在当前浏览器的 localStorage/IndexedDB，仅适合本地原型，生产环境建议通过后端代理。

## 目录

```text
index.html   页面结构
styles.css   深色工作台视觉与响应布局
app.js       页面渲染、交互、本地数据和导入导出
Documents/   每个页面的详细设计稿
```
