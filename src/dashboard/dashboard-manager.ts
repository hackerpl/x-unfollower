// DashboardManager - core state orchestrator for the Following Dashboard page
// Manages DashboardState, message handling, cache lifecycle

import type {
  DashboardState,
  SortField,
} from '../shared/dashboard-types';
import type {
  DashboardProgressPayload,
  DashboardCompletePayload,
  DashboardErrorPayload,
  UnfollowResultPayload,
} from '../shared/dashboard-messages';
import { DashboardMessageType } from '../shared/dashboard-messages';
import type { DashboardI18nStrings } from '../shared/dashboard-i18n';
import type { Locale } from '../shared/i18n';
import { getDashboardStrings } from '../shared/dashboard-i18n';
import { DashboardStore } from './dashboard-store';
import { DashboardRenderer, sortUsers, filterUsers } from './dashboard-renderer';

/**
 * DashboardManager coordinates the entire Dashboard page lifecycle:
 * - Holds and updates DashboardState
 * - Listens for Chrome runtime messages from Background Service Worker
 * - Manages cache loading and persistence via DashboardStore
 * - Handles sort, search, unfollow user interactions
 */
export class DashboardManager {
  private state: DashboardState;
  private store: DashboardStore;
  private renderer: DashboardRenderer;
  private userId: string;
  private i18n: DashboardI18nStrings;
  private messageListener: ((message: unknown) => void) | null = null;
  private unfollowResolvers: Map<string, (success: boolean) => void> = new Map();
  private isRefreshing = false;
  private autoRefreshTimer: ReturnType<typeof setInterval> | null = null;

  constructor(root: HTMLElement, locale: Locale, userId: string) {
    this.userId = userId;
    this.i18n = getDashboardStrings(locale);
    this.store = new DashboardStore();

    // Initialize state with defaults
    this.state = {
      isLoading: true,
      users: [],
      filteredUsers: [],
      sortField: 'followers_count',
      sortOrder: 'desc',
      searchQuery: '',
      fetchProgress: null,
      error: null,
      lastUpdatedAt: null,
    };

    // Initialize renderer with callbacks
    this.renderer = new DashboardRenderer(root, this.i18n, {
      onUnfollow: (uid: string) => this.handleUnfollow(uid),
      onRefreshTweet: (uid: string) => this.handleRefreshTweet(uid),
    });

    // Set up message listener for background responses
    this.setupMessageListener();

    // Start initialization
    this.init();
  }

  /**
   * Initialize dashboard: load cache, then decide fetch strategy.
   */
  private async init(): Promise<void> {
    // Show loading state
    this.renderer.renderLoading();

    // Render controls (sort + search)
    this.renderer.renderControls({
      onSortChange: (field: SortField, order: 'asc' | 'desc') => this.handleSortChange(field, order),
      onSearchChange: (query: string) => this.handleSearchChange(query),
    });

    // Render refresh button
    this.renderer.renderRefreshButton({
      onClick: () => this.handleFullRefresh(),
    });

    // Load cache
    const cache = await this.store.load();

    if (cache) {
      // Cache exists: render cached data directly (including saved last tweet times)
      this.state.users = cache.users;
      this.state.lastUpdatedAt = cache.cachedAt;
      this.state.isLoading = false;
      this.applyFilterAndSort();
      this.renderer.hideLoading();
      this.renderer.renderUserList(this.state.filteredUsers);
      // Auto-refresh last tweet times for users that don't have one yet
      this.startAutoRefreshTweetTimes();
    } else {
      // No cache: trigger full fetch
      this.triggerFullFetch();
    }
  }

  /**
   * Send DASHBOARD_FETCH_ALL message to background for full data retrieval.
   */
  private triggerFullFetch(): void {
    try {
      chrome.runtime.sendMessage({
        type: DashboardMessageType.DASHBOARD_FETCH_ALL,
        payload: { userId: this.userId },
      });
    } catch (err) {
      console.warn('[Dashboard] Failed to send fetch message:', err);
    }
  }

  /**
   * Send DASHBOARD_FETCH_ALL for incremental comparison after receiving data.
   */
  private triggerIncrementalUpdate(): void {
    try {
      chrome.runtime.sendMessage({
        type: DashboardMessageType.DASHBOARD_FETCH_ALL,
        payload: { userId: this.userId },
      });
    } catch (err) {
      console.warn('[Dashboard] Failed to send incremental update message:', err);
    }
  }

  /**
   * Handle full refresh action: clear cache and re-fetch all data.
   * Disables refresh button during the operation and shows progress.
   */
  private async handleFullRefresh(): Promise<void> {
    if (this.isRefreshing) return;

    this.isRefreshing = true;

    // Disable refresh button and show loading state
    this.renderer.setRefreshButtonDisabled(true);

    // Clear Local_Cache
    await this.store.clear();

    // Reset state for fresh fetch
    this.state.isLoading = true;
    this.state.error = null;
    this.state.fetchProgress = null;
    this.renderer.hideError();
    this.renderer.renderLoading();

    // Trigger full fetch to re-retrieve all data
    this.triggerFullFetch();
  }

  /**
   * Handle progress update from background during data fetch.
   */
  private handleProgress(payload: DashboardProgressPayload): void {
    this.state.fetchProgress = {
      current: payload.current,
      total: payload.total,
    };
    this.renderer.renderProgress(this.state.fetchProgress);
  }

  /**
   * Handle fetch completion from background.
   * Save to cache, update state, re-render.
   */
  private async handleComplete(payload: DashboardCompletePayload): Promise<void> {
    // Save to cache
    await this.store.save(payload.users, payload.timestamp);

    // Update state
    this.state.users = payload.users;
    this.state.lastUpdatedAt = payload.timestamp;
    this.state.isLoading = false;
    this.state.fetchProgress = null;
    this.state.error = null;

    // Apply sort/filter and re-render
    this.applyFilterAndSort();
    this.renderer.hideLoading();
    this.renderer.hideProgress();
    this.renderer.renderUserList(this.state.filteredUsers);

    // Re-enable refresh button after completion
    this.isRefreshing = false;
    this.renderer.setRefreshButtonDisabled(false);

    // Start auto-refreshing last tweet times for users that don't have one
    this.startAutoRefreshTweetTimes();
  }

  /**
   * Handle error from background during fetch.
   */
  private handleError(payload: DashboardErrorPayload): void {
    this.state.error = {
      errorType: payload.errorType,
      message: payload.message,
    };
    this.state.isLoading = false;
    this.state.fetchProgress = null;

    // If partial data is provided, keep it
    if (payload.partialData && payload.partialData.length > 0) {
      this.state.users = payload.partialData;
      this.applyFilterAndSort();
      this.renderer.renderUserList(this.state.filteredUsers);
    }

    this.renderer.hideLoading();
    this.renderer.hideProgress();

    // Re-enable refresh button on error
    this.isRefreshing = false;
    this.renderer.setRefreshButtonDisabled(false);

    this.renderer.renderError(this.state.error, {
      onRetry: () => {
        this.renderer.hideError();
        this.state.error = null;
        this.state.isLoading = true;
        this.renderer.renderLoading();
        this.triggerFullFetch();
      },
    });
  }

  /**
   * Handle sort field/order change from controls.
   */
  private handleSortChange(field: SortField, order: 'asc' | 'desc'): void {
    this.state.sortField = field;
    this.state.sortOrder = order;
    this.applyFilterAndSort();
    this.renderer.renderUserList(this.state.filteredUsers);
  }

  /**
   * Handle search query change from controls.
   */
  private handleSearchChange(query: string): void {
    this.state.searchQuery = query;
    this.applyFilterAndSort();
    this.renderer.renderUserList(this.state.filteredUsers);
  }

  /**
   * Handle refresh tweet time for a single user.
   * Sends DASHBOARD_FETCH_LAST_TWEET to background and waits for response.
   */
  private async handleRefreshTweet(userId: string): Promise<string | null> {
    try {
      const response = await chrome.runtime.sendMessage({
        type: DashboardMessageType.DASHBOARD_FETCH_LAST_TWEET,
        payload: { userId },
      });

      if (response?.success && response.lastTweetTime) {
        // Update user in state
        const userIndex = this.state.users.findIndex((u) => u.userId === userId);
        if (userIndex !== -1) {
          this.state.users[userIndex].lastTweetTime = response.lastTweetTime;
        }
        // Update cache
        await this.store.updateUser(userId, { lastTweetTime: response.lastTweetTime });
        return response.lastTweetTime;
      }
      return null;
    } catch (err) {
      console.warn('[Dashboard] Failed to refresh tweet time:', err);
      return null;
    }
  }

  /**
   * Handle unfollow action for a specific user.
   */
  private handleUnfollow(userId: string): Promise<boolean> {
    return new Promise<boolean>((resolve) => {
      this.unfollowResolvers.set(userId, resolve);

      try {
        chrome.runtime.sendMessage({
          type: DashboardMessageType.DASHBOARD_UNFOLLOW,
          payload: { userId },
        });
      } catch (err) {
        console.warn('[Dashboard] Failed to send unfollow message:', err);
        this.unfollowResolvers.delete(userId);
        resolve(false);
      }

      // Timeout after 15 seconds
      setTimeout(() => {
        if (this.unfollowResolvers.has(userId)) {
          this.unfollowResolvers.delete(userId);
          resolve(false);
        }
      }, 15000);
    });
  }

  /**
   * Handle unfollow result from background.
   */
  private async handleUnfollowResult(payload: UnfollowResultPayload): Promise<void> {
    const resolver = this.unfollowResolvers.get(payload.userId);
    this.unfollowResolvers.delete(payload.userId);

    if (payload.success) {
      this.state.users = this.state.users.filter((u) => u.userId !== payload.userId);
      await this.store.removeUsers([payload.userId]);
      this.applyFilterAndSort();
    }

    if (resolver) {
      resolver(payload.success);
    }
  }

  /**
   * Apply current filter (search) and sort to users, updating filteredUsers.
   */
  private applyFilterAndSort(): void {
    const filtered = filterUsers(this.state.users, this.state.searchQuery);
    this.state.filteredUsers = sortUsers(filtered, this.state.sortField, this.state.sortOrder);
  }

  /**
   * Set up Chrome runtime message listener for background responses.
   */
  private setupMessageListener(): void {
    this.messageListener = (message: unknown) => {
      const msg = message as { type?: string; payload?: unknown };
      if (!msg || !msg.type) return;

      switch (msg.type) {
        case DashboardMessageType.DASHBOARD_PROGRESS:
          this.handleProgress(msg.payload as DashboardProgressPayload);
          break;
        case DashboardMessageType.DASHBOARD_COMPLETE:
          this.handleComplete(msg.payload as DashboardCompletePayload);
          break;
        case DashboardMessageType.DASHBOARD_ERROR:
          this.handleError(msg.payload as DashboardErrorPayload);
          break;
        case DashboardMessageType.UNFOLLOW_RESULT:
          this.handleUnfollowResult(msg.payload as UnfollowResultPayload);
          break;
      }
    };

    chrome.runtime.onMessage.addListener(this.messageListener);
  }

  /**
   * Get current state (for testing or external access).
   */
  getState(): DashboardState {
    return { ...this.state };
  }

  /**
   * Clean up resources: remove message listener.
   */
  destroy(): void {
    this.stopAutoRefreshTweetTimes();
    if (this.messageListener) {
      chrome.runtime.onMessage.removeListener(this.messageListener);
      this.messageListener = null;
    }
  }

  /**
   * Start auto-refreshing last tweet times every 20 seconds for ALL users sequentially.
   * Picks one user at a time, cycling through the full list.
   */
  private startAutoRefreshTweetTimes(): void {
    // Stop any existing timer
    this.stopAutoRefreshTweetTimes();

    if (this.state.users.length === 0) return;

    let queueIndex = 0;

    this.autoRefreshTimer = setInterval(async () => {
      if (this.state.users.length === 0) {
        this.stopAutoRefreshTweetTimes();
        return;
      }

      // Stop after one full pass through all users
      if (queueIndex >= this.state.users.length) {
        this.stopAutoRefreshTweetTimes();
        return;
      }

      const user = this.state.users[queueIndex];
      queueIndex++;

      // Fetch last tweet time for this user (updates cache internally)
      const time = await this.handleRefreshTweet(user.userId);
      if (time) {
        // Re-render to update the UI
        this.applyFilterAndSort();
        this.renderer.renderUserList(this.state.filteredUsers);
      }
    }, 20000); // 20 seconds interval
  }

  /**
   * Stop the auto-refresh timer.
   */
  private stopAutoRefreshTweetTimes(): void {
    if (this.autoRefreshTimer) {
      clearInterval(this.autoRefreshTimer);
      this.autoRefreshTimer = null;
    }
  }
}
