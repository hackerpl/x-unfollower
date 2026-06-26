# X Unfollowed

English | [中文](./README_CN.md)

A Chrome extension that detects users on X (Twitter) who don't follow you back, with a cyberpunk-styled following dashboard for managing your connections.

## Features

### Non-Follower Detection (Sidebar Card)

- Automatically fetches your following and followers lists
- Calculates and displays non-followers with count in the title
- Embeds a native-style card in X's right sidebar
- Shows first 3 users by default, expandable to full list
- Click users to visit their profile
- Adapts to light/dark theme automatically
- Syncs all following user details to local cache (for Dashboard use)

### Following Dashboard

A built-in extension tab page showing detailed info for all followed users, with a cyberpunk visual theme:

- **Data Source**: Reads directly from local cache (auto-populated by sidebar card flow), no extra API calls
- **User List**: Avatar, username, bio, following count, followers count, last tweet time
- **Category Tabs**:
  - All — All followed users
  - ★ Starred — Manually marked important accounts
  - 🔥 Quality — Accounts with Followers/Following > 10 (cyan highlight)
  - 🌱 Growing — Accounts with Followers/Following < 1
- **Star Feature**: Starred users pin to top, excluded from sorting, no unfollow button, persisted locally
- **Sorting**: By following count, followers count, or last tweet time (ascending/descending)
- **Search**: Real-time filtering by username or display name
- **Unfollow**: Directly unfollow from the list (hover turns red, click to confirm, fade-out on success)
- **Last Tweet Refresh**:
  - Switching tabs auto-fetches missing last tweet times (20s/user)
  - "Refresh Time" button fetches all accounts in current tab
  - Per-user ↻ button for instant manual fetch
- **Local Cache**: Data stored in `chrome.storage.local`, loads instantly on page refresh
- **Trilingual**: Auto-switches based on browser language (English / Simplified Chinese / Traditional Chinese)

### Data Update Strategy

| Action | Trigger | Description |
|--------|---------|-------------|
| Fetch following list + write cache | Opening X page, card loads | Automatic, no manual action needed |
| Dashboard reads data | Opening Dashboard page | Reads local cache only, no API calls |
| Fill missing Last Tweet | Switching tabs | Auto-fetches missing ones, 20s/user |
| Refresh Last Tweet | Click "Refresh Time" button | Fetches all accounts in current tab, 20s/user |

### Entry Point

- 📊 icon button in sidebar card title bar → opens Dashboard tab
- Supports Ctrl+click to open in new tab

## Installation

1. Clone and install dependencies:

```bash
npm install
```

2. Build:

```bash
npm run build
```

3. Load in Chrome:
   - Navigate to `chrome://extensions/`
   - Enable "Developer mode"
   - Click "Load unpacked"
   - Select this project's root directory

## Project Structure

```
├── manifest.json              # Chrome extension manifest (Manifest V3)
├── src/
│   ├── background/            # Service Worker
│   │   ├── index.ts           # Main entry, orchestration + dashboard cache write
│   │   ├── api-client.ts      # X API client (following/followers + detail extraction)
│   │   ├── dashboard-api-client.ts  # Dashboard API client (Last Tweet fetch)
│   │   ├── dashboard-message-handler.ts # Dashboard message routing
│   │   ├── data-processor.ts  # Set difference calculation
│   │   ├── message-hub.ts     # Chrome messaging
│   │   └── process-users.ts   # Sequential processing utility
│   ├── content/               # Content Script (page injection)
│   │   ├── index.ts           # Card injection logic
│   │   ├── ui-renderer.ts     # UI rendering
│   │   ├── sidebar-manager.ts # State management
│   │   └── theme-detector.ts  # Theme detection
│   ├── dashboard/             # Dashboard tab page
│   │   ├── index.html         # HTML page (cyberpunk theme)
│   │   ├── index.ts           # Entry point
│   │   ├── dashboard-manager.ts    # State orchestration
│   │   ├── dashboard-renderer.ts   # UI rendering (table/tabs/sort/search/star)
│   │   ├── dashboard-store.ts      # Cache management
│   │   ├── incremental-updater.ts  # Incremental updates
│   │   └── locale-detector.ts     # Language detection
│   └── shared/                # Shared modules
│       ├── types.ts           # Type definitions
│       ├── messages.ts        # Message types
│       ├── constants.ts       # Constants
│       ├── i18n.ts            # i18n (sidebar)
│       ├── dashboard-types.ts # Dashboard types
│       ├── dashboard-messages.ts # Dashboard messages
│       └── dashboard-i18n.ts  # Dashboard i18n
├── scripts/build.mjs          # esbuild build script
├── icons/                     # Extension icons
└── dist/                      # Build output
```

## How It Works

1. **Authentication**: Reads `ct0` (CSRF token) and `twid` (user ID) from X page cookies, uses the public App Bearer Token
2. **Fetch Following List**: Via X internal GraphQL API with pagination (extracts friends_count, followers_count, bio, etc.)
3. **Fetch Followers List**: Via REST API with pagination
4. **Non-Follower Calculation**: Set difference operation
5. **Write Dashboard Cache**: After fetching, writes all detailed info to `chrome.storage.local` (preserving existing starred status and lastTweetTime)
6. **Last Tweet Fetch**: Via UserTweets GraphQL endpoint (20s/user to avoid rate limiting)
7. **Unfollow**: Calls X internal `friendships/destroy` REST endpoint

## Permissions

- `cookies`: Read X page login cookies
- `storage`: Cache data locally
- `tabs`: Open/activate Dashboard tab, find existing tabs on username click
- `host_permissions`: Access x.com and api.x.com

## Development

```bash
# Type check
npm run build:check

# Build
npm run build

# Test
npm run test
```

After modifying source, run `npm run build` and click the refresh icon on the extensions page to update.

## License

MIT
