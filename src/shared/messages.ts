// Message types and interfaces for Chrome extension messaging

import type { UserInfo } from './types';

/**
 * All supported message types between Background Script and Content Script
 */
export enum MessageType {
  START_FETCH = 'START_FETCH',
  FETCH_PROGRESS = 'FETCH_PROGRESS',
  FETCH_COMPLETE = 'FETCH_COMPLETE',
  FETCH_ERROR = 'FETCH_ERROR',
  AUTH_REQUIRED = 'AUTH_REQUIRED',
  AUTH_EXPIRED = 'AUTH_EXPIRED',
}

/**
 * Base message interface for Chrome messaging
 */
export interface Message {
  type: MessageType;
  payload: ProgressPayload | CompletePayload | ErrorPayload | null;
}

/**
 * Payload for FETCH_PROGRESS messages
 */
export interface ProgressPayload {
  type: 'following' | 'followers';
  currentPage: number;
  totalUsers: number;
}

/**
 * Payload for FETCH_COMPLETE messages
 */
export interface CompletePayload {
  nonFollowers: UserInfo[];
  followingCount: number;
  followersCount: number;
}

/**
 * Payload for FETCH_ERROR messages
 */
export interface ErrorPayload {
  errorType: 'rate_limit' | 'network' | 'parse_error' | 'auth_expired' | 'unknown';
  message: string;
  failedList?: 'following' | 'followers';
  retryCount: number;
  maxRetries: number;
}
