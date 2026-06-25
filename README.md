# X Unfollowed

Chrome 扩展：检测 X (Twitter) 上未回关你的用户，并提供关注用户仪表盘管理功能。

## 功能

### 未回关检测（侧边栏卡片）

- 自动获取当前账号的关注列表和粉丝列表
- 对比计算出未回关用户
- 在 X 页面右侧栏嵌入原生风格卡片展示结果
- 默认显示前 3 位，点击展开全部
- 点击用户跳转到主页
- 支持浅色/深色主题自动适配
- SPA 导航时自动重新注入
- 数据缓存

### 关注仪表盘（Dashboard）

通过扩展内置标签页展示所有关注用户的详细信息：

- **用户列表**：头像、用户名、个人简介、关注数、被关注数、最近发帖时间
- **排序**：按关注数、被关注数、最近发帖时间排序（升序/降序）
- **搜索**：按用户名或显示名称实时过滤
- **取消关注**：直接在列表中取消关注（悬停变红，点击确认，成功后淡出移除）
- **Last Tweet 自动刷新**：页面加载后每 20 秒自动获取一个用户的最近发帖时间，遍历一轮后停止
- **Last Tweet 手动刷新**：缺少时间的用户显示刷新按钮，可手动即时获取
- **全量刷新**：一键清除缓存并重新获取所有关注用户信息
- **本地缓存**：数据存储在 `chrome.storage.local`，下次打开直接加载
- **三语言支持**：自动检测系统语言（英文 / 简中 / 繁中）

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
│   │   ├── index.ts           # 主入口，流程编排
│   │   ├── api-client.ts      # X API 客户端（关注/粉丝列表）
│   │   ├── dashboard-api-client.ts  # Dashboard API 客户端
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
│   │   ├── index.html         # HTML 页面
│   │   ├── index.ts           # 入口
│   │   ├── dashboard-manager.ts    # 状态编排
│   │   ├── dashboard-renderer.ts   # UI 渲染
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
2. **获取关注列表**：通过 X 内部 GraphQL API 分页获取（含关注数、被关注数、简介）
3. **获取粉丝列表**：通过 REST API 分页获取
4. **未回关计算**：集合差运算
5. **Last Tweet 获取**：通过 UserTweets GraphQL 端点获取用户最近发帖时间（每 20 秒 1 个，避免触发速率限制）
6. **取消关注**：调用 X 内部 `friendships/destroy` REST 端点

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
