// Dashboard-specific internationalization module
// Extends the existing i18n mechanism for Dashboard pages
// Uses navigator.language instead of document.documentElement.lang
// because Dashboard is a Chrome extension built-in page that cannot access X page's HTML lang attribute

import { Locale } from './i18n';

export interface DashboardI18nStrings {
  dashboardTitle: string;
  followingButton: string;
  unfollowButton: string;
  searchPlaceholder: string;
  sortByFriends: string;
  sortByFollowers: string;
  sortByLastTweet: string;
  ascending: string;
  descending: string;
  progress: (current: number, total: number) => string;
  grokProgress: (analyzed: number, total: number) => string;
  fullRefresh: string;
  openDashboard: string;
  authExpired: string;
  networkError: string;
  retryButton: string;
  noData: string;
  emptyState: string;
  analysisPending: string;
  analysisFailed: string;
  lastUpdated: (time: string) => string;
  fetchFailed: string;
  unfollowSuccess: string;
  unfollowFailed: string;
  loadingData: string;
  // Table headers
  headerName: string;
  headerBio: string;
  headerFollowing: string;
  headerFollowers: string;
  headerLastTweet: string;
  headerAction: string;
  // Relative time
  timeJustNow: string;
  timeMinutesAgo: (n: number) => string;
  timeHoursAgo: (n: number) => string;
  timeDaysAgo: (n: number) => string;
  // Tabs
  tabAll: string;
  tabStarred: string;
  tabQuality: string;
  tabGrowing: string;
  // Misc UI
  hintCacheInfo: string;
  noDataMessage: string;
  loginPrompt: string;
  starAdd: string;
  starRemove: string;
  refreshTweetTime: string;
}

const zhCN: DashboardI18nStrings = {
  dashboardTitle: '关注仪表盘',
  followingButton: '正在关注',
  unfollowButton: '取消关注',
  searchPlaceholder: '搜索用户名或显示名称...',
  sortByFriends: '按关注数排序',
  sortByFollowers: '按被关注数排序',
  sortByLastTweet: '按最近发帖排序',
  ascending: '升序',
  descending: '降序',
  progress: (current, total) => `正在获取 ${current}/${total}`,
  grokProgress: (analyzed, total) => `分析进度 ${analyzed}/${total}`,
  fullRefresh: '刷新时间',
  openDashboard: '打开仪表盘',
  authExpired: '认证已过期，请刷新 X 页面重新登录',
  networkError: '网络连接失败，请检查网络后重试',
  retryButton: '重试',
  noData: '暂无数据',
  emptyState: '你还没有关注任何人',
  analysisPending: '等待分析',
  analysisFailed: '分析失败',
  lastUpdated: (time) => `上次更新：${time}`,
  fetchFailed: '获取失败',
  unfollowSuccess: '已取消关注',
  unfollowFailed: '取消关注失败',
  loadingData: '正在加载数据...',
  headerName: '昵称',
  headerBio: '简介',
  headerFollowing: '关注',
  headerFollowers: '粉丝',
  headerLastTweet: '最近发帖',
  headerAction: '操作',
  timeJustNow: '刚刚',
  timeMinutesAgo: (n) => `${n}分钟前`,
  timeHoursAgo: (n) => `${n}小时前`,
  timeDaysAgo: (n) => `${n}天前`,
  tabAll: '全部',
  tabStarred: '★ 星标',
  tabQuality: '🔥 高质',
  tabGrowing: '🌱 成长',
  hintCacheInfo: '数据状态保存在本地缓存，刷新页面后保留，切换浏览器失效',
  noDataMessage: '暂无数据，请先访问 X 页面以自动拉取关注列表',
  loginPrompt: '请先登录 X (twitter.com)，然后重新打开此页面',
  starAdd: '添加星标',
  starRemove: '取消星标',
  refreshTweetTime: '获取最近发帖时间',
};

const zhTW: DashboardI18nStrings = {
  dashboardTitle: '關注儀表板',
  followingButton: '正在跟隨',
  unfollowButton: '取消跟隨',
  searchPlaceholder: '搜尋使用者名稱或顯示名稱...',
  sortByFriends: '按關注數排序',
  sortByFollowers: '按被關注數排序',
  sortByLastTweet: '按最近發文排序',
  ascending: '升序',
  descending: '降序',
  progress: (current, total) => `正在取得 ${current}/${total}`,
  grokProgress: (analyzed, total) => `分析進度 ${analyzed}/${total}`,
  fullRefresh: '刷新時間',
  openDashboard: '開啟儀表板',
  authExpired: '認證已過期，請重新整理 X 頁面重新登入',
  networkError: '網路連線失敗，請檢查網路後重試',
  retryButton: '重試',
  noData: '暫無資料',
  emptyState: '你還沒有關注任何人',
  analysisPending: '等待分析',
  analysisFailed: '分析失敗',
  lastUpdated: (time) => `上次更新：${time}`,
  fetchFailed: '取得失敗',
  unfollowSuccess: '已取消跟隨',
  unfollowFailed: '取消跟隨失敗',
  loadingData: '正在載入資料...',
  headerName: '暱稱',
  headerBio: '簡介',
  headerFollowing: '關注',
  headerFollowers: '粉絲',
  headerLastTweet: '最近發文',
  headerAction: '操作',
  timeJustNow: '剛剛',
  timeMinutesAgo: (n) => `${n}分鐘前`,
  timeHoursAgo: (n) => `${n}小時前`,
  timeDaysAgo: (n) => `${n}天前`,
  tabAll: '全部',
  tabStarred: '★ 星標',
  tabQuality: '🔥 高質',
  tabGrowing: '🌱 成長',
  hintCacheInfo: '資料狀態保存在本地快取，重新整理頁面後保留，切換瀏覽器失效',
  noDataMessage: '暫無資料，請先造訪 X 頁面以自動拉取關注清單',
  loginPrompt: '請先登入 X (twitter.com)，然後重新開啟此頁面',
  starAdd: '加入星標',
  starRemove: '取消星標',
  refreshTweetTime: '取得最近發文時間',
};

const en: DashboardI18nStrings = {
  dashboardTitle: 'Following Dashboard',
  followingButton: 'Following',
  unfollowButton: 'Unfollow',
  searchPlaceholder: 'Search by username or display name...',
  sortByFriends: 'Sort by following',
  sortByFollowers: 'Sort by followers',
  sortByLastTweet: 'Sort by last tweet',
  ascending: 'Ascending',
  descending: 'Descending',
  progress: (current, total) => `Fetching ${current}/${total}`,
  grokProgress: (analyzed, total) => `Analyzing ${analyzed}/${total}`,
  fullRefresh: 'Refresh Time',
  openDashboard: 'Open Dashboard',
  authExpired: 'Session expired. Please refresh the X page and log in again.',
  networkError: 'Network error. Please check your connection.',
  retryButton: 'Retry',
  noData: 'No data available',
  emptyState: 'You are not following anyone yet',
  analysisPending: 'Pending analysis',
  analysisFailed: 'Analysis failed',
  lastUpdated: (time) => `Last updated: ${time}`,
  fetchFailed: 'Fetch failed',
  unfollowSuccess: 'Unfollowed successfully',
  unfollowFailed: 'Failed to unfollow',
  loadingData: 'Loading data...',
  headerName: 'Name',
  headerBio: 'Bio',
  headerFollowing: 'Following',
  headerFollowers: 'Followers',
  headerLastTweet: 'Last Tweet',
  headerAction: 'Action',
  timeJustNow: 'just now',
  timeMinutesAgo: (n) => `${n}m ago`,
  timeHoursAgo: (n) => `${n}h ago`,
  timeDaysAgo: (n) => `${n}d ago`,
  tabAll: 'All',
  tabStarred: '★ Starred',
  tabQuality: '🔥 Quality',
  tabGrowing: '🌱 Growing',
  hintCacheInfo: 'Data is cached locally. Persists on page refresh, lost when switching browsers.',
  noDataMessage: 'No data yet. Please visit X page first to auto-fetch your following list.',
  loginPrompt: 'Please log in to X (twitter.com) first, then reopen this page.',
  starAdd: 'Add star',
  starRemove: 'Remove star',
  refreshTweetTime: 'Fetch last tweet time',
};

const dashboardLocales: Record<Locale, DashboardI18nStrings> = {
  'zh-CN': zhCN,
  'zh-TW': zhTW,
  en,
};

/**
 * Detect the current locale from navigator.language.
 * Used for Dashboard pages (Chrome extension built-in pages)
 * which cannot access X page's HTML lang attribute.
 *
 * Mapping:
 * - zh-CN, zh-Hans, zh → 'zh-CN'
 * - zh-TW, zh-Hant, zh-HK → 'zh-TW'
 * - Everything else → 'en'
 */
export function detectDashboardLocale(): Locale {
  const lang = (navigator.language || '').toLowerCase().trim();

  if (lang === 'zh-cn' || lang === 'zh-hans' || lang === 'zh') {
    return 'zh-CN';
  }
  if (lang === 'zh-tw' || lang === 'zh-hant' || lang === 'zh-hk') {
    return 'zh-TW';
  }
  return 'en';
}

/**
 * Get the Dashboard i18n strings for the given locale.
 * If no locale is provided, auto-detects from navigator.language.
 */
export function getDashboardStrings(locale?: Locale): DashboardI18nStrings {
  const l = locale || detectDashboardLocale();
  return dashboardLocales[l];
}
