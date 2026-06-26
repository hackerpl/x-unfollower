// DashboardManager - core state orchestrator for the Following Dashboard page
// Manages DashboardState, message handling, cache lifecycle

import type {
  DashboardState,
  SortField,
} from '../shared/dashboard-types';
import type {
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
      currentTab: 'all',
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
      onToggleStar: (uid: string) => this.handleToggleStar(uid),
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

    // Render tabs (left side navigation)
    this.renderer.renderTabs({
      currentTab: this.state.currentTab,
      onTabChange: (tab) => this.handleTabChange(tab),
      counts: this.getTabCounts(),
    });

    // Render controls (sort + search)
    this.renderer.renderControls({
      onSortChange: (field: SortField, order: 'asc' | 'desc') => this.handleSortChange(field, order),
      onSearchChange: (query: string) => this.handleSearchChange(query),
    });

    // Render refresh button
    this.renderer.renderRefreshButton({
      onClick: () => this.handleFullRefresh(),
    });

    // Render cache hint text
    this.renderer.renderHint('数据状态保存在本地缓存，刷新页面后保留，切换浏览器失效');

    // Load cache
    const cache = await this.store.load();

    if (cache) {
      // Cache exists: render cached data directly
      this.state.users = cache.users;
      this.state.lastUpdatedAt = cache.cachedAt;
      this.state.isLoading = false;
      this.applyFilterAndSort();
      this.renderer.hideLoading();
      this.renderer.renderUserList(this.state.filteredUsers);
      this.renderer.renderTabs({
        currentTab: this.state.currentTab,
        onTabChange: (t) => this.handleTabChange(t),
        counts: this.getTabCounts(),
      });
      // Auto-refresh last tweet times for current tab (missing only)
      this.startAutoRefreshTweetTimes(false);
    } else {
      // No cache: show empty state, data will be populated when user visits X page
      this.state.isLoading = false;
      this.renderer.hideLoading();
      this.renderer.renderError(
        { errorType: 'unknown', message: '暂无数据，请先访问 X 页面以自动拉取关注列表' },
        {}
      );
    }
  }

  /**
   * Handle "刷新时间" button: refresh last tweet time for all users in current tab.
   */
  private async handleFullRefresh(): Promise<void> {
    if (this.isRefreshing) return;
    this.isRefreshing = true;
    this.renderer.setRefreshButtonDisabled(true);

    // Start auto-refresh for ALL users in current tab (not just missing)
    this.startAutoRefreshTweetTimes(true);
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
   * Handle tab change.
   */
  private handleTabChange(tab: 'all' | 'starred' | 'quality' | 'growing'): void {
    this.state.currentTab = tab;
    this.applyFilterAndSort();
    this.renderer.renderUserList(this.state.filteredUsers);
    this.renderer.renderTabs({
      currentTab: this.state.currentTab,
      onTabChange: (t) => this.handleTabChange(t),
      counts: this.getTabCounts(),
    });
    // Restart auto-refresh for missing last tweet in new tab
    this.startAutoRefreshTweetTimes(false);
  }

  /**
   * Get user counts for each tab.
   */
  private getTabCounts(): { all: number; starred: number; quality: number; growing: number } {
    return {
      all: this.state.users.length,
      starred: this.state.users.filter((u) => u.starred).length,
      quality: this.state.users.filter((u) => u.friendsCount > 0 && u.followersCount / u.friendsCount > 10).length,
      growing: this.state.users.filter((u) => u.friendsCount > 0 && u.followersCount / u.friendsCount < 1).length,
    };
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
   * Toggle starred status for a user. Starred users are pinned to top.
   */
  private async handleToggleStar(userId: string): Promise<void> {
    const userIndex = this.state.users.findIndex((u) => u.userId === userId);
    if (userIndex === -1) return;

    const newStarred = !this.state.users[userIndex].starred;
    this.state.users[userIndex].starred = newStarred;

    // Persist to cache
    await this.store.updateUser(userId, { starred: newStarred });

    // Re-render
    this.applyFilterAndSort();
    this.renderer.renderUserList(this.state.filteredUsers);
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
    let users = this.state.users;

    // Filter by current tab
    switch (this.state.currentTab) {
      case 'starred':
        users = users.filter((u) => u.starred);
        break;
      case 'quality':
        users = users.filter((u) => u.friendsCount > 0 && u.followersCount / u.friendsCount > 10);
        break;
      case 'growing':
        users = users.filter((u) => u.friendsCount > 0 && u.followersCount / u.friendsCount < 1);
        break;
      // 'all' shows everything
    }

    // Apply search filter
    const filtered = filterUsers(users, this.state.searchQuery);

    // Separate starred and non-starred users
    const starred = filtered.filter((u) => u.starred);
    const nonStarred = filtered.filter((u) => !u.starred);

    // Only sort non-starred users; starred stay in original order at top
    const sortedNonStarred = sortUsers(nonStarred, this.state.sortField, this.state.sortOrder);

    this.state.filteredUsers = [...starred, ...sortedNonStarred];
  }

  /**
   * Set up Chrome runtime message listener for background responses.
   * Only listens for UNFOLLOW_RESULT now (dashboard no longer fetches user lists).
   */
  private setupMessageListener(): void {
    this.messageListener = (message: unknown) => {
      const msg = message as { type?: string; payload?: unknown };
      if (!msg || !msg.type) return;

      switch (msg.type) {
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
   * Start auto-refreshing last tweet times every 20 seconds for users in current tab.
   * @param refreshAll - if true, refresh ALL users in current tab; if false, only those missing lastTweetTime
   */
  private startAutoRefreshTweetTimes(refreshAll: boolean): void {
    // Stop any existing timer
    this.stopAutoRefreshTweetTimes();

    // Get users for current tab
    let tabUsers = this.getUsersForCurrentTab();

    // Filter to only missing if not refreshAll
    if (!refreshAll) {
      tabUsers = tabUsers.filter((u) => !u.lastTweetTime);
    }

    if (tabUsers.length === 0) {
      // Nothing to refresh, re-enable button
      this.isRefreshing = false;
      this.renderer.setRefreshButtonDisabled(false);
      return;
    }

    let queueIndex = 0;
    const queue = tabUsers.map((u) => u.userId);

    this.autoRefreshTimer = setInterval(async () => {
      // Stop after one full pass
      if (queueIndex >= queue.length) {
        this.stopAutoRefreshTweetTimes();
        this.isRefreshing = false;
        this.renderer.setRefreshButtonDisabled(false);
        return;
      }

      const userId = queue[queueIndex];
      queueIndex++;

      // Fetch last tweet time for this user
      const time = await this.handleRefreshTweet(userId);
      if (time) {
        this.applyFilterAndSort();
        this.renderer.renderUserList(this.state.filteredUsers);
      }
    }, 20000); // 20 seconds interval
  }

  /**
   * Get users filtered by current tab (without search/sort applied).
   */
  private getUsersForCurrentTab(): import('../shared/dashboard-types').FollowingDetail[] {
    switch (this.state.currentTab) {
      case 'starred':
        return this.state.users.filter((u) => u.starred);
      case 'quality':
        return this.state.users.filter((u) => u.friendsCount > 0 && u.followersCount / u.friendsCount > 10);
      case 'growing':
        return this.state.users.filter((u) => u.friendsCount > 0 && u.followersCount / u.friendsCount < 1);
      default:
        return this.state.users;
    }
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
