# 豆瓣书评导出工具

一个 Chrome 浏览器扩展，通过豆瓣移动端 API 获取用户已读书单，并支持导出为 CSV 和 HTML 格式。

## 功能特性

- 自动爬取豆瓣已读书单（使用 Rexxar 移动端 API，稳定高效）
- 支持导出为 CSV 格式（UTF-8 BOM 编码，Excel 直接打开中文不乱码）
- 支持导出为 HTML 格式（卡片式排版，可直接在浏览器阅读或分享）
- 支持手动输入豆瓣 ID，无需停留在豆瓣页面
- 支持自动识别当前标签页的豆瓣用户
- 实时进度显示，后台爬取不影响当前浏览
- 多用户数据隔离存储，同一浏览器可管理多个账号数据
- 遵循 Chrome 扩展 Manifest V3 标准

## 安装方法

1. 下载或克隆本项目到本地
2. 打开 Chrome 浏览器，进入扩展管理页面（`chrome://extensions/`）
3. 开启右上角的「开发者模式」
4. 点击「加载已解压的扩展程序」
5. 选择项目中的 `extension` 文件夹
6. 扩展安装成功后会在 Chrome 工具栏出现扩展图标

## 使用说明

### 方法一：手动输入豆瓣 ID（推荐）

1. 点击 Chrome 工具栏中的扩展图标，打开弹窗
2. 在「豆瓣 ID 输入」框中填写豆瓣用户名或 ID（例如 `herofox2024`）
3. 点击「开始爬取书评」，等待进度条到达 100%
4. 选择导出格式（CSV 或 HTML），点击「导出数据」
5. 在弹出的保存对话框中选择保存位置

### 方法二：自动识别当前页面用户

1. 在浏览器中打开豆瓣已读书单页面（URL 格式：`https://book.douban.com/people/你的用户名/collect`）
2. 点击扩展图标，弹窗会自动识别当前用户
3. 点击「开始爬取书评」，后续步骤同方法一

> 爬取公开书单无需登录；若书单为私密设置，需在浏览器中登录对应豆瓣账号后再爬取。

## 技术原理

### 核心架构

扩展采用三层架构：

| 层 | 组件 | 职责 |
|----|------|------|
| 数据层 | `BookDataManager` | 书籍数据的读写与多用户隔离存储 |
| 逻辑层 | `DoubanCrawler` + `Exporter` | API 请求、数据映射、文件生成 |
| UI 层 | `popup.html` / `popup.js` | 用户交互、进度显示、消息通信 |

### CORS 问题解决方案

Service Worker 发起的 `fetch` 请求会被浏览器自动附加 `Origin: chrome-extension://...` 头，豆瓣服务端识别后返回 400。解决方案：

- 不在 Service Worker 中直接发请求
- 使用 `chrome.scripting.executeScript` 将请求注入豆瓣标签页上下文执行
- 此时请求的 `Origin` 为 `https://m.douban.com`，浏览器也会自动携带对应 Cookie

### API 接口

```
GET https://m.douban.com/rexxar/api/v2/user/{userId}/interests
    ?type=book&status=done&count=50&start={offset}&for_mobile=1
```

- 每页最多返回 50 条，通过 `start` 参数分页
- 响应包含 `total` 字段，用于计算实际进度
- 请求在豆瓣标签页上下文执行，携带 `credentials: 'include'` 自动附带 Cookie

### 出版社提取

Rexxar API 的 `subject` 对象不返回 `publisher` 字段，插件从 `card_subtitle` 字段（格式：`作者 / 出版社 / 出版年份`）中解析出版社作为兜底。

### 日期标准化

API 返回的日期格式不统一，插件通过 `normalizeDate()` 方法将所有格式统一转换为 `yyyy-mm-dd`：

| 原始值 | 输出 |
|--------|------|
| `2020` | `2020-01-01` |
| `2020-5` | `2020-05-01` |
| `2020年5月` | `2020-05-01` |
| `2020年5月1日` | `2020-05-01` |

## 项目结构

```
extension/
├── manifest.json      # 扩展配置：权限声明、脚本注册、CSP 策略
├── background.js      # 后台 Service Worker：爬虫调度、数据管理、文件导出
├── popup.html         # 弹窗 UI：输入框、按钮、进度条
├── popup.js           # 弹窗交互：用户ID解析、消息通信、状态更新
└── content.js         # 内容脚本：页面用户ID提取（辅助功能）
```

### 关键类说明

**`BookDataManager`**

按用户 ID 隔离存储，底层使用 `chrome.storage.local`：

```
storage.local = {
  'doubanBooks_{userId}': [...],  // 该用户的书籍数组
  'currentDoubanUserId': '...'    // 当前活跃用户ID
}
```

**`DoubanCrawler`**

- `getUserIdFromPage()`：从 URL 或页面 DOM 提取用户 ID
- `getDoubanTab()`：优先复用已有豆瓣标签页，无则在后台临时创建
- `fetchPageViaTab()`：在豆瓣标签页上下文执行分页 API 请求
- `mapInterestToBook()`：将 API 数据结构转换为插件统一的书籍对象
- `crawlAllBooks()`：完整爬取流程，含进度回调，每页请求间隔 500ms

**`Exporter`**

- `exportToCSV()`：生成带 UTF-8 BOM 的 CSV，字段内引号按规范转义
- `exportToHTML()`：生成含统计信息和卡片式书单的完整 HTML 页面
- `escapeHtml()`：对所有输出到 HTML 的数据做转义，防止 XSS

## 数据字段说明

导出文件包含以下字段：

| 字段 | 说明 | 示例 |
|------|------|------|
| 书名 | 书籍标题 | 绝对不在场证明 |
| 作者 | 作者，多人用 ` / ` 分隔 | [日] 大山诚一郎 |
| 出版日期 | 统一为 `yyyy-mm-dd` 格式 | 2020-05-01 |
| 出版社 | 出版社名称 | 新星出版社 |
| 豆瓣链接 | 书籍豆瓣详情页 URL | https://book.douban.com/subject/34998167/ |
| 评分 | 用户对该书的评分 | 4分 |
| 书评内容 | 用户的短评文字 | 推理严密，结局出人意料 |
| 评分日期 | 用户标记已读的日期 | 2026-02-26 |

## 常见问题

### Q: 爬取失败，提示「无法获取用户 ID」

A: 请在「豆瓣 ID 输入」框中手动填写豆瓣用户名后重试，或先打开豆瓣已读书单页面再使用扩展。

### Q: 爬取失败，提示「书单为私密设置」

A: 该用户的书单设置了隐私保护。若是自己的账号，请确保已在浏览器中登录豆瓣后再爬取。

### Q: 导出的 CSV 用 Excel 打开显示乱码

A: 文件已包含 UTF-8 BOM，正常情况下 Excel 可直接识别。若仍乱码，请在 Excel 中使用「数据 → 从文本/CSV 导入」并选择 UTF-8 编码。

### Q: 导出失败，提示「没有数据可导出」

A: 请先点击「开始爬取书评」完成爬取后再导出。

### Q: 爬取进度一直不动

A: 请检查网络连接是否正常，或确认当前浏览器中已打开至少一个豆瓣页面后重试。

## 注意事项

1. 请遵守豆瓣网站的使用规则，不要频繁重复爬取
2. 数据存储在浏览器本地，卸载扩展后数据将丢失，建议定期导出备份
3. 爬取过程中请保持浏览器运行，不要关闭豆瓣相关标签页

## 许可证

MIT License

## 更新日志

### v1.0.4 (2026-03-11)

**Bug 修复**
- 修复 `getBooks()` 和 `getCurrentUserId()` 中 Chrome Storage API 缺少 `lastError` 检查的问题
- 修复 `chrome.tabs.query` 调用缺少 `lastError` 检查的问题
- 修复 `chrome.cookies.get` 调用缺少 `lastError` 检查的问题
- 修复 `chrome.tabs.remove` 关闭标签页时缺少错误处理的问题
- 修复事件监听器潜在内存泄漏问题，为 `tabs.onUpdated` 添加超时机制
- 修复爬取/导出/清空按钮可重复点击导致并发问题
- 修复 CSV/HTML 导出下载失败时错误返回成功状态的问题

**功能优化**
- 优化 Manifest V3 权限，移除不必要的 `tabs` 权限
- 精简 Content Script 选择器，添加注释说明
- 提取硬编码的 API URL 为配置常量 `CONFIG`
- 新增自动爬取开关设置，用户可控制是否在访问已读书单页面时自动爬取

**代码质量改进**
- 优化正则表达式创建位置，避免循环内重复创建
- 优化页面加载事件处理，使用 `document.readyState` 确保初始化正确执行
- 完善错误处理和日志输出

### v1.0.3 (2026-03-06)

- 使用豆瓣移动端 Rexxar API 替代页面解析，提高爬取稳定性和效率
- 通过 `chrome.scripting.executeScript` 在豆瓣标签页上下文执行请求，解决 Service Worker 被豆瓣服务端以 400 拒绝的问题
- 新增 `normalizeDate()` 方法，将 API 返回的各种日期格式（如 `2020-5`、`2020年5月`、`2020` 等）统一转换为 `yyyy-mm-dd`
- 新增 `parseCardSubtitle()` 方法，从 `card_subtitle` 字段解析出版社，修复出版社显示为「未知出版社」的问题
- 优化用户ID提取逻辑，支持从 URL、页面 DOM 多路径获取
- 修复 XSS 漏洞：`popup.js` 中用户名显示改用 DOM 操作替代 `innerHTML`，HTML 导出中对书籍链接做转义处理
- 更新 `manifest.json`，在 `host_permissions` 中添加 `https://m.douban.com/*` 移动端域名权限

### v1.0.2 (2026-03-05)

- 添加了手动 Douban ID 输入功能，无需登录豆瓣网页即可使用
- ~~恢复到使用页面解析的爬取方式，提高稳定性~~
- ~~优化了后台爬取逻辑，使用隐藏标签页进行页面解析~~
- ~~增强了数据提取能力，支持多种页面布局~~
- 修复了manifest.json配置文件
- 删除了不需要的test_selectors.js文件

### v1.0.1 (2025-12-23)

- 修复了background.js中的代码错误
- ~~改进了爬取逻辑，增强了页面元素选择器的兼容性~~
- ~~重写了`crawlPageInBackgroundTab`方法，优化了后台爬取效率~~
- ~~增强了content.js的数据提取能力，支持多种页面布局~~
- 添加了详细的调试日志，便于问题排查
- 优化了数据提取逻辑，提高了数据准确性

### v1.0.0 (2025-12-22)

- 初始版本发布
- 支持豆瓣已读书单爬取
- 支持CSV和HTML格式导出
- 实现后台爬取功能
- 优化消息传递机制，解决消息端口关闭问题

## 贡献

欢迎提交Issue和Pull Request，共同改进这个工具。

## 联系方式

如有问题或建议，欢迎通过以下方式联系：

- GitHub Issues：[提交问题](https://github.com/herofox2024/douban-book-exporter/issues)
- 邮箱：42845734@qq.com

---

**使用提示**：请合理使用本工具，遵守豆瓣网站的使用规则，不要进行恶意爬取或滥用。
