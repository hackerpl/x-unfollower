// Shared type definitions for X Non-Followers Checker

/**
 * Authentication credentials extracted from X page request headers
 */
export interface AuthCredentials {
  bearerToken: string; // Authorization: Bearer xxx
  csrfToken: string; // x-csrf-token
  extractedAt: number; // Extraction timestamp
}

/**
 * User information extracted from X GraphQL API
 */
export interface UserInfo {
  userId: string; // X platform unique user ID
  username: string; // @handle (without @ symbol)
  displayName: string; // Display name
  avatarUrl: string; // Avatar image URL
}

/**
 * Progress information during data fetching
 */
export interface FetchProgress {
  type: 'following' | 'followers';
  currentPage: number;
  totalUsers: number;
}

/**
 * Result of a single page fetch
 */
export interface FetchResult {
  users: UserInfo[];
  nextCursor: string | null;
  hasMore: boolean;
}

/**
 * Result of non-follower calculation
 */
export interface NonFollowerResult {
  nonFollowers: UserInfo[];
  followingCount: number;
  followersCount: number;
  calculatedAt: number;
}

/**
 * Cached data stored in Chrome local storage
 */
export interface CachedData {
  nonFollowers: UserInfo[];
  followingCount: number;
  followersCount: number;
  cachedAt: number; // Cache timestamp
}

/**
 * Chrome storage schema for chrome.storage.local
 */
export interface StorageSchema {
  sidebar_collapsed: boolean; // Sidebar collapse state
  cached_result: CachedData | null; // Last successful fetch result cache
}
