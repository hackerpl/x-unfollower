// SidebarManager - manages sidebar state, message handling, caching, and user interactions

import { UIRenderer, buildProfileUrl } from './ui-renderer';
import type { SidebarState } from './ui-renderer';
import { ThemeDetector } from './theme-detector';
import { MessageType } from '../shared/messages';
import type { Message, ProgressPayload, CompletePayload, ErrorPayload } from '../shared/messages';
import type { UserInfo, CachedData } from '../shared/types';
import { getStrings } from '../shared/i18n';

/** Chrome storage key for cached non-follower results */
const CACHE_STORAGE_KEY = 'cached_result';

/**
 * SidebarManager coordinates the sidebar lifecycle:
 * - Holds and updates SidebarState
 * - Listens for Chrome runtime messages from Background Script
 * - Handles user interactions (refresh, user click)
 * - Manages data caching via chrome.storage.local
 */
export class SidebarManager {
  private renderer: UIRenderer;
  private themeDetector: ThemeDetector;
  private state: SidebarState;
  private messageListener: ((message: Message) => void) | null = null;

  constructor(renderer: UIRenderer, themeDetector: ThemeDetector) {
    this.renderer = renderer;
    this.themeDetector = themeDetector;
    this.state = {
      isCollapsed: false,
      isLoading: false,
      nonFollowers: [],
      error: null,
      progress: null,
      totalRetries: 0,
      hasCache: false,
      followingCount: 0,
      followersCount: 0,
    };
  }

  /**
   * Initialize the SidebarManager:
   * - Load cached data from chrome.storage.local
   * - Register event handlers on UIRenderer
   * - Start listening for Chrome runtime messages
   * - Observe theme changes to keep sidebar in sync
   * - Perform initial render
   */
  async initialize(): Promise<void> {
    // Load cached data
    await this.loadCachedData();

    // Register event handlers on the renderer
    this.renderer.setEventHandlers({
      onRefreshClick: () => this.handleRefreshClick(),
      onUserClick: (username: string) => this.handleUserClick(username),
    });

    // Observe theme changes and update renderer
    this.themeDetector.observeThemeChanges((theme) => {
      this.renderer.updateTheme(theme);
      this.render();
    });

    // Start listening for messages from Background Script
    this.startMessageListener();

    // Initial render
    this.render();

    // Auto-fetch on first load if no cache available
    if (!this.state.hasCache) {
      this.handleRefreshClick();
    }
  }

  /**
   * Update state partially and re-render the sidebar.
   */
  setState(partialState: Partial<SidebarState>): void {
    this.state = { ...this.state, ...partialState };
    this.render();
  }

  /**
   * Get the current sidebar state (for testing or external access).
   */
  getState(): SidebarState {
    return { ...this.state };
  }

  /**
   * Handle an incoming message from the Background Script.
   * Routes to appropriate handler based on message type.
   */
  handleMessage(message: Message): void {
    switch (message.type) {
      case MessageType.FETCH_PROGRESS:
        this.handleFetchProgress(message.payload as ProgressPayload);
        break;
      case MessageType.FETCH_COMPLETE:
        this.handleFetchComplete(message.payload as CompletePayload);
        break;
      case MessageType.FETCH_ERROR:
        this.handleFetchError(message.payload as ErrorPayload);
        break;
      case MessageType.AUTH_REQUIRED:
        this.handleAuthRequired();
        break;
      case MessageType.AUTH_EXPIRED:
        this.handleAuthExpired();
        break;
    }
  }

  /**
   * Send a message to the Background Script via chrome.runtime.sendMessage.
   */
  sendMessage(message: Message): void {
    try {
      chrome.runtime.sendMessage(message);
    } catch (err) {
      // "Extension context invalidated" happens after extension reload
      // while old content script is still on page. Safe to ignore.
      console.warn('[X-NF] sendMessage failed (extension may have been reloaded):', (err as Error).message);
    }
  }

  /**
   * Clean up resources: remove message listener and stop theme observation.
   */
  destroy(): void {
    this.stopMessageListener();
    this.themeDetector.stopObserving();
  }

  // --- Private: Message Handlers ---

  /**
   * Handle FETCH_PROGRESS: update progress in state and re-render.
   */
  private handleFetchProgress(payload: ProgressPayload): void {
    console.log(`[X-NF] Progress: ${payload.type} page ${payload.currentPage}, ${payload.totalUsers} users`);
    this.setState({
      progress: payload,
    });
  }

  /**
   * Handle FETCH_COMPLETE: save to cache, update nonFollowers list, clear loading state.
   */
  private handleFetchComplete(payload: CompletePayload): void {
    console.log(`[X-NF] Complete: ${payload.nonFollowers.length} non-followers, following: ${payload.followingCount}, followers: ${payload.followersCount}`);
    // Save successful result to cache
    this.saveCachedData(payload.nonFollowers, payload.followingCount, payload.followersCount);

    this.setState({
      isLoading: false,
      nonFollowers: payload.nonFollowers,
      error: null,
      progress: null,
      totalRetries: 0,
      hasCache: true,
      followingCount: payload.followingCount,
      followersCount: payload.followersCount,
    });
  }

  /**
   * Handle FETCH_ERROR: attempt to show cached data if available, update error state.
   */
  private handleFetchError(payload: ErrorPayload): void {
    console.error(`[X-NF] Error: ${payload.errorType} - ${payload.message}`, payload.failedList ? `(failed list: ${payload.failedList})` : '');
    const newRetries = this.state.totalRetries + 1;

    if (this.state.hasCache) {
      // Show cached data with error notice
      this.setState({
        isLoading: false,
        error: payload,
        progress: null,
        totalRetries: newRetries,
      });
    } else {
      // No cache available, show error state
      this.setState({
        isLoading: false,
        nonFollowers: [],
        error: payload,
        progress: null,
        totalRetries: newRetries,
      });
    }
  }

  /**
   * Handle AUTH_REQUIRED: user needs to log in to X.
   */
  private handleAuthRequired(): void {
    this.setState({
      isLoading: false,
      error: {
        errorType: 'auth_expired',
        message: getStrings().loginRequired,
        retryCount: 0,
        maxRetries: 0,
      },
      progress: null,
    });
  }

  /**
   * Handle AUTH_EXPIRED: token expired, need to re-authenticate.
   */
  private handleAuthExpired(): void {
    this.setState({
      isLoading: false,
      error: {
        errorType: 'auth_expired',
        message: getStrings().errorAuthExpired,
        retryCount: 0,
        maxRetries: 0,
      },
      progress: null,
    });
  }

  // --- Private: User Interaction Handlers ---

  /**
   * Handle refresh button click:
   * - Send START_FETCH message to Background Script
   * - Set loading state and disable refresh button
   */
  private handleRefreshClick(): void {
    this.sendMessage({
      type: MessageType.START_FETCH,
      payload: null,
    });

    this.setState({
      isLoading: true,
      error: null,
      progress: null,
    });
  }

  /**
   * Handle user item click: open user's X profile in a new tab.
   */
  private handleUserClick(username: string): void {
    window.open(buildProfileUrl(username), '_blank');
  }

  // --- Private: Cache Logic ---

  /**
   * Load cached non-follower data from chrome.storage.local.
   * If cache exists, populate state with cached data.
   */
  private async loadCachedData(): Promise<void> {
    try {
      const result = await chrome.storage.local.get(CACHE_STORAGE_KEY);
      const cached: CachedData | null = result[CACHE_STORAGE_KEY] ?? null;

      if (cached && cached.nonFollowers && cached.nonFollowers.length > 0) {
        this.state.nonFollowers = cached.nonFollowers;
        this.state.hasCache = true;
        this.state.followingCount = cached.followingCount || 0;
        this.state.followersCount = cached.followersCount || 0;
      }
    } catch {
      // Silently ignore cache loading errors
    }
  }

  /**
   * Save non-follower data to chrome.storage.local for caching.
   */
  private saveCachedData(nonFollowers: UserInfo[], followingCount: number, followersCount: number): void {
    const cachedData: CachedData = {
      nonFollowers,
      followingCount,
      followersCount,
      cachedAt: Date.now(),
    };

    try {
      chrome.storage.local.set({ [CACHE_STORAGE_KEY]: cachedData });
    } catch {
      // Silently ignore cache saving errors
    }
  }

  // --- Private: Message Listener ---

  /**
   * Start listening for Chrome runtime messages from Background Script.
   */
  private startMessageListener(): void {
    this.messageListener = (message: Message) => {
      if (message && message.type) {
        this.handleMessage(message);
      }
    };
    chrome.runtime.onMessage.addListener(this.messageListener);
  }

  /**
   * Stop listening for Chrome runtime messages.
   */
  private stopMessageListener(): void {
    if (this.messageListener) {
      chrome.runtime.onMessage.removeListener(this.messageListener);
      this.messageListener = null;
    }
  }

  // --- Private: Rendering ---

  /**
   * Re-render the sidebar with current state.
   */
  private render(): void {
    this.renderer.render(this.state);
  }
}
