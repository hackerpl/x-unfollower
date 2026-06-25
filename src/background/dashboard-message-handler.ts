// Dashboard message handler for routing messages between Dashboard page and background services

import type { AuthCredentials } from '../shared/types';
import type { FollowingDetail } from '../shared/dashboard-types';
import {
  DashboardMessageType,
  type DashboardFetchPayload,
  type DashboardProgressPayload,
  type DashboardCompletePayload,
  type DashboardErrorPayload,
  type GrokAnalyzeResultPayload,
  type UnfollowResultPayload,
} from '../shared/dashboard-messages';
import { DashboardAPIClient } from './dashboard-api-client';
import { GrokClient } from './grok-client';

/**
 * Incoming message structure from Dashboard page or content scripts
 */
interface DashboardMessage {
  type: string;
  payload?: any;
}

/**
 * DashboardMessageHandler routes messages from the Dashboard page
 * to the appropriate API clients (DashboardAPIClient, GrokClient)
 * and sends progress/completion/error responses back to the sender tab.
 */
export class DashboardMessageHandler {
  private dashboardApiClient: DashboardAPIClient;
  private grokClient: GrokClient;
  private credentials: AuthCredentials;

  // Track Grok analysis state
  private grokRunning: boolean = false;
  private grokAborted: boolean = false;

  constructor(credentials: AuthCredentials) {
    this.credentials = credentials;
    this.dashboardApiClient = new DashboardAPIClient(credentials);
    this.grokClient = new GrokClient();
  }

  /**
   * Update credentials when re-authenticated.
   */
  setCredentials(credentials: AuthCredentials): void {
    this.credentials = credentials;
    this.dashboardApiClient.setCredentials(credentials);
  }

  /**
   * Handle incoming messages from Dashboard page or content scripts.
   * Routes based on message.type to the appropriate handler.
   * Returns true to indicate async response (keeps sendResponse channel open).
   */
  handleMessage(
    message: DashboardMessage,
    sender: chrome.runtime.MessageSender,
    _sendResponse: (response?: any) => void
  ): boolean {
    const tabId = sender.tab?.id;

    switch (message.type) {
      case DashboardMessageType.DASHBOARD_FETCH_ALL:
        if (tabId != null) {
          this.handleFetchAll(message.payload as DashboardFetchPayload, tabId);
        }
        return true;

      case DashboardMessageType.DASHBOARD_INCREMENTAL_UPDATE:
        if (tabId != null) {
          this.handleIncrementalUpdate(message.payload as DashboardFetchPayload, tabId);
        }
        return true;

      case DashboardMessageType.DASHBOARD_UNFOLLOW:
        if (tabId != null) {
          this.handleUnfollow(message.payload as { userId: string }, tabId);
        }
        return true;

      case DashboardMessageType.DASHBOARD_FETCH_LAST_TWEET:
        this.handleFetchLastTweet(message.payload as { userId: string }, _sendResponse);
        return true;

      case DashboardMessageType.GROK_ANALYZE_START:
        console.log(`[X-Dashboard] Received GROK_ANALYZE_START, tabId=${tabId}, users=${(message.payload as any)?.users?.length}`);
        if (tabId != null) {
          this.handleGrokStart(message.payload as { users: FollowingDetail[] }, tabId);
        } else {
          console.warn('[X-Dashboard] GROK_ANALYZE_START: no tabId from sender');
        }
        return true;

      case DashboardMessageType.GROK_ANALYZE_STOP:
        this.handleGrokStop();
        return true;

      case DashboardMessageType.OPEN_DASHBOARD:
        this.handleOpenDashboard();
        return true;

      default:
        // Not a dashboard message, don't handle it
        return false;
    }
  }

  /**
   * Fetch all following users' details and stream progress back to the tab.
   */
  private async handleFetchAll(payload: DashboardFetchPayload, tabId: number): Promise<void> {
    try {
      const users = await this.dashboardApiClient.fetchAllFollowingDetails(
        payload.userId,
        (current: number, total: number) => {
          const progressPayload: DashboardProgressPayload = {
            current,
            total,
            phase: 'fetching_details',
          };
          this.sendToTab(tabId, {
            type: DashboardMessageType.DASHBOARD_PROGRESS,
            payload: progressPayload,
          });
        }
      );

      const completePayload: DashboardCompletePayload = {
        users,
        timestamp: Date.now(),
      };
      this.sendToTab(tabId, {
        type: DashboardMessageType.DASHBOARD_COMPLETE,
        payload: completePayload,
      });
    } catch (error: unknown) {
      const errorPayload = this.buildErrorPayload(error);
      this.sendToTab(tabId, {
        type: DashboardMessageType.DASHBOARD_ERROR,
        payload: errorPayload,
      });
    }
  }

  /**
   * Handle incremental update: fetch latest following list and stream progress.
   * Same flow as fetch all, but intended for delta updates from the Dashboard page.
   */
  private async handleIncrementalUpdate(
    payload: DashboardFetchPayload,
    tabId: number
  ): Promise<void> {
    try {
      const users = await this.dashboardApiClient.fetchAllFollowingDetails(
        payload.userId,
        (current: number, total: number) => {
          const progressPayload: DashboardProgressPayload = {
            current,
            total,
            phase: 'fetching_list',
          };
          this.sendToTab(tabId, {
            type: DashboardMessageType.DASHBOARD_PROGRESS,
            payload: progressPayload,
          });
        }
      );

      const completePayload: DashboardCompletePayload = {
        users,
        timestamp: Date.now(),
      };
      this.sendToTab(tabId, {
        type: DashboardMessageType.DASHBOARD_COMPLETE,
        payload: completePayload,
      });
    } catch (error: unknown) {
      const errorPayload = this.buildErrorPayload(error);
      this.sendToTab(tabId, {
        type: DashboardMessageType.DASHBOARD_ERROR,
        payload: errorPayload,
      });
    }
  }

  /**
   * Handle unfollow request: call the API and send result back.
   */
  private async handleUnfollow(payload: { userId: string }, tabId: number): Promise<void> {
    try {
      const success = await this.dashboardApiClient.unfollowUser(payload.userId);

      const resultPayload: UnfollowResultPayload = {
        userId: payload.userId,
        success,
        error: success ? undefined : 'Unfollow request failed',
      };
      this.sendToTab(tabId, {
        type: DashboardMessageType.UNFOLLOW_RESULT,
        payload: resultPayload,
      });
    } catch (error: unknown) {
      const resultPayload: UnfollowResultPayload = {
        userId: payload.userId,
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
      this.sendToTab(tabId, {
        type: DashboardMessageType.UNFOLLOW_RESULT,
        payload: resultPayload,
      });
    }
  }

  /**
   * Start sequential Grok analysis for a list of users.
   * Sends GROK_ANALYZE_RESULT for each user as analysis completes.
   * Respects grokAborted flag to allow stopping mid-sequence.
   */
  private async handleGrokStart(
    payload: { users: FollowingDetail[] },
    tabId: number
  ): Promise<void> {
    // Prevent multiple concurrent Grok analysis runs
    if (this.grokRunning) {
      console.log('[X-Dashboard] Grok already running, skipping');
      return;
    }

    this.grokRunning = true;
    this.grokAborted = false;

    const users = payload.users || [];
    console.log(`[X-Dashboard] Starting Grok analysis for ${users.length} users, tabId=${tabId}`);

    for (let i = 0; i < users.length; i++) {
      // Check if analysis was stopped
      if (this.grokAborted) {
        break;
      }

      const user = users[i];
      const result = await this.grokClient.analyzeUser(user.username, this.credentials);

      // Check again after async call in case stop was requested during analysis
      if (this.grokAborted) {
        break;
      }

      const resultPayload: GrokAnalyzeResultPayload = {
        userId: user.userId,
        analysis: result.content,
        status: result.success ? 'done' : 'failed',
      };

      this.sendToTab(tabId, {
        type: DashboardMessageType.GROK_ANALYZE_RESULT,
        payload: resultPayload,
      });
    }

    this.grokRunning = false;
  }

  /**
   * Stop the ongoing Grok analysis loop.
   */
  private handleGrokStop(): void {
    this.grokAborted = true;
  }

  /**
   * Fetch the last tweet time for a single user and respond directly via sendResponse.
   */
  private async handleFetchLastTweet(
    payload: { userId: string },
    sendResponse: (response?: any) => void
  ): Promise<void> {
    try {
      const lastTime = await this.dashboardApiClient.fetchLastTweetTime(payload.userId);
      sendResponse({ success: true, lastTweetTime: lastTime });
    } catch {
      sendResponse({ success: false, lastTweetTime: null });
    }
  }

  /**
   * Open the Dashboard page in a new Chrome tab.
   */
  private handleOpenDashboard(): void {
    const dashboardUrl = chrome.runtime.getURL('dist/dashboard/index.html');
    chrome.tabs.create({ url: dashboardUrl });
  }

  /**
   * Send a message to a specific tab. Silently ignores errors
   * (e.g., tab closed before message arrives).
   */
  private sendToTab(tabId: number, message: any): void {
    chrome.tabs.sendMessage(tabId, message).catch(() => {
      // Tab may have been closed; ignore send failures
    });
  }

  /**
   * Build a DashboardErrorPayload from an unknown error.
   * Classifies errors by type: auth_expired (401), rate_limit (429), network, or unknown.
   */
  private buildErrorPayload(error: unknown): DashboardErrorPayload {
    if (error instanceof Error) {
      const message = error.message;

      // Detect HTTP status codes from error messages
      if (message.includes('401') || message.toLowerCase().includes('auth')) {
        return {
          errorType: 'auth_expired',
          message: 'Authentication expired. Please refresh the X page and try again.',
        };
      }

      if (message.includes('429') || message.toLowerCase().includes('rate limit')) {
        return {
          errorType: 'rate_limit',
          message: 'Rate limited by X API. Please wait and try again later.',
        };
      }

      if (
        message.toLowerCase().includes('network') ||
        message.toLowerCase().includes('fetch') ||
        message.toLowerCase().includes('timeout') ||
        message.toLowerCase().includes('abort')
      ) {
        return {
          errorType: 'network',
          message: 'Network error occurred. Please check your connection and try again.',
        };
      }

      return {
        errorType: 'unknown',
        message: message || 'An unexpected error occurred.',
      };
    }

    return {
      errorType: 'unknown',
      message: 'An unexpected error occurred.',
    };
  }
}
