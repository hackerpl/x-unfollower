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

  // Background -> Dashboard
  DASHBOARD_PROGRESS = 'DASHBOARD_PROGRESS',
  DASHBOARD_COMPLETE = 'DASHBOARD_COMPLETE',
  DASHBOARD_ERROR = 'DASHBOARD_ERROR',
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
 * Payload for UNFOLLOW_RESULT messages
 */
export interface UnfollowResultPayload {
  userId: string;
  success: boolean;
  error?: string;
}
