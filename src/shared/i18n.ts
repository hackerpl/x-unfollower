// Internationalization module
// Detects language from X page's <html lang=""> attribute
// Supports: zh-CN (Simplified Chinese), zh-TW (Traditional Chinese), fallback to English

export type Locale = 'zh-CN' | 'zh-TW' | 'en';

export interface I18nStrings {
  title: string;
  following: string;
  followers: string;
  nonFollowers: string;
  showMore: string;
  collapse: string;
  refresh: string;
  loading: string;
  loadingFollowing: (page: number, count: number) => string;
  loadingFollowers: (page: number, count: number) => string;
  emptyState: string;
  errorRateLimit: string;
  errorNetwork: string;
  errorParseError: string;
  errorAuthExpired: string;
  errorUnknown: string;
  retry: string;
  retryLater: string;
  loginRequired: string;
}

const zhCN: I18nStrings = {
  title: '未回关用户',
  following: '关注',
  followers: '粉丝',
  nonFollowers: '位未回关',
  showMore: '显示更多',
  collapse: '收起',
  refresh: '刷新数据',
  loading: '正在初始化，获取认证信息...',
  loadingFollowing: (page, count) => `正在获取关注列表 第${page}页 (已获取${count}人)...`,
  loadingFollowers: (page, count) => `正在获取粉丝列表 第${page}页 (已获取${count}人)...`,
  emptyState: '所有关注的用户都已回关',
  errorRateLimit: '请求频率超限，请稍后再试',
  errorNetwork: '网络连接失败，请检查网络后重试',
  errorParseError: '数据解析错误',
  errorAuthExpired: '认证已过期，请刷新页面重新登录',
  errorUnknown: '发生未知错误，请稍后再试',
  retry: '重试',
  retryLater: '请稍后再试',
  loginRequired: '请先登录 X 以使用此功能',
};

const zhTW: I18nStrings = {
  title: '未回追用戶',
  following: '追蹤中',
  followers: '追蹤者',
  nonFollowers: '位未回追',
  showMore: '顯示更多',
  collapse: '收起',
  refresh: '重新整理',
  loading: '正在初始化，取得認證資訊...',
  loadingFollowing: (page, count) => `正在取得追蹤清單 第${page}頁 (已取得${count}人)...`,
  loadingFollowers: (page, count) => `正在取得追蹤者清單 第${page}頁 (已取得${count}人)...`,
  emptyState: '所有追蹤的用戶都已回追',
  errorRateLimit: '請求頻率超過限制，請稍後再試',
  errorNetwork: '網路連線失敗，請檢查網路後重試',
  errorParseError: '資料解析錯誤',
  errorAuthExpired: '認證已過期，請重新整理頁面重新登入',
  errorUnknown: '發生未知錯誤，請稍後再試',
  retry: '重試',
  retryLater: '請稍後再試',
  loginRequired: '請先登入 X 以使用此功能',
};

const en: I18nStrings = {
  title: 'Non-Followers',
  following: 'Following',
  followers: 'Followers',
  nonFollowers: 'not following back',
  showMore: 'Show more',
  collapse: 'Show less',
  refresh: 'Refresh',
  loading: 'Initializing...',
  loadingFollowing: (page, count) => `Fetching following list page ${page} (${count} found)...`,
  loadingFollowers: (page, count) => `Fetching followers list page ${page} (${count} found)...`,
  emptyState: 'Everyone you follow follows you back',
  errorRateLimit: 'Rate limited. Please try again later.',
  errorNetwork: 'Network error. Please check your connection.',
  errorParseError: 'Data parsing error',
  errorAuthExpired: 'Session expired. Please refresh the page.',
  errorUnknown: 'An unknown error occurred. Please try again.',
  retry: 'Retry',
  retryLater: 'Try again later',
  loginRequired: 'Please log in to X first',
};

const locales: Record<Locale, I18nStrings> = { 'zh-CN': zhCN, 'zh-TW': zhTW, en };

/**
 * Detect the current locale from the X page's <html lang=""> attribute.
 * Returns 'zh-CN', 'zh-TW', or 'en' (default).
 */
export function detectLocale(): Locale {
  const lang = document.documentElement.getAttribute('lang') || '';
  const normalized = lang.toLowerCase().trim();

  if (normalized === 'zh-cn' || normalized === 'zh-hans' || normalized === 'zh') {
    return 'zh-CN';
  }
  if (normalized === 'zh-tw' || normalized === 'zh-hant' || normalized === 'zh-hk') {
    return 'zh-TW';
  }
  return 'en';
}

/**
 * Get the i18n strings for the current locale.
 */
export function getStrings(locale?: Locale): I18nStrings {
  const l = locale || detectLocale();
  return locales[l];
}
