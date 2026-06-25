import { UserInfo, NonFollowerResult } from '../shared/types';

/**
 * Calculate non-followers by performing a set difference operation.
 * Returns users in the following list who are NOT in the followers list.
 * Results are sorted alphabetically by username (ascending).
 */
export function calculateNonFollowers(
  following: UserInfo[],
  followers: UserInfo[]
): NonFollowerResult {
  // Build a Set of follower userIds for O(1) lookup
  const followerIdSet = new Set<string>(followers.map((user) => user.userId));

  // Set difference: users in following but not in followers
  const nonFollowers = following.filter(
    (user) => !followerIdSet.has(user.userId)
  );

  // Sort by username alphabetically (ascending, case-insensitive)
  nonFollowers.sort((a, b) =>
    a.username.toLowerCase().localeCompare(b.username.toLowerCase())
  );

  return {
    nonFollowers,
    followingCount: following.length,
    followersCount: followers.length,
    calculatedAt: Date.now(),
  };
}
