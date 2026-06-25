// Background script entry point (Service Worker)
// Orchestrates the full data fetching flow: get credentials → fetch following → fetch followers → compute diff → send results

import { APIClient, APIError } from './api-client';
import { calculateNonFollowers } from './data-processor';
import { MessageHub } from './message-hub';
import { DashboardMessageHandler } from './dashboard-message-handler';
import type { FetchProgress, UserInfo, AuthCredentials } from '../shared/types';
import { MessageType } from '../shared/messages';
import type { ErrorPayload } from '../shared/messages';
import { DashboardMessageType } from '../shared/dashboard-messages';
import { MAX_RETRIES } from '../shared/constants';

/**
 * X public App Bearer Token (same for all users, hardcoded in X's web client).
 * This is NOT a user-specific token - it identifies the X web application itself.
 */
const X_BEARER_TOKEN = 'AAAAAAAAAAAAAAAAAAAAANRILgAAAAAAnNwIzUejRCOuH5E6I8xnZz4puTs%3D1Zv7ttfk8LF81IUq16cHjhLTvJu4FA33AGWWjCpTnA';

/**
 * Cached userId of the currently logged-in user.
 */
let cachedUserId: string | null = null;

/**
 * Get CSRF token (ct0) from X cookies.
 */
async function getCsrfToken(): Promise<string | null> {
  try {
    const cookie = await chrome.cookies.get({ url: 'https://x.com', name: 'ct0' });
    if (cookie && cookie.value) {
      return cookie.value;
    }
  } catch (err) {
    console.error('[X-NF] Failed to read ct0 cookie:', err);
  }
  return null;
}

/**
 * Get current credentials: hardcoded Bearer Token + ct0 cookie for CSRF.
 */
async function getCredentials(): Promise<AuthCredentials | null> {
  const csrfToken = await getCsrfToken();
  if (!csrfToken) {
    console.warn('[X-NF] ct0 cookie not found - user may not be logged in');
    return null;
  }
  return {
    bearerToken: X_BEARER_TOKEN,
    csrfToken,
    extractedAt: Date.now(),
  };
}

/**
 * Get the current logged-in user's ID from the twid cookie.
 */
async function fetchCurrentUserId(): Promise<string | null> {
  try {
    console.log('[X-NF] Getting userId from twid cookie...');
    const cookie = await chrome.cookies.get({ url: 'https://x.com', name: 'twid' });
    if (cookie && cookie.value) {
      const decoded = decodeURIComponent(cookie.value);
      const match = decoded.match(/u=(\d+)/);
      if (match) {
        console.log('[X-NF] Got userId from twid cookie:', match[1]);
        return match[1];
      }
    }
    console.warn('[X-NF] twid cookie not found or invalid');
    return null;
  } catch (err) {
    console.error('[X-NF] Failed to read twid cookie:', err);
    return null;
  }
}

/**
 * Handle the START_FETCH message: orchestrate the complete data fetching pipeline.
 */
async function handleStartFetch(tabId: number): Promise<void> {
  console.log('[X-NF] START_FETCH received from tab', tabId);

  // Step 1: Get credentials (Bearer Token + CSRF from cookie)
  const credentials = await getCredentials();
  if (!credentials) {
    console.warn('[X-NF] No credentials available. User may not be logged in.');
    await messageHub.sendAuthRequired(tabId);
    return;
  }

  console.log('[X-NF] Credentials available. CSRF token length:', credentials.csrfToken.length);

  // Step 2: Ensure we have a userId - try to fetch it if not cached
  if (!cachedUserId) {
    console.log('[X-NF] No cached userId, reading twid cookie...');
    cachedUserId = await fetchCurrentUserId();
  }

  if (!cachedUserId) {
    console.error('[X-NF] Failed to get userId. twid cookie may not exist.');
    const errorPayload: ErrorPayload = {
      errorType: 'unknown',
      message: '无法获取当前用户 ID，请刷新 X 页面后重试',
      retryCount: 0,
      maxRetries: MAX_RETRIES,
    };
    await messageHub.sendError(tabId, errorPayload);
    return;
  }

  console.log('[X-NF] userId:', cachedUserId);

  const userId = cachedUserId;
  const apiClient = new APIClient(credentials);

  let following: UserInfo[];
  let followers: UserInfo[];

  // Step 3: Fetch following list
  console.log('[X-NF] Fetching following list...');
  try {
    following = await apiClient.fetchAllFollowing(
      userId,
      (progress: FetchProgress) => {
        console.log(`[X-NF] Following: page ${progress.currentPage}, ${progress.totalUsers} users so far`);
        messageHub.sendProgress(tabId, {
          type: progress.type,
          currentPage: progress.currentPage,
          totalUsers: progress.totalUsers,
        });
      }
    );
    console.log(`[X-NF] Following list complete: ${following.length} users`);
  } catch (error: unknown) {
    console.error('[X-NF] Error fetching following list:', error);
    if (error instanceof APIError && error.statusCode === 401) {
      authInterceptor.clearCredentials();
      await messageHub.sendAuthExpired(tabId);
      return;
    }

    const errorPayload: ErrorPayload = {
      errorType: classifyError(error),
      message: getErrorMessage(error),
      failedList: 'following',
      retryCount: MAX_RETRIES,
      maxRetries: MAX_RETRIES,
    };
    await messageHub.sendError(tabId, errorPayload);
    return;
  }

  // Step 4: Fetch followers list
  console.log('[X-NF] Fetching followers list...');
  try {
    followers = await apiClient.fetchAllFollowers(
      userId,
      (progress: FetchProgress) => {
        console.log(`[X-NF] Followers: page ${progress.currentPage}, ${progress.totalUsers} users so far`);
        messageHub.sendProgress(tabId, {
          type: progress.type,
          currentPage: progress.currentPage,
          totalUsers: progress.totalUsers,
        });
      }
    );
    console.log(`[X-NF] Followers list complete: ${followers.length} users`);
  } catch (error: unknown) {
    console.error('[X-NF] Error fetching followers list:', error);
    if (error instanceof APIError && error.statusCode === 401) {
      authInterceptor.clearCredentials();
      await messageHub.sendAuthExpired(tabId);
      return;
    }

    const errorPayload: ErrorPayload = {
      errorType: classifyError(error),
      message: getErrorMessage(error),
      failedList: 'followers',
      retryCount: MAX_RETRIES,
      maxRetries: MAX_RETRIES,
    };
    await messageHub.sendError(tabId, errorPayload);
    return;
  }

  // Step 5: Calculate non-followers (set difference)
  const result = calculateNonFollowers(following, followers);
  console.log(`[X-NF] Calculation complete: ${result.nonFollowers.length} non-followers (following: ${result.followingCount}, followers: ${result.followersCount})`);

  // Step 6: Send complete result to content script
  await messageHub.sendComplete(tabId, {
    nonFollowers: result.nonFollowers,
    followingCount: result.followingCount,
    followersCount: result.followersCount,
  });
  console.log('[X-NF] Results sent to content script.');
}

/**
 * Classify an error into the appropriate ErrorPayload errorType.
 */
function classifyError(error: unknown): ErrorPayload['errorType'] {
  if (error instanceof APIError) {
    if (error.statusCode === 401) {
      return 'auth_expired';
    }
    if (error.statusCode === 429) {
      return 'rate_limit';
    }
    if (error.statusCode === 0 && error.message.includes('timed out')) {
      return 'network';
    }
    if (error.message.includes('Invalid GraphQL response')) {
      return 'parse_error';
    }
    if (error.statusCode === 0) {
      return 'network';
    }
  }
  if (error instanceof TypeError) {
    // TypeError typically indicates network issues (fetch failure)
    return 'network';
  }
  return 'unknown';
}

/**
 * Extract a human-readable error message from an error.
 */
function getErrorMessage(error: unknown): string {
  if (error instanceof APIError) {
    switch (error.statusCode) {
      case 429:
        return '请求频率超过限制，请稍后再试';
      case 401:
        return '认证已过期，请刷新页面重新登录';
      case 0:
        if (error.message.includes('timed out')) {
          return '请求超时，请检查网络连接后重试';
        }
        return '网络连接失败，请检查网络后重试';
      default:
        return `API 请求失败 (${error.statusCode})`;
    }
  }
  if (error instanceof TypeError) {
    return '网络连接失败，请检查网络后重试';
  }
  if (error instanceof Error) {
    return error.message;
  }
  return '发生未知错误';
}

// --- Initialize MessageHub with START_FETCH handler ---

const messageHub = new MessageHub(handleStartFetch);

// Also listen for START_FETCH messages that include a userId payload
chrome.runtime.onMessage.addListener(
  (message, _sender, _sendResponse) => {
    // If the content script passes a userId with the START_FETCH message, use it
    if (
      message.type === MessageType.START_FETCH &&
      message.payload?.userId &&
      typeof message.payload.userId === 'string'
    ) {
      cachedUserId = message.payload.userId;
    }
  }
);

// --- Initialize DashboardMessageHandler ---

// Create handler with dummy credentials; will be refreshed before each message
const dashboardMessageHandler = new DashboardMessageHandler({
  bearerToken: X_BEARER_TOKEN,
  csrfToken: '',
  extractedAt: 0,
});

// Listen for Dashboard-related messages and route them to DashboardMessageHandler
chrome.runtime.onMessage.addListener(
  (message, sender, sendResponse) => {
    // Only handle messages with Dashboard-related types
    const dashboardTypes = Object.values(DashboardMessageType) as string[];
    if (!message.type || !dashboardTypes.includes(message.type)) {
      return false;
    }

    console.log(`[X-Dashboard] Routing message: ${message.type}, sender.tab.id=${sender.tab?.id}`);

    // Refresh credentials and delegate to the handler
    getCredentials().then((credentials) => {
      if (credentials) {
        dashboardMessageHandler.setCredentials(credentials);
      }
      dashboardMessageHandler.handleMessage(message, sender, sendResponse);
    });

    // Return true to keep the sendResponse channel open for async handling
    return true;
  }
);
