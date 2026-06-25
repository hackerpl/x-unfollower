// Incremental update logic for dashboard cache synchronization

import type { FollowingDetail } from '../shared/dashboard-types';
import type { DashboardStore } from './dashboard-store';

/**
 * Result of computing the difference between cached users and latest following list
 */
export interface IncrementalUpdateResult {
  newUserIds: string[]; // Users in latest list but not in cache (need to fetch details)
  removedUserIds: string[]; // Users in cache but not in latest list (to be removed)
  retainedUsers: FollowingDetail[]; // Users present in both (unchanged)
}

/**
 * IncrementalUpdater handles set-difference computation and cache updates
 * for the dashboard's incremental synchronization strategy.
 */
export class IncrementalUpdater {
  /**
   * Compute the set difference between cached users and the latest following list.
   * This is a pure function with no side effects.
   *
   * @param cachedUsers - Currently cached user details
   * @param latestUserIds - User IDs from the latest following list
   * @returns The diff result identifying new, removed, and retained users
   */
  computeDiff(
    cachedUsers: FollowingDetail[],
    latestUserIds: string[]
  ): IncrementalUpdateResult {
    const latestSet = new Set(latestUserIds);
    const cachedIdSet = new Set(cachedUsers.map((u) => u.userId));

    // Users in latest list but not in cache -> new users needing detail fetch
    const newUserIds = latestUserIds.filter((id) => !cachedIdSet.has(id));

    // Users in cache but not in latest list -> removed users
    const removedUserIds = cachedUsers
      .filter((u) => !latestSet.has(u.userId))
      .map((u) => u.userId);

    // Users present in both -> retained unchanged
    const retainedUsers = cachedUsers.filter((u) => latestSet.has(u.userId));

    return { newUserIds, removedUserIds, retainedUsers };
  }

  /**
   * Apply incremental update to the dashboard store.
   *
   * - Removes deleted users from store (continues on failure)
   * - Merges retained users with newly fetched users
   * - Updates timestamp only when new data was fetched from API;
   *   if only removals occurred, preserves the existing timestamp
   *
   * @param store - The dashboard store instance
   * @param cachedUsers - Current cached users (used to derive old timestamp context)
   * @param newUsers - Newly fetched user details from API
   * @param removedUserIds - User IDs to remove from cache
   * @param oldTimestamp - The previous cache timestamp to preserve when no new data
   */
  async applyUpdate(
    store: DashboardStore,
    cachedUsers: FollowingDetail[],
    newUsers: FollowingDetail[],
    removedUserIds: string[],
    oldTimestamp: number
  ): Promise<void> {
    // Step 1: Remove deleted users from store (continue on failure)
    if (removedUserIds.length > 0) {
      try {
        await store.removeUsers(removedUserIds);
      } catch {
        // Cache removal failure should not block subsequent operations
        console.warn('[Dashboard] Failed to remove users from cache, continuing...');
      }
    }

    // Step 2: Compute retained users (those not in removed set)
    const removedSet = new Set(removedUserIds);
    const retainedUsers = cachedUsers.filter((u) => !removedSet.has(u.userId));

    // Step 3: Merge retained users with new users
    const mergedUsers = [...retainedUsers, ...newUsers];

    // Step 4: Save with conditional timestamp update
    if (newUsers.length > 0) {
      // New data fetched from API -> update timestamp to current time
      await store.save(mergedUsers, Date.now());
    } else {
      // Only removals happened -> preserve old timestamp
      await store.save(mergedUsers, oldTimestamp);
    }
  }
}
