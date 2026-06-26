// X API client for fetching following and followers data via GraphQL endpoints

import type { AuthCredentials, UserInfo, FetchResult, FetchProgress } from '../shared/types';
import { REQUEST_TIMEOUT_MS, PAGINATION_DELAY_MS, RATE_LIMIT_WAIT_MS, MAX_RETRIES } from '../shared/constants';

/**
 * X GraphQL API endpoint IDs.
 * These are internal endpoint identifiers used by the X web client.
 * Updated based on working reference extension.
 */
const FOLLOWING_ENDPOINT = 'https://x.com/i/api/graphql/0yD6Eiv23DKXRDU9VxlG2A/Following';
const FOLLOWERS_REST_ENDPOINT = 'https://x.com/i/api/1.1/followers/list.json';

/**
 * Default features parameter for GraphQL requests.
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
 * GraphQL response type definitions (internal)
 */
interface GraphQLTimelineResponse {
  data: {
    user: {
      result: {
        timeline: {
          timeline: {
            instructions: TimelineInstruction[];
          };
        };
      };
    };
  };
}

interface TimelineInstruction {
  type: string;
  entries?: TimelineEntry[];
}

interface TimelineEntry {
  entryId: string;
  sortIndex: string;
  content: {
    entryType: string;
    itemContent?: {
      user_results: {
        result: {
          rest_id: string;
          legacy: {
            name: string;
            screen_name: string;
            profile_image_url_https: string;
            description?: string;
            friends_count?: number;
            followers_count?: number;
            status?: {
              created_at?: string;
            };
          };
        };
      };
    };
    value?: string;
    cursorType?: string;
  };
}

/**
 * Parse user entries from X GraphQL timeline response instructions.
 * Skips entries that are missing userId (rest_id) or username (screen_name).
 * Exported separately for testability.
 */
export function parseUserEntries(instructions: TimelineInstruction[]): {
  users: UserInfo[];
  nextCursor: string | null;
} {
  const users: UserInfo[] = [];
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
      const restId = userResult.rest_id;
      const legacy = userResult.legacy;

      // Skip entries missing userId or username
      if (!restId || !legacy?.screen_name) {
        continue;
      }

      users.push({
        userId: restId,
        username: legacy.screen_name,
        displayName: legacy.name || '',
        avatarUrl: legacy.profile_image_url_https || '',
      });
    }
  }

  return { users, nextCursor };
}

/**
 * Parse user entries with full detail (for dashboard cache).
 * Extracts friends_count, followers_count, bio, last tweet time from the same GraphQL response.
 */
export function parseUserEntriesDetailed(instructions: TimelineInstruction[]): {
  users: import('../shared/dashboard-types').FollowingDetail[];
  nextCursor: string | null;
} {
  const users: import('../shared/dashboard-types').FollowingDetail[] = [];
  let nextCursor: string | null = null;

  for (const instruction of instructions) {
    if (instruction.type !== 'TimelineAddEntries' || !instruction.entries) {
      continue;
    }

    for (const entry of instruction.entries) {
      const { content } = entry;

      if (content.cursorType === 'Bottom' && content.value) {
        nextCursor = content.value;
        continue;
      }

      if (!content.itemContent?.user_results?.result) {
        continue;
      }

      const userResult = content.itemContent.user_results.result;
      const restId = userResult.rest_id;
      const legacy = userResult.legacy;

      if (!restId || !legacy?.screen_name) {
        continue;
      }

      // Extract last tweet time from status
      let lastTweetTime: string | null = null;
      if (legacy.status?.created_at) {
        try {
          const date = new Date(legacy.status.created_at);
          if (!isNaN(date.getTime())) {
            lastTweetTime = date.toISOString();
          }
        } catch { /* ignore */ }
      }

      users.push({
        userId: restId,
        username: legacy.screen_name,
        displayName: legacy.name || '',
        avatarUrl: (legacy.profile_image_url_https || '').replace('_normal', '_400x400'),
        bio: legacy.description || null,
        friendsCount: legacy.friends_count ?? 0,
        followersCount: legacy.followers_count ?? 0,
        lastTweetTime,
        fetchedAt: Date.now(),
      });
    }
  }

  return { users, nextCursor };
}

/**
 * Build the GraphQL request URL with query parameters.
 */
function buildGraphQLUrl(
  endpoint: string,
  userId: string,
  count: number,
  cursor?: string
): string {
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

  return `${endpoint}?${params.toString()}`;
}

/**
 * APIClient handles communication with X's internal GraphQL API
 * to fetch following and followers lists.
 */
export class APIClient {
  private credentials: AuthCredentials;
  private pageSize: number;

  /** Detailed following users collected during fetchAllFollowing (for dashboard cache) */
  public detailedFollowing: import('../shared/dashboard-types').FollowingDetail[] = [];

  constructor(credentials: AuthCredentials, pageSize = 100) {
    this.credentials = credentials;
    this.pageSize = pageSize;
  }

  /**
   * Update the credentials used for API requests.
   */
  setCredentials(credentials: AuthCredentials): void {
    this.credentials = credentials;
  }

  /**
   * Fetch a single page of the following list for a given user.
   */
  async fetchFollowingPage(
    userId: string,
    cursor?: string
  ): Promise<FetchResult> {
    const url = buildGraphQLUrl(
      FOLLOWING_ENDPOINT,
      userId,
      this.pageSize,
      cursor
    );
    return this.fetchPage(url);
  }

  /**
   * Fetch a single page of the followers list using REST API (more stable than GraphQL).
   */
  async fetchFollowersPage(
    userId: string,
    cursor?: string
  ): Promise<FetchResult> {
    const url = new URL(FOLLOWERS_REST_ENDPOINT);
    url.searchParams.append('include_followed_by', '1');
    url.searchParams.append('user_id', userId);
    url.searchParams.append('count', '100');
    if (cursor) {
      url.searchParams.append('cursor', cursor);
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    try {
      console.log('[X-NF] Fetching followers (REST):', url.toString().substring(0, 120) + '...');
      const response = await fetch(url.toString(), {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${this.credentials.bearerToken}`,
          'x-csrf-token': this.credentials.csrfToken,
          'x-twitter-auth-type': 'OAuth2Session',
          'Content-Type': 'application/json; charset=UTF-8',
        },
        credentials: 'include',
        signal: controller.signal,
      });

      if (!response.ok) {
        console.error(`[X-NF] Followers REST API returned ${response.status}`);
        throw new APIError(
          `API request failed with status ${response.status}`,
          response.status,
          response.headers
        );
      }

      const json = await response.json();
      const users: UserInfo[] = [];

      if (json.users && Array.isArray(json.users)) {
        for (const user of json.users) {
          if (!user.id_str || !user.screen_name) continue;
          users.push({
            userId: user.id_str,
            username: user.screen_name,
            displayName: user.name || '',
            avatarUrl: (user.profile_image_url_https || '').replace('_normal', '_400x400'),
          });
        }
      }

      const nextCursor = json.next_cursor_str || null;
      const hasMore = nextCursor !== null && nextCursor !== '0' && nextCursor !== '';

      console.log(`[X-NF] Followers REST page: ${users.length} users, nextCursor: ${hasMore ? 'yes' : 'no'}`);

      return { users, nextCursor, hasMore };
    } catch (error: unknown) {
      if (error instanceof APIError) throw error;
      if (error instanceof DOMException && error.name === 'AbortError') {
        throw new APIError('Request timed out', 0, null);
      }
      throw new APIError(
        error instanceof Error ? error.message : 'Unknown network error',
        0,
        null
      );
    } finally {
      clearTimeout(timeoutId);
    }
  }

  /**
   * Fetch the complete following list with pagination, retry, and progress reporting.
   * Returns partial results if max retries exceeded (does not throw).
   */
  async fetchAllFollowing(
    userId: string,
    onProgress: (progress: FetchProgress) => void
  ): Promise<UserInfo[]> {
    return this.fetchAllPages(userId, 'following', onProgress);
  }

  /**
   * Fetch the complete followers list with pagination, retry, and progress reporting.
   * Returns partial results if max retries exceeded (does not throw).
   */
  async fetchAllFollowers(
    userId: string,
    onProgress: (progress: FetchProgress) => void
  ): Promise<UserInfo[]> {
    return this.fetchAllPages(userId, 'followers', onProgress);
  }

  /**
   * Generic paginated fetch loop with rate-limit retry and progress callback.
   * Stops and returns partial results on max retries exceeded.
   */
  private async fetchAllPages(
    userId: string,
    type: 'following' | 'followers',
    onProgress: (progress: FetchProgress) => void
  ): Promise<UserInfo[]> {
    const allUsers: UserInfo[] = [];
    let cursor: string | undefined;
    let currentPage = 0;
    let retryCount = 0;

    while (true) {
      // Add pagination delay between requests (skip for the first request)
      if (currentPage > 0) {
        await this.delay(PAGINATION_DELAY_MS);
      }

      let result: FetchResult;
      try {
        result =
          type === 'following'
            ? await this.fetchFollowingPage(userId, cursor)
            : await this.fetchFollowersPage(userId, cursor);
      } catch (error: unknown) {
        if (
          error instanceof APIError &&
          error.statusCode === 429 &&
          retryCount < MAX_RETRIES
        ) {
          // Rate limited: wait using x-rate-limit-reset header or default
          const waitMs = this.getRateLimitWait(error.responseHeaders);
          await this.delay(waitMs);
          retryCount++;
          continue;
        }

        // If first page fails with a non-rate-limit error, throw it
        // (don't silently return empty results)
        if (currentPage === 0) {
          throw error;
        }

        // For subsequent pages, return partial results
        console.warn(`[X-NF] Error on page ${currentPage + 1}, returning ${allUsers.length} partial results`);
        return allUsers;
      }

      currentPage++;
      allUsers.push(...result.users);

      // Notify progress after each successful page
      onProgress({
        type,
        currentPage,
        totalUsers: allUsers.length,
      });

      // Terminate when no more pages OR when a page returns 0 users (even if cursor exists)
      if (!result.hasMore || !result.nextCursor || result.users.length === 0) {
        break;
      }

      cursor = result.nextCursor;
    }

    return allUsers;
  }

  /**
   * Calculate wait time from rate-limit-reset header or use default.
   */
  private getRateLimitWait(headers: Headers | null): number {
    if (!headers) {
      return RATE_LIMIT_WAIT_MS;
    }

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

  /**
   * Execute a GraphQL page request with timeout control.
   */
  private async fetchPage(url: string): Promise<FetchResult> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    try {
      console.log('[X-NF] Fetching:', url.substring(0, 120) + '...');
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${this.credentials.bearerToken}`,
          'x-csrf-token': this.credentials.csrfToken,
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        signal: controller.signal,
      });

      if (!response.ok) {
        console.error(`[X-NF] API returned ${response.status}`);
        throw new APIError(
          `API request failed with status ${response.status}`,
          response.status,
          response.headers
        );
      }

      const json = (await response.json()) as GraphQLTimelineResponse;

      // Try multiple possible response structures
      let instructions = json?.data?.user?.result?.timeline?.timeline?.instructions;

      // Fallback: some endpoints use a slightly different path
      if (!instructions || !Array.isArray(instructions)) {
        instructions = (json?.data as any)?.user?.result?.timeline_v2?.timeline?.instructions;
      }

      if (!instructions || !Array.isArray(instructions)) {
        console.error('[X-NF] Invalid response structure. Top-level keys:', Object.keys(json || {}));
        console.error('[X-NF] data keys:', Object.keys(json?.data || {}));
        console.error('[X-NF] Full response (first 500 chars):', JSON.stringify(json).substring(0, 500));
        throw new APIError('Invalid GraphQL response structure', 0, null);
      }

      const { users, nextCursor } = parseUserEntries(instructions);

      // Also collect detailed user info for dashboard cache
      const { users: detailed } = parseUserEntriesDetailed(instructions);
      this.detailedFollowing.push(...detailed);

      console.log(`[X-NF] Page result: ${users.length} users, nextCursor: ${nextCursor ? 'yes' : 'no'}`);

      return {
        users,
        nextCursor,
        hasMore: nextCursor !== null && nextCursor.length > 0,
      };
    } catch (error: unknown) {
      if (error instanceof APIError) {
        throw error;
      }
      if (error instanceof DOMException && error.name === 'AbortError') {
        throw new APIError('Request timed out', 0, null);
      }
      console.error('[X-NF] fetchPage unexpected error:', error);
      throw new APIError(
        error instanceof Error ? error.message : 'Unknown network error',
        0,
        null
      );
    } finally {
      clearTimeout(timeoutId);
    }
  }
}

/**
 * Custom error class for API-related errors.
 * Exposes status code and response headers for retry logic.
 */
export class APIError extends Error {
  public statusCode: number;
  public responseHeaders: Headers | null;

  constructor(
    message: string,
    statusCode: number,
    responseHeaders: Headers | null
  ) {
    super(message);
    this.name = 'APIError';
    this.statusCode = statusCode;
    this.responseHeaders = responseHeaders;
  }
}
