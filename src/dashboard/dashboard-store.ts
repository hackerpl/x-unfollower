// Dashboard cache management using chrome.storage.local

import type { DashboardCache, FollowingDetail } from '../shared/dashboard-types';

/** Storage key for dashboard cache */
const STORAGE_KEY = 'dashboard_cache';

/** Current cache schema version */
const CACHE_VERSION = 1;

/**
 * DashboardStore manages reading and writing the dashboard cache
 * in chrome.storage.local. All operations silently degrade on failure.
 */
export class DashboardStore {
  /**
   * Load cached dashboard data from storage.
   * Returns null if no cache exists or data is invalid.
   */
  async load(): Promise<DashboardCache | null> {
    try {
      const result = await chrome.storage.local.get(STORAGE_KEY);
      const cache = result[STORAGE_KEY] as DashboardCache | undefined;

      if (!cache || !Array.isArray(cache.users) || cache.cachedAt <= 0) {
        return null;
      }

      return cache;
    } catch (error) {
      console.warn('[Dashboard] Failed to load cache:', error);
      return null;
    }
  }

  /**
   * Save user data to cache with the given timestamp.
   * Rejects silently if timestamp is not a positive number.
   */
  async save(data: FollowingDetail[], timestamp: number): Promise<void> {
    if (!timestamp || timestamp <= 0) {
      return;
    }

    try {
      const cache: DashboardCache = {
        users: data,
        cachedAt: timestamp,
        version: CACHE_VERSION,
      };
      await chrome.storage.local.set({ [STORAGE_KEY]: cache });
    } catch (error) {
      console.warn('[Dashboard] Failed to save cache:', error);
    }
  }

  /**
   * Update a single user's fields in the cache.
   * Does nothing if cache or user not found.
   */
  async updateUser(userId: string, partial: Partial<FollowingDetail>): Promise<void> {
    try {
      const cache = await this.load();
      if (!cache) {
        return;
      }

      const index = cache.users.findIndex((u) => u.userId === userId);
      if (index === -1) {
        return;
      }

      cache.users[index] = { ...cache.users[index], ...partial };
      await chrome.storage.local.set({ [STORAGE_KEY]: cache });
    } catch (error) {
      console.warn('[Dashboard] Failed to update user:', error);
    }
  }

  /**
   * Remove users by their IDs from the cache.
   * Does nothing if cache not found.
   */
  async removeUsers(userIds: string[]): Promise<void> {
    try {
      const cache = await this.load();
      if (!cache) {
        return;
      }

      const idSet = new Set(userIds);
      cache.users = cache.users.filter((u) => !idSet.has(u.userId));
      await chrome.storage.local.set({ [STORAGE_KEY]: cache });
    } catch (error) {
      console.warn('[Dashboard] Failed to remove users:', error);
    }
  }

  /**
   * Clear the dashboard cache entirely.
   */
  async clear(): Promise<void> {
    try {
      await chrome.storage.local.remove(STORAGE_KEY);
    } catch (error) {
      console.warn('[Dashboard] Failed to clear cache:', error);
    }
  }
}
