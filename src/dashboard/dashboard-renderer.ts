// Dashboard Renderer module
// Renders the following user list as a table view with dark theme styling

import type { FollowingDetail, SortField, DashboardProgress, GrokProgress } from '../shared/dashboard-types';
import type { DashboardI18nStrings } from '../shared/dashboard-i18n';

/** Maximum characters to display before truncation in analysis column */
const ANALYSIS_TRUNCATE_LENGTH = 50;

/** Debounce delay for search input in milliseconds */
const SEARCH_DEBOUNCE_MS = 300;

/** Duration for fade-out animation in milliseconds */
const FADE_OUT_DURATION = 300;

/**
 * Sort an array of FollowingDetail by the specified field and order.
 * Returns a new sorted array without mutating the original.
 */
export function sortUsers(
  users: FollowingDetail[],
  field: SortField,
  order: 'asc' | 'desc'
): FollowingDetail[] {
  const sorted = [...users];
  const direction = order === 'asc' ? 1 : -1;

  sorted.sort((a, b) => {
    let comparison: number;

    switch (field) {
      case 'friends_count':
        comparison = a.friendsCount - b.friendsCount;
        break;
      case 'followers_count':
        comparison = a.followersCount - b.followersCount;
        break;
      case 'last_tweet_time': {
        // null values go to the end regardless of sort order
        const timeA = a.lastTweetTime ? new Date(a.lastTweetTime).getTime() : NaN;
        const timeB = b.lastTweetTime ? new Date(b.lastTweetTime).getTime() : NaN;

        if (isNaN(timeA) && isNaN(timeB)) {
          comparison = 0;
        } else if (isNaN(timeA)) {
          // a has no time, push it to the end
          return 1;
        } else if (isNaN(timeB)) {
          // b has no time, push it to the end
          return -1;
        } else {
          comparison = timeA - timeB;
        }
        break;
      }
    }

    return comparison * direction;
  });

  return sorted;
}

/**
 * Filter users by a search query string.
 * Matches against username or displayName, case-insensitive.
 * Returns a new filtered array.
 */
export function filterUsers(
  users: FollowingDetail[],
  query: string
): FollowingDetail[] {
  const normalizedQuery = query.toLowerCase().trim();

  // Empty query returns all users
  if (normalizedQuery === '') {
    return [...users];
  }

  return users.filter(
    (user) =>
      user.username.toLowerCase().includes(normalizedQuery) ||
      user.displayName.toLowerCase().includes(normalizedQuery)
  );
}

/**
 * Callback interface for user actions triggered from the renderer.
 */
export interface DashboardRendererCallbacks {
  /** Called when user clicks the unfollow button. Returns true on success, false on failure. */
  onUnfollow: (userId: string) => Promise<boolean>;
  /** Called when user clicks the refresh button for a user's last tweet time. Returns the ISO time or null. */
  onRefreshTweet?: (userId: string) => Promise<string | null>;
  /** Called when user clicks the star button to toggle starred status. */
  onToggleStar?: (userId: string) => void;
}

/**
 * DashboardRenderer handles rendering the user list table,
 * tooltips for analysis content, username click navigation,
 * and the unfollow button with hover/click interactions.
 */
export class DashboardRenderer {
  private root: HTMLElement;
  private i18n: DashboardI18nStrings;
  private container: HTMLElement;
  private tooltipEl: HTMLElement | null = null;
  private progressEl: HTMLElement | null = null;
  private grokProgressEl: HTMLElement | null = null;
  private errorEl: HTMLElement | null = null;
  private loadingEl: HTMLElement | null = null;
  private progressHideTimer: ReturnType<typeof setTimeout> | null = null;
  private refreshBtnEl: HTMLButtonElement | null = null;
  private callbacks: DashboardRendererCallbacks | null = null;

  constructor(root: HTMLElement, i18n: DashboardI18nStrings, callbacks?: DashboardRendererCallbacks) {
    this.callbacks = callbacks || null;
    this.root = root;
    this.i18n = i18n;
    this.container = document.createElement('div');
    this.container.className = 'dashboard-user-list';
    this.root.appendChild(this.container);
    this.injectStyles();
  }

  /**
   * Set or update the renderer callbacks (e.g., onUnfollow handler).
   */
  setCallbacks(callbacks: DashboardRendererCallbacks): void {
    this.callbacks = callbacks;
  }

  /**
   * Render tab navigation bar above the controls.
   */
  renderTabs(options: {
    currentTab: 'all' | 'starred' | 'quality' | 'growing';
    onTabChange: (tab: 'all' | 'starred' | 'quality' | 'growing') => void;
    counts: { all: number; starred: number; quality: number; growing: number };
  }): void {
    // Remove existing tabs if re-rendered
    const existing = this.root.querySelector('.dashboard-tabs');
    if (existing) {
      existing.remove();
    }

    const tabsDiv = document.createElement('div');
    tabsDiv.className = 'dashboard-tabs';

    const tabs: Array<{ id: 'all' | 'starred' | 'quality' | 'growing'; label: string; count: number }> = [
      { id: 'all', label: this.i18n.tabAll, count: options.counts.all },
      { id: 'starred', label: this.i18n.tabStarred, count: options.counts.starred },
      { id: 'quality', label: this.i18n.tabQuality, count: options.counts.quality },
      { id: 'growing', label: this.i18n.tabGrowing, count: options.counts.growing },
    ];

    for (const tab of tabs) {
      const btn = document.createElement('button');
      btn.className = 'dashboard-tab' + (tab.id === options.currentTab ? ' active' : '');
      btn.innerHTML = `${tab.label} <span class="tab-count">${tab.count}</span>`;
      btn.addEventListener('click', () => {
        options.onTabChange(tab.id);
      });
      tabsDiv.appendChild(btn);
    }

    // Insert at the very top of root (before controls)
    this.root.insertBefore(tabsDiv, this.root.firstChild);
  }

  /**
   * Render the sort/search controls area above the table.
   * Sort: dropdown for field selection + toggle button for asc/desc.
   * Search: debounced text input for filtering by username or display name.
   */
  renderControls(options: {
    onSortChange: (field: SortField, order: 'asc' | 'desc') => void;
    onSearchChange: (query: string) => void;
  }): void {
    // Remove existing controls if re-rendered
    const existing = this.root.querySelector('.dashboard-controls');
    if (existing) {
      existing.remove();
    }

    const controlsDiv = document.createElement('div');
    controlsDiv.className = 'dashboard-controls';

    // Sort controls container
    const sortContainer = document.createElement('div');
    sortContainer.className = 'dashboard-sort-controls';

    // Sort field dropdown
    const sortSelect = document.createElement('select');
    sortSelect.className = 'dashboard-sort-select';
    const sortOptions: { value: SortField; label: string }[] = [
      { value: 'friends_count', label: this.i18n.sortByFriends },
      { value: 'followers_count', label: this.i18n.sortByFollowers },
      { value: 'last_tweet_time', label: this.i18n.sortByLastTweet },
    ];
    for (const opt of sortOptions) {
      const option = document.createElement('option');
      option.value = opt.value;
      option.textContent = opt.label;
      sortSelect.appendChild(option);
    }

    // Sort order toggle button
    let currentOrder: 'asc' | 'desc' = 'desc';
    const orderButton = document.createElement('button');
    orderButton.className = 'dashboard-sort-order-btn';
    orderButton.textContent = this.i18n.descending;
    orderButton.setAttribute('data-order', currentOrder);

    // Sort change handler
    const emitSortChange = () => {
      options.onSortChange(sortSelect.value as SortField, currentOrder);
    };

    sortSelect.addEventListener('change', () => {
      emitSortChange();
    });

    orderButton.addEventListener('click', () => {
      currentOrder = currentOrder === 'asc' ? 'desc' : 'asc';
      orderButton.textContent = currentOrder === 'asc' ? this.i18n.ascending : this.i18n.descending;
      orderButton.setAttribute('data-order', currentOrder);
      emitSortChange();
    });

    sortContainer.appendChild(sortSelect);
    sortContainer.appendChild(orderButton);

    // Search input
    const searchInput = document.createElement('input');
    searchInput.type = 'text';
    searchInput.className = 'dashboard-search-input';
    searchInput.placeholder = this.i18n.searchPlaceholder;

    // Debounced search handler
    let debounceTimer: ReturnType<typeof setTimeout> | null = null;
    searchInput.addEventListener('input', () => {
      if (debounceTimer !== null) {
        clearTimeout(debounceTimer);
      }
      debounceTimer = setTimeout(() => {
        options.onSearchChange(searchInput.value);
      }, SEARCH_DEBOUNCE_MS);
    });

    controlsDiv.appendChild(sortContainer);
    controlsDiv.appendChild(searchInput);

    // Insert controls before the table container
    this.root.insertBefore(controlsDiv, this.container);
  }

  /**
   * Render the user list as a table view.
   * Each row includes avatar, username, display name, friends count,
   * followers count, last tweet time, and analysis content.
   */
  renderUserList(users: FollowingDetail[]): void {
    this.container.innerHTML = '';

    const table = document.createElement('table');
    table.className = 'dashboard-table';

    // Table header
    const thead = document.createElement('thead');
    const headerRow = document.createElement('tr');
    const headers = ['★', '', '@', this.i18n.headerName, this.i18n.headerBio, this.i18n.headerFollowing, this.i18n.headerFollowers, this.i18n.headerLastTweet, this.i18n.headerAction];
    for (const text of headers) {
      const th = document.createElement('th');
      th.textContent = text;
      headerRow.appendChild(th);
    }
    thead.appendChild(headerRow);
    table.appendChild(thead);

    // Table body
    const tbody = document.createElement('tbody');
    for (const user of users) {
      tbody.appendChild(this.renderUserRow(user));
    }
    table.appendChild(tbody);

    this.container.appendChild(table);
  }

  /**
   * Remove all rendered content from the container.
   */
  clear(): void {
    this.container.innerHTML = '';
    this.hideTooltip();
  }

  /**
   * Return the rendered container element.
   */
  getContainer(): HTMLElement {
    return this.container;
  }

  /**
   * Show fetch progress indicator with "Fetching X/Y" text and progress bar.
   * Auto-hides after a brief delay when current equals total.
   */
  renderProgress(progress: DashboardProgress): void {
    if (this.progressHideTimer) {
      clearTimeout(this.progressHideTimer);
      this.progressHideTimer = null;
    }

    if (!this.progressEl) {
      this.progressEl = document.createElement('div');
      this.progressEl.className = 'dashboard-progress';
      this.root.insertBefore(this.progressEl, this.container);
    }

    const percent = progress.total > 0
      ? Math.round((progress.current / progress.total) * 100)
      : 0;

    this.progressEl.style.display = 'block';
    this.progressEl.innerHTML = `
      <div class="progress-text">${this.i18n.progress(progress.current, progress.total)}</div>
      <div class="progress-bar-track">
        <div class="progress-bar-fill" style="width: ${percent}%"></div>
      </div>
    `;

    // Auto-hide after brief delay when fetch is complete
    if (progress.total > 0 && progress.current === progress.total) {
      this.progressHideTimer = setTimeout(() => {
        this.hideProgress();
      }, 1500);
    }
  }

  /**
   * Show Grok analysis progress with "Analyzing X/Y" text.
   */
  renderGrokProgress(progress: GrokProgress): void {
    if (!this.grokProgressEl) {
      this.grokProgressEl = document.createElement('div');
      this.grokProgressEl.className = 'dashboard-grok-progress';
      // Insert after progress element or before container
      const insertBefore = this.progressEl?.nextSibling || this.container;
      this.root.insertBefore(this.grokProgressEl, insertBefore as Node);
    }

    const percent = progress.total > 0
      ? Math.round((progress.analyzed / progress.total) * 100)
      : 0;

    this.grokProgressEl.style.display = 'block';
    this.grokProgressEl.innerHTML = `
      <div class="progress-text">${this.i18n.grokProgress(progress.analyzed, progress.total)}</div>
      <div class="progress-bar-track">
        <div class="progress-bar-fill grok-fill" style="width: ${percent}%"></div>
      </div>
    `;

    // Auto-hide when analysis is complete
    if (progress.total > 0 && progress.analyzed === progress.total) {
      setTimeout(() => {
        if (this.grokProgressEl) {
          this.grokProgressEl.style.display = 'none';
        }
      }, 1500);
    }
  }

  /**
   * Completely hide the progress indicator (set display: none).
   */
  hideProgress(): void {
    if (this.progressHideTimer) {
      clearTimeout(this.progressHideTimer);
      this.progressHideTimer = null;
    }
    if (this.progressEl) {
      this.progressEl.style.display = 'none';
    }
    if (this.grokProgressEl) {
      this.grokProgressEl.style.display = 'none';
    }
  }

  /**
   * Show error state with appropriate message and actions.
   * - 'auth_expired': guidance to refresh X page
   * - 'network': error message + retry button
   * - other: generic error message
   */
  renderError(
    error: { errorType: string; message: string },
    callbacks: { onRetry?: () => void }
  ): void {
    if (!this.errorEl) {
      this.errorEl = document.createElement('div');
      this.errorEl.className = 'dashboard-error-card';
      this.root.appendChild(this.errorEl);
    }

    this.errorEl.style.display = 'flex';
    this.errorEl.innerHTML = '';

    // Error icon
    const icon = document.createElement('div');
    icon.className = 'error-icon';

    // Error message
    const messageEl = document.createElement('div');
    messageEl.className = 'error-message';

    if (error.errorType === 'auth_expired') {
      icon.textContent = '🔒';
      messageEl.textContent = this.i18n.authExpired;
    } else if (error.errorType === 'network') {
      icon.textContent = '⚠️';
      messageEl.textContent = this.i18n.networkError;
    } else {
      icon.textContent = '❌';
      messageEl.textContent = error.message;
    }

    this.errorEl.appendChild(icon);
    this.errorEl.appendChild(messageEl);

    // Retry button for network errors (or when onRetry callback is provided)
    if (error.errorType === 'network' && callbacks.onRetry) {
      const retryBtn = document.createElement('button');
      retryBtn.className = 'error-retry-btn';
      retryBtn.textContent = this.i18n.retryButton;
      retryBtn.addEventListener('click', () => {
        callbacks.onRetry!();
      });
      this.errorEl.appendChild(retryBtn);
    }
  }

  /**
   * Hide the error display.
   */
  hideError(): void {
    if (this.errorEl) {
      this.errorEl.style.display = 'none';
    }
  }

  /**
   * Show initial loading state with i18n.loadingData text.
   */
  renderLoading(): void {
    if (!this.loadingEl) {
      this.loadingEl = document.createElement('div');
      this.loadingEl.className = 'dashboard-loading';
      this.root.insertBefore(this.loadingEl, this.container);
    }

    this.loadingEl.style.display = 'flex';
    this.loadingEl.innerHTML = `
      <div class="loading-spinner"></div>
      <div class="loading-text">${this.i18n.loadingData}</div>
    `;
  }

  /**
   * Hide loading state.
   */
  hideLoading(): void {
    if (this.loadingEl) {
      this.loadingEl.style.display = 'none';
    }
  }

  /**
   * Render the "Full Refresh" button in the controls area.
   * Creates an outline-style button with i18n.fullRefresh text.
   */
  renderRefreshButton(options: { onClick: () => void; disabled?: boolean }): void {
    // Remove existing refresh button if re-rendered
    if (this.refreshBtnEl) {
      this.refreshBtnEl.remove();
    }

    this.refreshBtnEl = document.createElement('button');
    this.refreshBtnEl.className = 'dashboard-refresh-btn';
    this.refreshBtnEl.textContent = this.i18n.fullRefresh;
    this.refreshBtnEl.disabled = options.disabled ?? false;

    this.refreshBtnEl.addEventListener('click', () => {
      if (!this.refreshBtnEl?.disabled) {
        options.onClick();
      }
    });

    // Insert into existing controls container, or before the table container
    const controlsDiv = this.root.querySelector('.dashboard-controls');
    if (controlsDiv) {
      controlsDiv.appendChild(this.refreshBtnEl);
    } else {
      this.root.insertBefore(this.refreshBtnEl, this.container);
    }
  }

  /**
   * Enable or disable the refresh button.
   * When disabled, button shows a loading appearance.
   */
  setRefreshButtonDisabled(disabled: boolean): void {
    if (this.refreshBtnEl) {
      this.refreshBtnEl.disabled = disabled;
      if (disabled) {
        this.refreshBtnEl.classList.add('loading');
      } else {
        this.refreshBtnEl.classList.remove('loading');
      }
    }
  }

  /**
   * Render a small hint/tip text below the controls area.
   */
  renderHint(text: string): void {
    const hint = document.createElement('div');
    hint.className = 'dashboard-hint';
    hint.textContent = text;
    this.root.insertBefore(hint, this.container);
  }

  /**
   * Render a single user row in the table.
   */
  private renderUserRow(user: FollowingDetail): HTMLTableRowElement {
    const row = document.createElement('tr');
    row.className = 'dashboard-user-row';
    if (user.starred) {
      row.classList.add('starred-row');
    }

    // Highlight based on followers/following ratio
    if (user.friendsCount > 0) {
      const ratio = user.followersCount / user.friendsCount;
      if (ratio > 10) {
        row.classList.add('ratio-high');
      }
    }

    // Star cell
    const starCell = document.createElement('td');
    starCell.className = 'cell-star';
    const starBtn = document.createElement('button');
    starBtn.className = user.starred ? 'star-btn active' : 'star-btn';
    starBtn.textContent = user.starred ? '★' : '☆';
    starBtn.title = user.starred ? this.i18n.starRemove : this.i18n.starAdd;
    starBtn.addEventListener('click', () => {
      this.callbacks?.onToggleStar?.(user.userId);
    });
    starCell.appendChild(starBtn);
    row.appendChild(starCell);

    // Avatar cell
    const avatarCell = document.createElement('td');
    avatarCell.className = 'cell-avatar';
    const avatar = document.createElement('img');
    avatar.src = user.avatarUrl;
    avatar.alt = user.displayName;
    avatar.width = 40;
    avatar.height = 40;
    avatar.className = 'user-avatar';
    avatarCell.appendChild(avatar);
    row.appendChild(avatarCell);

    // Username cell (clickable)
    const usernameCell = document.createElement('td');
    usernameCell.className = 'cell-username';
    const usernameLink = document.createElement('a');
    usernameLink.href = `https://x.com/${user.username}`;
    usernameLink.textContent = `@${user.username}`;
    usernameLink.className = 'username-link';
    usernameLink.addEventListener('click', (e) => {
      e.preventDefault();
      this.handleUsernameClick(user.username);
    });
    usernameCell.appendChild(usernameLink);
    row.appendChild(usernameCell);

    // Display name cell
    const displayNameCell = document.createElement('td');
    displayNameCell.className = 'cell-displayname';
    displayNameCell.textContent = user.displayName;
    row.appendChild(displayNameCell);

    // Bio cell (truncated with tooltip)
    const bioCell = document.createElement('td');
    bioCell.className = 'cell-bio';
    const bioText = user.bio || '-';
    const bioSpan = document.createElement('span');
    bioSpan.className = 'bio-text';
    bioSpan.textContent = this.truncateText(bioText, 40);
    if (user.bio && user.bio.length > 40) {
      bioSpan.addEventListener('mouseenter', (e) => {
        this.showTooltip(user.bio!, e as MouseEvent);
      });
      bioSpan.addEventListener('mousemove', (e) => {
        this.positionTooltip(e as MouseEvent);
      });
      bioSpan.addEventListener('mouseleave', () => {
        this.hideTooltip();
      });
    }
    bioCell.appendChild(bioSpan);
    row.appendChild(bioCell);

    // Friends count cell
    const friendsCell = document.createElement('td');
    friendsCell.className = 'cell-number';
    friendsCell.textContent = this.formatNumber(user.friendsCount);
    row.appendChild(friendsCell);

    // Followers count cell
    const followersCell = document.createElement('td');
    followersCell.className = 'cell-number';
    followersCell.textContent = this.formatNumber(user.followersCount);
    row.appendChild(followersCell);

    // Last tweet time cell
    const lastTweetCell = document.createElement('td');
    lastTweetCell.className = 'cell-time';
    if (user.lastTweetTime) {
      lastTweetCell.textContent = this.formatRelativeTime(user.lastTweetTime);
    } else {
      // Show a small refresh button to manually fetch last tweet time
      const refreshTimeBtn = document.createElement('button');
      refreshTimeBtn.className = 'refresh-time-btn';
      refreshTimeBtn.textContent = '↻';
      refreshTimeBtn.title = this.i18n.refreshTweetTime;
      refreshTimeBtn.addEventListener('click', () => {
        if (!this.callbacks?.onRefreshTweet) return;
        refreshTimeBtn.disabled = true;
        refreshTimeBtn.textContent = '...';
        this.callbacks.onRefreshTweet(user.userId).then((time) => {
          if (time) {
            lastTweetCell.textContent = this.formatRelativeTime(time);
          } else {
            refreshTimeBtn.disabled = false;
            refreshTimeBtn.textContent = '↻';
          }
        });
      });
      lastTweetCell.appendChild(refreshTimeBtn);
    }
    row.appendChild(lastTweetCell);

    // Action cell - hide unfollow button for starred users
    const actionCell = document.createElement('td');
    actionCell.className = 'cell-action';

    if (!user.starred) {
      const unfollowBtn = document.createElement('button');
      unfollowBtn.className = 'follow-btn following';
      unfollowBtn.textContent = this.i18n.followingButton;
      unfollowBtn.setAttribute('data-user-id', user.userId);

      // Hover: show "Unfollow" state with red styling
      unfollowBtn.addEventListener('mouseenter', () => {
        if (unfollowBtn.classList.contains('loading')) return;
        unfollowBtn.classList.add('hover');
        unfollowBtn.textContent = this.i18n.unfollowButton;
      });

      // Mouse leave: restore default "Following" state
      unfollowBtn.addEventListener('mouseleave', () => {
        if (unfollowBtn.classList.contains('loading')) return;
        unfollowBtn.classList.remove('hover');
        unfollowBtn.textContent = this.i18n.followingButton;
      });

      // Click: trigger unfollow action
      unfollowBtn.addEventListener('click', () => {
        this.handleUnfollowClick(unfollowBtn, row, user.userId);
      });

      actionCell.appendChild(unfollowBtn);
    }

    row.appendChild(actionCell);

    return row;
  }

  /**
   * Handle the unfollow button click: show loading, call callback,
   * fade-out row on success, or restore button + show error on failure.
   */
  private handleUnfollowClick(
    btn: HTMLButtonElement,
    row: HTMLTableRowElement,
    userId: string
  ): void {
    if (!this.callbacks?.onUnfollow) return;
    if (btn.classList.contains('loading')) return;

    // Enter loading state
    btn.classList.add('loading');
    btn.classList.remove('hover');
    btn.disabled = true;
    btn.textContent = this.i18n.followingButton;

    this.callbacks.onUnfollow(userId).then((success) => {
      if (success) {
        // Fade-out animation then remove row
        row.classList.add('fade-out');
        setTimeout(() => {
          row.remove();
        }, FADE_OUT_DURATION);
      } else {
        // Restore button state and show error toast
        btn.classList.remove('loading');
        btn.disabled = false;
        btn.textContent = this.i18n.followingButton;
        this.showToast(this.i18n.unfollowFailed);
      }
    }).catch(() => {
      // Restore button state and show error toast
      btn.classList.remove('loading');
      btn.disabled = false;
      btn.textContent = this.i18n.followingButton;
      this.showToast(this.i18n.unfollowFailed);
    });
  }

  /**
   * Show a temporary toast notification at the bottom of the viewport.
   * Auto-dismisses after 3 seconds.
   */
  private showToast(message: string): void {
    const toast = document.createElement('div');
    toast.className = 'dashboard-toast';
    toast.textContent = message;
    document.body.appendChild(toast);

    // Trigger display
    requestAnimationFrame(() => {
      toast.classList.add('show');
    });

    // Auto-dismiss after 3 seconds
    setTimeout(() => {
      toast.classList.remove('show');
      setTimeout(() => {
        toast.remove();
      }, 300);
    }, 3000);
  }

  /**
   * Get the display text for analysis column based on status.
   */
  private getAnalysisText(user: FollowingDetail): string {
    switch (user.analysisStatus) {
      case 'pending':
        return this.i18n.analysisPending;
      case 'failed':
        return this.i18n.analysisFailed;
      case 'done':
        return user.accountAnalysis || '-';
    }
  }

  /**
   * Truncate text to maxLength, appending "..." if exceeds limit.
   */
  private truncateText(text: string, maxLength: number): string {
    if (text.length <= maxLength) {
      return text;
    }
    return text.slice(0, maxLength) + '...';
  }

  /**
   * Format a number with locale-appropriate separators for display.
   */
  private formatNumber(num: number): string {
    return num.toLocaleString();
  }

  /**
   * Format an ISO timestamp into a human-readable relative time string.
   * Falls back to ISO date string if parsing fails.
   */
  private formatRelativeTime(isoTime: string): string {
    try {
      const date = new Date(isoTime);
      const now = Date.now();
      const diffMs = now - date.getTime();

      if (isNaN(diffMs)) {
        return isoTime;
      }

      const diffSeconds = Math.floor(diffMs / 1000);
      const diffMinutes = Math.floor(diffSeconds / 60);
      const diffHours = Math.floor(diffMinutes / 60);
      const diffDays = Math.floor(diffHours / 24);

      if (diffDays > 30) {
        return date.toLocaleDateString();
      } else if (diffDays > 0) {
        return this.i18n.timeDaysAgo(diffDays);
      } else if (diffHours > 0) {
        return this.i18n.timeHoursAgo(diffHours);
      } else if (diffMinutes > 0) {
        return this.i18n.timeMinutesAgo(diffMinutes);
      } else {
        return this.i18n.timeJustNow;
      }
    } catch {
      return isoTime;
    }
  }

  /**
   * Handle username click: activate existing tab or open new tab.
   * Uses chrome.tabs API to find and switch to existing tabs.
   */
  private handleUsernameClick(username: string): void {
    const targetUrl = `https://x.com/${username}`;
    const urlPattern = `*://x.com/${username}`;

    chrome.tabs.query({ url: urlPattern }, (tabs) => {
      if (tabs && tabs.length > 0 && tabs[0].id !== undefined) {
        // Activate existing tab
        chrome.tabs.update(tabs[0].id, { active: true });
      } else {
        // Open in new tab
        chrome.tabs.create({ url: targetUrl });
      }
    });
  }

  /**
   * Show tooltip with full analysis content near cursor position.
   */
  private showTooltip(content: string, event: MouseEvent): void {
    if (!this.tooltipEl) {
      this.tooltipEl = document.createElement('div');
      this.tooltipEl.className = 'dashboard-tooltip';
      document.body.appendChild(this.tooltipEl);
    }

    this.tooltipEl.textContent = content;
    this.tooltipEl.style.display = 'block';
    this.positionTooltip(event);
  }

  /**
   * Position tooltip element relative to mouse cursor.
   */
  private positionTooltip(event: MouseEvent): void {
    if (!this.tooltipEl) return;

    const offsetX = 12;
    const offsetY = 12;
    const tooltipWidth = this.tooltipEl.offsetWidth;
    const viewportWidth = window.innerWidth;

    let left = event.clientX + offsetX;
    // Prevent tooltip from overflowing viewport right edge
    if (left + tooltipWidth > viewportWidth - 16) {
      left = event.clientX - tooltipWidth - offsetX;
    }

    this.tooltipEl.style.left = `${left}px`;
    this.tooltipEl.style.top = `${event.clientY + offsetY}px`;
  }

  /**
   * Hide and reset tooltip element.
   */
  private hideTooltip(): void {
    if (this.tooltipEl) {
      this.tooltipEl.style.display = 'none';
    }
  }

  /**
   * Inject scoped CSS styles for the dashboard table and tooltip.
   * Uses dark theme to match X aesthetic.
   */
  private injectStyles(): void {
    if (document.getElementById('dashboard-renderer-styles')) return;

    const style = document.createElement('style');
    style.id = 'dashboard-renderer-styles';
    style.textContent = `
      .dashboard-user-list {
        width: 100%;
        overflow-x: auto;
      }

      .dashboard-table {
        width: 100%;
        border-collapse: collapse;
        font-size: 13px;
        color: #b8fff0;
        background-color: rgba(10, 10, 15, 0.8);
        border: 1px solid rgba(0, 255, 213, 0.1);
        border-radius: 8px;
        overflow: hidden;
      }

      .dashboard-table thead th {
        text-align: left;
        padding: 12px 8px;
        border-bottom: 1px solid rgba(0, 255, 213, 0.15);
        font-weight: 600;
        font-size: 11px;
        color: rgba(0, 255, 213, 0.6);
        white-space: nowrap;
        text-transform: uppercase;
        letter-spacing: 0.5px;
      }

      .dashboard-table tbody tr {
        border-bottom: 1px solid rgba(0, 255, 213, 0.06);
        transition: background-color 0.2s ease, box-shadow 0.2s ease;
      }

      .dashboard-table tbody tr:hover {
        background-color: rgba(0, 255, 213, 0.04);
        box-shadow: inset 0 0 20px rgba(0, 255, 213, 0.02);
      }

      .dashboard-table td {
        padding: 10px 8px;
        vertical-align: middle;
      }

      .cell-star {
        width: 32px;
        text-align: center;
      }

      .star-btn {
        background: transparent;
        border: none;
        font-size: 18px;
        cursor: pointer;
        color: rgba(0, 255, 213, 0.3);
        padding: 4px;
        line-height: 1;
        transition: color 0.2s, transform 0.15s, text-shadow 0.2s;
      }

      .star-btn:hover {
        color: #00ffd5;
        transform: scale(1.2);
        text-shadow: 0 0 8px rgba(0, 255, 213, 0.5);
      }

      .star-btn.active {
        color: #ff00ff;
        text-shadow: 0 0 10px rgba(255, 0, 255, 0.6);
      }

      .starred-row {
        background-color: rgba(255, 0, 255, 0.05);
        border-left: 2px solid rgba(255, 0, 255, 0.4);
      }

      .ratio-high {
        background-color: rgba(0, 255, 213, 0.08);
        border-left: 3px solid rgba(0, 255, 213, 0.6);
      }

      .cell-avatar {
        width: 48px;
      }

      .user-avatar {
        border-radius: 50%;
        object-fit: cover;
        display: block;
      }

      .cell-username {
        white-space: nowrap;
      }

      .username-link {
        color: #00ffd5;
        text-decoration: none;
        cursor: pointer;
        transition: text-shadow 0.2s;
      }

      .username-link:hover {
        text-decoration: none;
        text-shadow: 0 0 8px rgba(0, 255, 213, 0.5);
      }

      .cell-displayname {
        max-width: 160px;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      .cell-bio {
        max-width: 180px;
      }

      .bio-text {
        display: inline-block;
        max-width: 100%;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        color: rgba(184, 255, 240, 0.5);
        font-size: 12px;
        cursor: default;
      }

      .cell-number {
        text-align: right;
        white-space: nowrap;
        font-variant-numeric: tabular-nums;
        color: rgba(0, 255, 213, 0.8);
      }

      .cell-time {
        white-space: nowrap;
        color: rgba(120, 0, 255, 0.7);
      }

      .refresh-time-btn {
        background: transparent;
        border: 1px solid rgba(0, 255, 213, 0.3);
        border-radius: 50%;
        width: 26px;
        height: 26px;
        color: rgba(0, 255, 213, 0.5);
        font-size: 14px;
        cursor: pointer;
        transition: border-color 0.2s, color 0.2s, box-shadow 0.2s;
      }

      .refresh-time-btn:hover:not(:disabled) {
        border-color: #00ffd5;
        color: #00ffd5;
        box-shadow: 0 0 8px rgba(0, 255, 213, 0.3);
      }

      .refresh-time-btn:disabled {
        opacity: 0.4;
        cursor: not-allowed;
      }

      .cell-analysis {
        max-width: 200px;
      }

      .analysis-text {
        display: inline-block;
        max-width: 100%;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        color: #71767b;
        cursor: default;
      }

      /* Tab navigation */
      .dashboard-tabs {
        display: flex;
        gap: 4px;
        padding: 12px 8px;
        border-bottom: 1px solid rgba(0, 255, 213, 0.1);
        background-color: rgba(10, 10, 15, 0.95);
        position: sticky;
        top: 0;
        z-index: 100;
        backdrop-filter: blur(8px);
      }

      .dashboard-tab {
        display: flex;
        align-items: center;
        gap: 6px;
        padding: 8px 16px;
        font-size: 13px;
        font-weight: 500;
        color: rgba(0, 255, 213, 0.5);
        background: transparent;
        border: 1px solid transparent;
        border-radius: 4px;
        cursor: pointer;
        transition: background-color 0.2s, color 0.2s, border-color 0.2s, box-shadow 0.2s;
        font-family: inherit;
      }

      .dashboard-tab:hover {
        background-color: rgba(0, 255, 213, 0.05);
        color: #00ffd5;
      }

      .dashboard-tab.active {
        color: #00ffd5;
        background-color: rgba(0, 255, 213, 0.08);
        border-color: rgba(0, 255, 213, 0.4);
        box-shadow: 0 0 12px rgba(0, 255, 213, 0.1);
      }

      .tab-count {
        font-size: 11px;
        color: rgba(120, 0, 255, 0.7);
        font-weight: 400;
      }

      .dashboard-tab.active .tab-count {
        color: #7800ff;
      }

      /* Sort and search controls */
      .dashboard-controls {
        display: flex;
        align-items: center;
        gap: 12px;
        padding: 12px 8px;
        border-bottom: 1px solid rgba(0, 255, 213, 0.08);
        background-color: rgba(10, 10, 15, 0.95);
        position: sticky;
        top: 52px;
        z-index: 99;
        backdrop-filter: blur(8px);
      }

      .dashboard-sort-controls {
        display: flex;
        align-items: center;
        gap: 8px;
      }

      .dashboard-sort-select {
        background-color: rgba(0, 255, 213, 0.05);
        color: #00ffd5;
        border: 1px solid rgba(0, 255, 213, 0.2);
        border-radius: 4px;
        padding: 6px 10px;
        font-size: 12px;
        font-family: inherit;
        cursor: pointer;
        outline: none;
      }

      .dashboard-sort-select:focus {
        border-color: rgba(0, 255, 213, 0.5);
        box-shadow: 0 0 8px rgba(0, 255, 213, 0.15);
      }

      .dashboard-sort-order-btn {
        background-color: rgba(0, 255, 213, 0.05);
        color: #00ffd5;
        border: 1px solid rgba(0, 255, 213, 0.2);
        border-radius: 4px;
        padding: 6px 12px;
        font-size: 12px;
        font-family: inherit;
        cursor: pointer;
        white-space: nowrap;
        transition: border-color 0.2s, box-shadow 0.2s;
      }

      .dashboard-sort-order-btn:hover {
        border-color: rgba(0, 255, 213, 0.5);
        box-shadow: 0 0 8px rgba(0, 255, 213, 0.15);
      }

      .dashboard-search-input {
        flex: 1;
        background-color: rgba(0, 255, 213, 0.03);
        color: #b8fff0;
        border: 1px solid rgba(0, 255, 213, 0.15);
        border-radius: 4px;
        padding: 8px 16px;
        font-size: 13px;
        font-family: inherit;
        outline: none;
        min-width: 180px;
        transition: border-color 0.2s, box-shadow 0.2s;
      }

      .dashboard-search-input::placeholder {
        color: rgba(0, 255, 213, 0.3);
      }

      .dashboard-search-input:focus {
        border-color: rgba(0, 255, 213, 0.5);
        box-shadow: 0 0 12px rgba(0, 255, 213, 0.1);
        background-color: rgba(0, 255, 213, 0.05);
      }

      .dashboard-tooltip {
        display: none;
        position: fixed;
        max-width: 360px;
        padding: 10px 14px;
        background-color: #0d0d1a;
        color: #b8fff0;
        border: 1px solid rgba(0, 255, 213, 0.3);
        border-radius: 4px;
        font-size: 12px;
        line-height: 1.5;
        white-space: pre-wrap;
        word-break: break-word;
        z-index: 10000;
        box-shadow: 0 4px 20px rgba(0, 255, 213, 0.1), 0 0 1px rgba(0, 255, 213, 0.3);
        pointer-events: none;
      }

      /* Progress indicator styles */
      .dashboard-progress,
      .dashboard-grok-progress {
        display: none;
        padding: 10px 16px;
        margin-bottom: 8px;
        background-color: rgba(0, 255, 213, 0.03);
        border: 1px solid rgba(0, 255, 213, 0.1);
        border-radius: 4px;
      }

      .progress-text {
        font-size: 12px;
        color: rgba(0, 255, 213, 0.7);
        margin-bottom: 6px;
      }

      .progress-bar-track {
        width: 100%;
        height: 3px;
        background-color: rgba(0, 255, 213, 0.1);
        border-radius: 2px;
        overflow: hidden;
      }

      .progress-bar-fill {
        height: 100%;
        background: linear-gradient(90deg, #00ffd5, #7800ff);
        border-radius: 2px;
        transition: width 0.3s ease;
        box-shadow: 0 0 6px rgba(0, 255, 213, 0.4);
      }

      .progress-bar-fill.grok-fill {
        background: linear-gradient(90deg, #7800ff, #ff00ff);
        box-shadow: 0 0 6px rgba(120, 0, 255, 0.4);
      }

      /* Error card styles */
      .dashboard-error-card {
        display: none;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        padding: 32px 24px;
        margin: 16px 0;
        background-color: rgba(255, 0, 60, 0.03);
        border: 1px solid rgba(255, 0, 60, 0.2);
        border-radius: 4px;
        text-align: center;
        gap: 12px;
      }

      .error-icon {
        font-size: 32px;
        line-height: 1;
      }

      .error-message {
        font-size: 13px;
        color: #b8fff0;
        line-height: 1.5;
        max-width: 400px;
      }

      .error-retry-btn {
        margin-top: 8px;
        padding: 8px 20px;
        font-size: 13px;
        font-weight: 600;
        font-family: inherit;
        color: #00ffd5;
        background-color: transparent;
        border: 1px solid rgba(0, 255, 213, 0.3);
        border-radius: 4px;
        cursor: pointer;
        transition: background-color 0.2s, box-shadow 0.2s;
      }

      .error-retry-btn:hover {
        background-color: rgba(0, 255, 213, 0.08);
        box-shadow: 0 0 10px rgba(0, 255, 213, 0.15);
      }

      /* Loading state styles */
      .dashboard-loading {
        display: none;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        padding: 48px 24px;
        gap: 16px;
      }

      .loading-spinner {
        width: 28px;
        height: 28px;
        border: 2px solid rgba(0, 255, 213, 0.15);
        border-top-color: #00ffd5;
        border-radius: 50%;
        animation: dashboard-spin 0.8s linear infinite;
        box-shadow: 0 0 10px rgba(0, 255, 213, 0.2);
      }

      .loading-text {
        font-size: 13px;
        color: rgba(0, 255, 213, 0.6);
      }

      /* Unfollow button styles */
      .follow-btn.following {
        border: 1px solid rgba(0, 255, 213, 0.3);
        border-radius: 4px;
        padding: 6px 16px;
        color: #00ffd5;
        background: transparent;
        cursor: pointer;
        font-weight: 600;
        font-size: 12px;
        font-family: inherit;
        white-space: nowrap;
        transition: border-color 0.2s, color 0.2s, background-color 0.2s, box-shadow 0.2s;
      }

      .follow-btn.following.hover {
        border-color: #ff003c;
        color: #ff003c;
        background-color: rgba(255, 0, 60, 0.1);
        box-shadow: 0 0 10px rgba(255, 0, 60, 0.2);
      }

      .follow-btn.following.loading {
        opacity: 0.5;
        pointer-events: none;
      }

      /* Row fade-out animation */
      .dashboard-user-row.fade-out {
        opacity: 0;
        transition: opacity 0.3s ease;
      }

      .cell-action {
        white-space: nowrap;
        text-align: center;
      }

      /* Toast notification */
      .dashboard-toast {
        position: fixed;
        bottom: 24px;
        left: 50%;
        transform: translateX(-50%) translateY(20px);
        background-color: rgb(244, 33, 46);
        color: #fff;
        padding: 10px 20px;
        border-radius: 8px;
        font-size: 14px;
        font-weight: 500;
        z-index: 10001;
        opacity: 0;
        transition: opacity 0.3s ease, transform 0.3s ease;
        pointer-events: none;
      }

      .dashboard-toast.show {
        opacity: 1;
        transform: translateX(-50%) translateY(0);
      }

      /* Refresh button styles */
      .dashboard-refresh-btn {
        margin-left: auto;
        padding: 6px 16px;
        font-size: 12px;
        font-weight: 600;
        font-family: inherit;
        color: #00ffd5;
        background-color: transparent;
        border: 1px solid rgba(0, 255, 213, 0.3);
        border-radius: 4px;
        cursor: pointer;
        white-space: nowrap;
        transition: background-color 0.2s, box-shadow 0.2s, opacity 0.2s;
      }

      .dashboard-refresh-btn:hover:not(:disabled) {
        background-color: rgba(0, 255, 213, 0.08);
        box-shadow: 0 0 10px rgba(0, 255, 213, 0.15);
      }

      .dashboard-refresh-btn:disabled {
        opacity: 0.4;
        cursor: not-allowed;
      }

      .dashboard-refresh-btn.loading {
        opacity: 0.4;
        pointer-events: none;
      }

      .dashboard-hint {
        padding: 6px 16px;
        font-size: 11px;
        color: #ff003c;
        text-align: center;
        letter-spacing: 0.3px;
      }

      /* Toast notification */
      .dashboard-toast {
        position: fixed;
        bottom: 24px;
        left: 50%;
        transform: translateX(-50%) translateY(20px);
        background-color: rgba(255, 0, 60, 0.9);
        color: #fff;
        padding: 10px 20px;
        border-radius: 4px;
        font-size: 13px;
        font-weight: 500;
        z-index: 10001;
        opacity: 0;
        transition: opacity 0.3s, transform 0.3s;
        pointer-events: none;
        box-shadow: 0 0 15px rgba(255, 0, 60, 0.3);
      }

      .dashboard-toast.show {
        opacity: 1;
        transform: translateX(-50%) translateY(0);
      }

      @keyframes dashboard-spin {
        to { transform: rotate(360deg); }
      }
    `;
    document.head.appendChild(style);
  }
}
