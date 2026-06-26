// Dashboard shared type definitions

/**
 * Detailed information for a followed user, extends base UserInfo
 */
export interface FollowingDetail {
  userId: string;
  username: string;
  displayName: string;
  avatarUrl: string;
  bio: string | null; // User's profile description/bio
  friendsCount: number; // Number of accounts this user follows
  followersCount: number; // Number of followers this user has
  lastTweetTime: string | null; // ISO 8601 timestamp of most recent tweet
  starred?: boolean; // Whether user is starred (pinned to top)
  fetchedAt: number; // Timestamp when detail was fetched
}

/**
 * Complete cache structure stored in chrome.storage.local
 */
export interface DashboardCache {
  users: FollowingDetail[];
  cachedAt: number; // Must be positive number (> 0)
  version: number; // Cache schema version for future migrations
}

/**
 * Sort field options for dashboard list
 */
export type SortField = 'friends_count' | 'followers_count' | 'last_tweet_time';

/**
 * Progress information for fetching user details
 */
export interface DashboardProgress {
  current: number;
  total: number;
}

/**
 * Error information displayed in dashboard
 */
export interface DashboardError {
  errorType: 'rate_limit' | 'network' | 'auth_expired' | 'unknown';
  message: string;
}

/**
 * Complete dashboard state managed by DashboardManager
 */
export interface DashboardState {
  isLoading: boolean;
  users: FollowingDetail[];
  filteredUsers: FollowingDetail[];
  currentTab: 'all' | 'starred' | 'quality' | 'growing';
  sortField: SortField;
  sortOrder: 'asc' | 'desc';
  searchQuery: string;
  fetchProgress: DashboardProgress | null;
  error: DashboardError | null;
  lastUpdatedAt: number | null;
}
