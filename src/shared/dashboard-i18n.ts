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
  fullRefresh: '全量刷新',
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
  fullRefresh: '全量重新整理',
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
  fullRefresh: 'Full Refresh',
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
