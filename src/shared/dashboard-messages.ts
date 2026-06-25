// Dashboard message types and payload interfaces for Chrome extension messaging

import type { FollowingDetail } from './dashboard-types';

/**
 * All supported message types between Dashboard page and Background service worker
 */
export enum DashboardMessageType {
  // Dashboard -> Background
  DASHBOARD_FETCH_ALL = 'DASHBOARD_FETCH_ALL',
  DASHBOARD_INCREMENTAL_UPDATE = 'DASHBOARD_INCREMENTAL_UPDATE',
  DASHBOARD_UNFOLLOW = 'DASHBOARD_UNFOLLOW',
  DASHBOARD_FETCH_LAST_TWEET = 'DASHBOARD_FETCH_LAST_TWEET',
  GROK_ANALYZE_START = 'GROK_ANALYZE_START',
  GROK_ANALYZE_STOP = 'GROK_ANALYZE_STOP',

  // Background -> Dashboard
  DASHBOARD_PROGRESS = 'DASHBOARD_PROGRESS',
  DASHBOARD_COMPLETE = 'DASHBOARD_COMPLETE',
  DASHBOARD_ERROR = 'DASHBOARD_ERROR',
  DASHBOARD_USER_DETAIL = 'DASHBOARD_USER_DETAIL',
  GROK_ANALYZE_RESULT = 'GROK_ANALYZE_RESULT',
  UNFOLLOW_RESULT = 'UNFOLLOW_RESULT',

  // Content Script -> Background
  OPEN_DASHBOARD = 'OPEN_DASHBOARD',
}

/**
 * Payload for DASHBOARD_FETCH_ALL and DASHBOARD_INCREMENTAL_UPDATE messages
 */
export interface DashboardFetchPayload {
  userId: string;
}

/**
 * Payload for DASHBOARD_PROGRESS messages
 */
export interface DashboardProgressPayload {
  current: number;
  total: number;
  phase: 'fetching_list' | 'fetching_details';
}

/**
 * Payload for DASHBOARD_COMPLETE messages
 */
export interface DashboardCompletePayload {
  users: FollowingDetail[];
  timestamp: number;
}

/**
 * Payload for DASHBOARD_ERROR messages
 */
export interface DashboardErrorPayload {
  errorType: 'rate_limit' | 'network' | 'auth_expired' | 'unknown';
  message: string;
  partialData?: FollowingDetail[];
}

/**
 * Payload for GROK_ANALYZE_RESULT messages
 */
export interface GrokAnalyzeResultPayload {
  userId: string;
  analysis: string | null;
  status: 'done' | 'failed';
}

/**
 * Payload for UNFOLLOW_RESULT messages
 */
export interface UnfollowResultPayload {
  userId: string;
  success: boolean;
  error?: string;
}
