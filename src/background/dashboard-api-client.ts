// Dashboard API client for fetching detailed following information and managing follow relationships

import type { AuthCredentials } from '../shared/types';
import type { FollowingDetail } from '../shared/dashboard-types';
import { REQUEST_TIMEOUT_MS, PAGINATION_DELAY_MS, RATE_LIMIT_WAIT_MS, MAX_RETRIES } from '../shared/constants';

/**
 * GraphQL endpoint for fetching the Following list (same as existing APIClient)
 */
const FOLLOWING_ENDPOINT = 'https://x.com/i/api/graphql/0yD6Eiv23DKXRDU9VxlG2A/Following';

/**
 * GraphQL endpoint for fetching a single user's details by REST ID
 */
const USER_BY_REST_ID_ENDPOINT = 'https://x.com/i/api/graphql/xf3jd90KKBCUxdlI_tNHZw/UserByRestId';

/**
 * REST endpoint for unfollowing a user
 */
const UNFOLLOW_ENDPOINT = 'https://x.com/i/api/1.1/friendships/destroy.json';

/**
 * GraphQL endpoint for fetching a user's tweets timeline
 */
const USER_TWEETS_ENDPOINT = 'https://x.com/i/api/graphql/E3opETHurmVJflFsUBVuUQ/UserTweets';

/**
 * GraphQL features parameter for Following/UserByRestId requests
 */
const GRAPHQL_FEATURES = {
  rweb_tipjar_consumption_enabled: true,
  responsive_web_graphql_exclude_directive_enabled: true,
  verified_phone_label_enabled: false,
  creator_subscriptions_tweet_preview_api_enabled: true,
  responsive_web_graphql_timeline_navigation_enabled: true,
  responsive_web_graphql_skip_user_profile_image_extensions_enabled: false,
  communities_web_enable_tweet_community_results_fetch: true,
  c9s_tweet_anatomy_moderator_badge_enabled: true,
  articles_preview_enabled: true,
  responsive_web_edit_tweet_api_enabled: true,
  graphql_is_translatable_rweb_tweet_is_translatable_enabled: true,
  view_counts_everywhere_api_enabled: true,
  longform_notetweets_consumption_enabled: true,
  responsive_web_twitter_article_tweet_consumption_enabled: true,
  tweet_awards_web_tipping_enabled: false,
  creator_subscriptions_quote_tweet_preview_enabled: false,
  freedom_of_speech_not_reach_fetch_enabled: true,
  standardized_nudges_misinfo: true,
  tweet_with_visibility_results_prefer_gql_limited_actions_policy_enabled: true,
  rweb_video_timestamps_enabled: true,
  longform_notetweets_rich_text_read_enabled: true,
  longform_notetweets_inline_media_enabled: true,
  responsive_web_enhance_cards_enabled: false,
};

/**
 * Internal type for timeline instruction parsing
 */
interface TimelineInstruction {
  type: string;
  entries?: TimelineEntry[];
}

interface TimelineEntry {
  entryId: string;
  content: {
    entryType: string;
    itemContent?: {
      user_results: {
        result: UserResultObject;
      };
    };
    value?: string;
    cursorType?: string;
  };
}

interface UserResultObject {
  __typename?: string;
  rest_id: string;
  legacy: {
    name: string;
    screen_name: string;
    description: string;
    profile_image_url_https: string;
    friends_count: number;
    followers_count: number;
    statuses_count: number;
    status?: {
      created_at: string;
    };
  };
}

/**
 * DashboardAPIClient handles fetching detailed following information
 * and managing follow relationships via X internal APIs.
 * Reuses the same Bearer Token + ct0 cookie authentication as the existing APIClient.
 */
export class DashboardAPIClient {
  private credentials: AuthCredentials;

  constructor(credentials: AuthCredentials) {
    this.credentials = credentials;
  }

  /**
   * Update the credentials used for API requests.
   */
  setCredentials(credentials: AuthCredentials): void {
    this.credentials = credentials;
  }

  /**
   * Fetch detailed information for a single user by their REST ID.
   * Returns null on failure (does not throw).
   */
  async fetchUserDetails(userId: string): Promise<FollowingDetail | null> {
    try {
      const variables = JSON.stringify({
        userId,
        withSafetyModeUserFields: true,
      });
      const features = JSON.stringify(GRAPHQL_FEATURES);

      const params = new URLSearchParams({ variables, features });
      const url = `${USER_BY_REST_ID_ENDPOINT}?${params.toString()}`;

      const response = await this.fetchWithTimeout(url, {
        method: 'GET',
        headers: this.buildHeaders(),
        credentials: 'include',
      });

      if (!response.ok) {
        console.warn(`[X-Dashboard] UserByRestId failed for ${userId}: HTTP ${response.status}`);
        return null;
      }

      const json = await response.json();
      const userResult = json?.data?.user?.result;

      if (!userResult?.legacy) {
        console.warn(`[X-Dashboard] Invalid user response structure for ${userId}`);
        return null;
      }

      return this.mapUserResultToDetail(userResult);
    } catch (error) {
      console.warn(`[X-Dashboard] fetchUserDetails error for ${userId}:`, error);
      return null;
    }
  }

  /**
   * Fetch detailed information for all following users.
   * Extracts available fields (friends_count, followers_count) directly from
   * the Following list GraphQL response, then makes additional requests for
   * any missing data (e.g. last tweet time if not present in the legacy object).
   *
   * Reports progress via the onProgress callback.
   * Skips failed users and continues with the next.
   */
  async fetchAllFollowingDetails(
    userId: string,
    onProgress: (current: number, total: number) => void
  ): Promise<FollowingDetail[]> {
    // Fetch the complete following list with pagination
    // Last tweet times are NOT fetched here - they are handled by auto-refresh on the Dashboard side
    const allUsers = await this.fetchFollowingListWithDetails(userId);

    const total = allUsers.length;
    const results: FollowingDetail[] = [];

    for (let i = 0; i < allUsers.length; i++) {
      const user = allUsers[i];
      if (user) {
        results.push(user);
      }
      onProgress(i + 1, total);
    }

    return results;
  }

  /**
   * Unfollow a user by calling X's internal friendships/destroy REST endpoint.
   * Returns true on success, false on failure.
   */
  async unfollowUser(userId: string): Promise<boolean> {
    try {
      const response = await this.fetchWithTimeout(UNFOLLOW_ENDPOINT, {
        method: 'POST',
        headers: {
          ...this.buildHeaders(),
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        credentials: 'include',
        body: new URLSearchParams({ user_id: userId }).toString(),
      });

      if (!response.ok) {
        console.warn(`[X-Dashboard] Unfollow failed for ${userId}: HTTP ${response.status}`);
        return false;
      }

      return true;
    } catch (error) {
      console.warn(`[X-Dashboard] Unfollow error for ${userId}:`, error);
      return false;
    }
  }

  /**
   * Fetch the most recent tweet time for a user via UserTweets GraphQL endpoint.
   * Returns ISO 8601 timestamp string or null if unavailable.
   */
  async fetchLastTweetTime(userId: string): Promise<string | null> {
    try {
      const variables = JSON.stringify({
        userId,
        count: 1,
        includePromotedContent: false,
        withQuickPromoteEligibilityTweetFields: false,
        withVoice: false,
        withV2Timeline: true,
      });
      const features = JSON.stringify(GRAPHQL_FEATURES);

      const params = new URLSearchParams({ variables, features });
      const url = `${USER_TWEETS_ENDPOINT}?${params.toString()}`;

      const response = await this.fetchWithTimeout(url, {
        method: 'GET',
        headers: this.buildHeaders(),
        credentials: 'include',
      });

      if (!response.ok) {
        // Don't log 429 as error - it's expected with many users
        if (response.status !== 429) {
          console.warn(`[X-Dashboard] UserTweets failed for ${userId}: HTTP ${response.status}`);
        }
        return null;
      }

      const json = await response.json();

      // Navigate the timeline response to find the first tweet's created_at
      const instructions = json?.data?.user?.result?.timeline_v2?.timeline?.instructions
        || json?.data?.user?.result?.timeline?.timeline?.instructions;

      if (!instructions || !Array.isArray(instructions)) {
        return null;
      }

      for (const instruction of instructions) {
        const entries = instruction.entries || instruction.moduleItems;
        if (!entries || !Array.isArray(entries)) continue;

        for (const entry of entries) {
          // Look for tweet entries (not cursors or promotions)
          const tweetResult = entry?.content?.itemContent?.tweet_results?.result
            || entry?.item?.itemContent?.tweet_results?.result;

          if (!tweetResult) continue;

          // Get created_at from the tweet's legacy object
          const createdAt = tweetResult?.legacy?.created_at
            || tweetResult?.tweet?.legacy?.created_at;

          if (createdAt) {
            try {
              const date = new Date(createdAt);
              if (!isNaN(date.getTime())) {
                return date.toISOString();
              }
            } catch { /* ignore invalid date */ }
          }
        }
      }

      return null;
    } catch (error) {
      console.warn(`[X-Dashboard] fetchLastTweetTime error for ${userId}:`, error);
      return null;
    }
  }

  /**
   * Fetch the complete following list using GraphQL pagination.
   * The Following endpoint returns user objects with legacy fields including
   * friends_count, followers_count, and status (last tweet).
   */
  private async fetchFollowingListWithDetails(userId: string): Promise<FollowingDetail[]> {
    const allUsers: FollowingDetail[] = [];
    let cursor: string | undefined;
    let retryCount = 0;
    let pageIndex = 0;

    while (true) {
      // Add delay between pagination requests (skip first)
      if (pageIndex > 0) {
        await this.delay(PAGINATION_DELAY_MS);
      }

      try {
        const url = this.buildFollowingUrl(userId, 100, cursor);
        const response = await this.fetchWithTimeout(url, {
          method: 'GET',
          headers: this.buildHeaders(),
          credentials: 'include',
        });

        if (!response.ok) {
          if (response.status === 429 && retryCount < MAX_RETRIES) {
            // Rate limited: wait and retry
            const waitMs = this.getRateLimitWait(response.headers);
            console.log(`[X-Dashboard] Rate limited, waiting ${waitMs}ms...`);
            await this.delay(waitMs);
            retryCount++;
            continue;
          }
          console.error(`[X-Dashboard] Following list fetch failed: HTTP ${response.status}`);
          break;
        }

        retryCount = 0;
        const json = await response.json();
        const instructions = this.extractInstructions(json);

        if (!instructions) {
          console.error('[X-Dashboard] Invalid following list response structure');
          break;
        }

        const { users, nextCursor } = this.parseFollowingEntries(instructions);
        allUsers.push(...users);

        pageIndex++;
        console.log(`[X-Dashboard] Following list page ${pageIndex}: ${users.length} users`);

        if (!nextCursor || users.length === 0 || users.length < 50) {
          break;
        }

        cursor = nextCursor;
      } catch (error) {
        if (pageIndex === 0) {
          console.error('[X-Dashboard] Failed to fetch first page of following list:', error);
          throw error;
        }
        // Return partial results for subsequent page failures
        console.warn(`[X-Dashboard] Error on page ${pageIndex + 1}, returning partial results`);
        break;
      }
    }

    return allUsers;
  }

  /**
   * Parse following list entries, extracting detailed user info from legacy objects.
   */
  private parseFollowingEntries(instructions: TimelineInstruction[]): {
    users: FollowingDetail[];
    nextCursor: string | null;
  } {
    const users: FollowingDetail[] = [];
    let nextCursor: string | null = null;

    for (const instruction of instructions) {
      if (instruction.type !== 'TimelineAddEntries' || !instruction.entries) {
        continue;
      }

      for (const entry of instruction.entries) {
        const { content } = entry;

        // Check for cursor entries
        if (content.cursorType === 'Bottom' && content.value) {
          nextCursor = content.value;
          continue;
        }

        // Check for user entries
        if (!content.itemContent?.user_results?.result) {
          continue;
        }

        const userResult = content.itemContent.user_results.result;
        const detail = this.mapUserResultToDetail(userResult);

        if (detail) {
          users.push(detail);
        }
      }
    }

    return { users, nextCursor };
  }

  /**
   * Map a GraphQL user result object to a FollowingDetail.
   * Returns null if essential fields are missing.
   */
  private mapUserResultToDetail(userResult: UserResultObject): FollowingDetail | null {
    const restId = userResult.rest_id;
    const legacy = userResult.legacy;

    if (!restId || !legacy?.screen_name) {
      return null;
    }

    // Extract last tweet time from the status object in legacy
    let lastTweetTime: string | null = null;
    if (legacy.status?.created_at) {
      try {
        const date = new Date(legacy.status.created_at);
        if (!isNaN(date.getTime())) {
          lastTweetTime = date.toISOString();
        }
      } catch {
        // Ignore invalid date
      }
    }

    return {
      userId: restId,
      username: legacy.screen_name,
      displayName: legacy.name || '',
      avatarUrl: (legacy.profile_image_url_https || '').replace('_normal', '_400x400'),
      bio: legacy.description || null,
      friendsCount: legacy.friends_count ?? 0,
      followersCount: legacy.followers_count ?? 0,
      lastTweetTime,
      accountAnalysis: null,
      analysisStatus: 'pending',
      fetchedAt: Date.now(),
    };
  }

  /**
   * Extract timeline instructions from GraphQL response JSON.
   */
  private extractInstructions(json: any): TimelineInstruction[] | null {
    // Primary path
    let instructions = json?.data?.user?.result?.timeline?.timeline?.instructions;

    // Fallback path
    if (!instructions || !Array.isArray(instructions)) {
      instructions = json?.data?.user?.result?.timeline_v2?.timeline?.instructions;
    }

    if (!instructions || !Array.isArray(instructions)) {
      return null;
    }

    return instructions;
  }

  /**
   * Build GraphQL Following URL with query parameters.
   */
  private buildFollowingUrl(userId: string, count: number, cursor?: string): string {
    const variables: Record<string, unknown> = {
      userId,
      count,
      includePromotedContent: false,
    };

    if (cursor) {
      variables.cursor = cursor;
    }

    const params = new URLSearchParams({
      variables: JSON.stringify(variables),
      features: JSON.stringify(GRAPHQL_FEATURES),
    });

    return `${FOLLOWING_ENDPOINT}?${params.toString()}`;
  }

  /**
   * Build standard auth headers for X API requests.
   */
  private buildHeaders(): Record<string, string> {
    return {
      Authorization: `Bearer ${this.credentials.bearerToken}`,
      'x-csrf-token': this.credentials.csrfToken,
      'x-twitter-auth-type': 'OAuth2Session',
      'Content-Type': 'application/json',
    };
  }

  /**
   * Fetch with timeout control using AbortController.
   */
  private async fetchWithTimeout(
    url: string,
    options: RequestInit
  ): Promise<Response> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    try {
      return await fetch(url, {
        ...options,
        signal: controller.signal,
      });
    } catch (error: unknown) {
      if (error instanceof DOMException && error.name === 'AbortError') {
        throw new Error(`Request timed out: ${url.substring(0, 80)}`);
      }
      throw error;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  /**
   * Calculate wait time from rate-limit-reset header or use default.
   */
  private getRateLimitWait(headers: Headers): number {
    const resetHeader = headers.get('x-rate-limit-reset');
    if (!resetHeader) {
      return RATE_LIMIT_WAIT_MS;
    }

    const resetTimestamp = parseInt(resetHeader, 10);
    if (isNaN(resetTimestamp)) {
      return RATE_LIMIT_WAIT_MS;
    }

    // x-rate-limit-reset is a Unix timestamp in seconds
    const waitMs = resetTimestamp * 1000 - Date.now();
    return waitMs > 0 ? waitMs : RATE_LIMIT_WAIT_MS;
  }

  /**
   * Async delay utility.
   */
  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
