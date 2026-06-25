// Dashboard message handler for routing messages between Dashboard page and background services

import type { AuthCredentials } from '../shared/types';
import {
  DashboardMessageType,
  type DashboardFetchPayload,
  type DashboardProgressPayload,
  type DashboardCompletePayload,
  type DashboardErrorPayload,
  type UnfollowResultPayload,
} from '../shared/dashboard-messages';
import { DashboardAPIClient } from './dashboard-api-client';

/**
 * Incoming message structure from Dashboard page or content scripts
 */
interface DashboardMessage {
  type: string;
  payload?: any;
}

/**
 * DashboardMessageHandler routes messages from the Dashboard page
 * to the DashboardAPIClient and sends progress/completion/error responses back.
 */
export class DashboardMessageHandler {
  private dashboardApiClient: DashboardAPIClient;
  private credentials: AuthCredentials;

  constructor(credentials: AuthCredentials) {
    this.credentials = credentials;
    this.dashboardApiClient = new DashboardAPIClient(credentials);
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

      case DashboardMessageType.OPEN_DASHBOARD:
        this.handleOpenDashboard();
        return true;

      default:
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
   * Send a message to a specific tab. Silently ignores errors.
   */
  private sendToTab(tabId: number, message: any): void {
    chrome.tabs.sendMessage(tabId, message).catch(() => {});
  }

  /**
   * Build a DashboardErrorPayload from an unknown error.
   */
  private buildErrorPayload(error: unknown): DashboardErrorPayload {
    if (error instanceof Error) {
      const message = error.message;
      if (message.includes('401') || message.toLowerCase().includes('auth')) {
        return { errorType: 'auth_expired', message: 'Authentication expired. Please refresh the X page.' };
      }
      if (message.includes('429') || message.toLowerCase().includes('rate limit')) {
        return { errorType: 'rate_limit', message: 'Rate limited. Please wait and try again.' };
      }
      if (message.toLowerCase().includes('network') || message.toLowerCase().includes('fetch') || message.toLowerCase().includes('timeout')) {
        return { errorType: 'network', message: 'Network error. Please check your connection.' };
      }
      return { errorType: 'unknown', message: message || 'An unexpected error occurred.' };
    }
    return { errorType: 'unknown', message: 'An unexpected error occurred.' };
  }
}
