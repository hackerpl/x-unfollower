# X Unfollowed

[English](./README.md) | 中文

Chrome 扩展：检测 X (Twitter) 上未回关你的用户，并提供赛博风关注用户仪表盘管理功能。

## 功能

### 未回关检测（侧边栏卡片）

- 自动获取当前账号的关注列表和粉丝列表
- 对比计算出未回关用户，标题显示数量
- 在 X 页面右侧栏嵌入原生风格卡片展示结果
- 默认显示前 3 位，点击展开全部
- 点击用户跳转到主页
- 支持浅色/深色主题自动适配
- 获取关注列表时同步保存所有关注用户的详细信息到本地缓存（供 Dashboard 使用）

### 关注仪表盘（Dashboard）

通过扩展内置标签页展示所有关注用户的详细信息，赛博朋克视觉风格：

- **数据来源**：直接读取本地缓存（由侧边栏卡片流程自动写入），不额外调用 API
- **用户列表**：头像、用户名、个人简介、关注数、被关注数、最近发帖时间
- **分类 Tab**：
  - 全部 — 所有关注用户
  - ★ 星标 — 手动标记的重要账号
  - 🔥 高质 — Followers/Following > 10 的高质量账号（青色高亮）
  - 🌱 成长 — Followers/Following < 1 的成长中账号
- **星标功能**：点击星标置顶显示，不参与排序，无取消关注按钮，状态持久化
- **排序**：按关注数、被关注数、最近发帖时间排序（升序/降序）
- **搜索**：按用户名或显示名称实时过滤
- **取消关注**：直接在列表中取消关注（悬停变红，点击确认，成功后淡出移除）
- **Last Tweet 刷新**：
  - 切换 Tab 时自动获取该 Tab 下缺失时间的账号（20s/用户）
  - 点击"刷新时间"按钮获取当前 Tab 所有账号的最近发帖时间
  - 单个用户可手动点击 ↻ 按钮即时获取
- **本地缓存**：数据存储在 `chrome.storage.local`，刷新页面直接加载
- **三语言支持**：根据浏览器首选语言自动切换（英文 / 简中 / 繁中）

### 数据更新策略

| 操作 | 触发时机 | 说明 |
|------|----------|------|
| 拉取关注列表 + 写入缓存 | 打开 X 页面，卡片加载时 | 自动完成，无需手动操作 |
| Dashboard 读取数据 | 打开 Dashboard 页面时 | 只读本地缓存，不调 API |
| 补全 Last Tweet | 切换 Tab 时 | 自动获取缺失的，20s/用户 |
| 刷新 Last Tweet | 点击"刷新时间"按钮 | 获取当前 Tab 所有账号，20s/用户 |

### 入口

- 侧边栏卡片标题栏的 📊 图标按钮 → 打开 Dashboard 标签页
- 支持 Ctrl+点击在新标签页打开

## 安装

1. 克隆项目并安装依赖：

```bash
npm install
```

2. 构建：

```bash
npm run build
```

3. 在 Chrome 中加载：
   - 打开 `chrome://extensions/`
   - 开启「开发者模式」
   - 点击「加载已解压的扩展程序」
   - 选择本项目根目录

## 项目结构

```
├── manifest.json              # Chrome 扩展清单 (Manifest V3)
├── src/
│   ├── background/            # Service Worker
│   │   ├── index.ts           # 主入口，流程编排 + dashboard 缓存写入
│   │   ├── api-client.ts      # X API 客户端（关注/粉丝列表 + 详细信息提取）
│   │   ├── dashboard-api-client.ts  # Dashboard API 客户端（Last Tweet 获取）
│   │   ├── dashboard-message-handler.ts # Dashboard 消息路由
│   │   ├── data-processor.ts  # 集合差运算
│   │   ├── message-hub.ts     # Chrome 消息通信
│   │   └── process-users.ts   # 顺序处理工具
│   ├── content/               # Content Script（页面注入）
│   │   ├── index.ts           # 卡片注入逻辑
│   │   ├── ui-renderer.ts     # UI 渲染
│   │   ├── sidebar-manager.ts # 状态管理
│   │   └── theme-detector.ts  # 主题检测
│   ├── dashboard/             # Dashboard 标签页
│   │   ├── index.html         # HTML 页面（赛博朋克主题）
│   │   ├── index.ts           # 入口
│   │   ├── dashboard-manager.ts    # 状态编排
│   │   ├── dashboard-renderer.ts   # UI 渲染（表格/Tab/排序/搜索/星标）
│   │   ├── dashboard-store.ts      # 缓存管理
│   │   ├── incremental-updater.ts  # 增量更新
│   │   └── locale-detector.ts     # 语言检测
│   └── shared/                # 共享模块
│       ├── types.ts           # 类型定义
│       ├── messages.ts        # 消息类型
│       ├── constants.ts       # 常量
│       ├── i18n.ts            # 国际化（侧边栏）
│       ├── dashboard-types.ts # Dashboard 类型
│       ├── dashboard-messages.ts # Dashboard 消息
│       └── dashboard-i18n.ts  # Dashboard 国际化
├── scripts/build.mjs          # esbuild 构建脚本
├── icons/                     # 扩展图标
└── dist/                      # 构建产物
```

## 工作原理

1. **认证**：从 X 页面 cookie 读取 `ct0`（CSRF Token）和 `twid`（用户 ID），使用公开 App Bearer Token
2. **获取关注列表**：通过 X 内部 GraphQL API 分页获取（同时提取 friends_count、followers_count、bio 等详细信息）
3. **获取粉丝列表**：通过 REST API 分页获取
4. **未回关计算**：集合差运算
5. **写入 Dashboard 缓存**：关注列表获取完成后，将所有详细信息写入 `chrome.storage.local`（保留已有的 starred 状态和 lastTweetTime）
6. **Last Tweet 获取**：通过 UserTweets GraphQL 端点获取用户最近发帖时间（20s/用户，避免触发速率限制）
7. **取消关注**：调用 X 内部 `friendships/destroy` REST 端点

## 权限说明

- `cookies`：读取 X 页面的登录 cookie
- `storage`：缓存数据
- `tabs`：打开/激活 Dashboard 标签页，点击用户名时查找已有标签
- `host_permissions`：访问 x.com 和 api.x.com

## 开发

```bash
# 类型检查
npm run build:check

# 构建
npm run build

# 测试
npm run test
```

修改源码后执行 `npm run build`，在扩展页面点击刷新图标更新。

## 许可证

MIT
