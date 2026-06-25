# X Unfollowed

Chrome 扩展：检测 X (Twitter) 上你关注了但没有回关你的用户，并在 X 页面右侧栏以原生卡片形式展示。

## 功能

- 自动获取当前登录账号的关注列表和粉丝列表
- 对比计算出未回关用户
- 在 X 页面右侧栏嵌入一个原生风格的卡片，展示未回关用户列表
- 显示关注数和粉丝数统计
- 默认显示前 3 位用户，点击"显示更多"展开全部
- 点击用户可跳转到其主页
- 支持浅色/深色主题自动适配
- SPA 页面导航时自动重新注入
- 数据缓存，下次打开直接展示上次结果

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
├── manifest.json           # Chrome 扩展清单 (Manifest V3)
├── src/
│   ├── background/         # Service Worker (数据获取与处理)
│   │   ├── index.ts        # 主入口，流程编排
│   │   ├── api-client.ts   # X API 请求客户端
│   │   ├── data-processor.ts # 集合差运算
│   │   └── message-hub.ts  # Chrome 消息通信
│   ├── content/            # Content Script (页面注入与 UI)
│   │   ├── index.ts        # 主入口，卡片注入逻辑
│   │   ├── ui-renderer.ts  # UI 渲染
│   │   ├── sidebar-manager.ts # 状态管理
│   │   └── theme-detector.ts  # 主题检测
│   └── shared/             # 共享模块
│       ├── types.ts        # 类型定义
│       ├── messages.ts     # 消息类型
│       └── constants.ts    # 常量配置
├── scripts/build.mjs       # esbuild 构建脚本
├── icons/                  # 扩展图标
└── dist/                   # 构建产物
```

## 工作原理

1. **认证**：从 X 页面的 cookie 中读取 `ct0`（CSRF Token）和 `twid`（用户 ID），使用 X 公开的 App Bearer Token 发起请求
2. **获取关注列表**：通过 X 内部 GraphQL API 分页获取
3. **获取粉丝列表**：通过 X REST API (`/1.1/followers/list.json`) 分页获取
4. **计算未回关**：对两个列表做集合差运算
5. **展示**：在 X 页面右侧栏注入一个与原生卡片风格一致的 UI 卡片

## 权限说明

- `cookies`：读取 X 页面的登录 cookie（ct0, twid）
- `storage`：缓存数据和用户偏好
- `host_permissions`：访问 x.com 和 api.x.com 的 API

## 开发

```bash
# 类型检查
npm run build:check

# 构建
npm run build
```

修改源码后执行 `npm run build`，然后在扩展页面点击刷新图标即可更新。

## 许可证

MIT
