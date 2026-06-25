// UI Renderer module for the non-followers card
// Renders directly into a container element using X page's native CSS classes

import type { ThemeInfo } from './theme-detector';
import type { UserInfo } from '../shared/types';
import type { ProgressPayload, ErrorPayload } from '../shared/messages';

/**
 * Sidebar state used by UIRenderer to determine what to render
 */
export interface SidebarState {
  isCollapsed: boolean;
  isLoading: boolean;
  nonFollowers: UserInfo[];
  error: ErrorPayload | null;
  progress: ProgressPayload | null;
  totalRetries: number;
  hasCache: boolean;
  followingCount: number;
  followersCount: number;
}

/**
 * Format progress text for display during data fetching.
 */
export function formatProgress(payload: ProgressPayload): string {
  const typeLabel = payload.type === 'following' ? '关注列表' : '粉丝列表';
  return `正在获取${typeLabel} 第${payload.currentPage}页 (已获取${payload.totalUsers}人)...`;
}

/**
 * Build X profile URL from username.
 */
export function buildProfileUrl(username: string): string {
  return `https://x.com/${username}`;
}

/**
 * Map errorType to Chinese description text.
 */
export function renderErrorMessage(error: ErrorPayload): string {
  switch (error.errorType) {
    case 'rate_limit':
      return '请求频率超限，请稍后再试';
    case 'network':
      return '网络连接失败，请检查网络后重试';
    case 'parse_error':
      return '数据解析错误';
    case 'auth_expired':
      return '认证已过期，请刷新页面重新登录';
    case 'unknown':
    default:
      return '发生未知错误，请稍后再试';
  }
}

/** Number of users shown before "show more" */
const INITIAL_SHOW_COUNT = 3;

/**
 * UIRenderer renders the non-followers card directly into a container element.
 * Uses X page's native CSS classes to match the existing sidebar card style.
 * No Shadow DOM - blends with the page natively.
 */
export class UIRenderer {
  private container: HTMLElement;
  private theme: ThemeInfo;
  private onRetryClick: (() => void) | null = null;
  private onRefreshClick: (() => void) | null = null;
  private onUserClick: ((username: string) => void) | null = null;
  private showingAll = false;

  constructor(theme: ThemeInfo, container: HTMLElement) {
    this.theme = theme;
    this.container = container;
  }

  /**
   * For backward compat with tests - returns the container.
   */
  createContainer(): HTMLElement {
    return this.container;
  }

  /**
   * Set event handler callbacks
   */
  setEventHandlers(handlers: {
    onRetryClick?: () => void;
    onRefreshClick?: () => void;
    onUserClick?: (username: string) => void;
  }): void {
    this.onRetryClick = handlers.onRetryClick ?? null;
    this.onRefreshClick = handlers.onRefreshClick ?? null;
    this.onUserClick = handlers.onUserClick ?? null;
  }

  /**
   * Update theme (for dynamic theme switching).
   */
  updateTheme(theme: ThemeInfo): void {
    this.theme = theme;
  }

  /**
   * Render the card content based on state.
   */
  render(state: SidebarState): void {
    this.container.innerHTML = '';

    // Header section
    this.container.appendChild(this.renderHeader(state));

    // Stats bar
    if (state.followingCount > 0 || state.followersCount > 0) {
      this.container.appendChild(this.renderStats(state.followingCount, state.followersCount));
    }

    // Content
    if (state.isLoading) {
      this.container.appendChild(this.renderLoading(state.progress));
    } else if (state.error) {
      this.container.appendChild(this.renderError(state.error));
    } else if (state.nonFollowers.length === 0) {
      this.container.appendChild(this.renderEmpty());
    } else {
      this.container.appendChild(this.renderUserList(state.nonFollowers));
    }
  }

  /**
   * Render header with title and refresh button.
   * Uses X's native padding/font style classes.
   */
  private renderHeader(state: SidebarState): HTMLElement {
    const header = document.createElement('div');
    header.style.cssText = 'display:flex;align-items:center;justify-content:space-between;padding:12px 16px;';

    const title = document.createElement('span');
    title.style.cssText = 'font-size:20px;font-weight:800;line-height:24px;';
    title.textContent = '未回关用户';

    const refreshBtn = document.createElement('div');
    refreshBtn.style.cssText = 'width:34px;height:34px;display:flex;align-items:center;justify-content:center;border-radius:50%;cursor:pointer;transition:background-color 0.2s;font-size:18px;';
    refreshBtn.textContent = '↻';
    refreshBtn.title = '刷新数据';

    if (state.isLoading) {
      refreshBtn.style.opacity = '0.5';
      refreshBtn.style.cursor = 'not-allowed';
    } else {
      refreshBtn.addEventListener('click', () => this.onRefreshClick?.());
      refreshBtn.addEventListener('mouseenter', () => { refreshBtn.style.backgroundColor = 'rgba(255,255,255,0.1)'; });
      refreshBtn.addEventListener('mouseleave', () => { refreshBtn.style.backgroundColor = ''; });
    }

    header.appendChild(title);
    header.appendChild(refreshBtn);
    return header;
  }

  /**
   * Render stats bar showing following/followers counts.
   */
  private renderStats(followingCount: number, followersCount: number): HTMLElement {
    const stats = document.createElement('div');
    stats.style.cssText = 'display:flex;gap:16px;padding:0 16px 12px;font-size:13px;opacity:0.7;';

    const followingStat = document.createElement('span');
    followingStat.innerHTML = `<strong style="font-weight:700;opacity:1">${followingCount}</strong> 关注`;

    const followersStat = document.createElement('span');
    followersStat.innerHTML = `<strong style="font-weight:700;opacity:1">${followersCount}</strong> 粉丝`;

    stats.appendChild(followingStat);
    stats.appendChild(followersStat);
    return stats;
  }

  /**
   * Render user list with "show more" link.
   */
  renderUserList(users: UserInfo[]): HTMLElement {
    const container = document.createElement('div');
    const hasMore = users.length > INITIAL_SHOW_COUNT;

    const list = document.createElement('div');

    const renderItems = (items: UserInfo[]) => {
      list.innerHTML = '';
      for (const user of items) {
        list.appendChild(this.renderUserItem(user));
      }
    };

    // Show first N or all
    this.showingAll = false;
    renderItems(users.slice(0, INITIAL_SHOW_COUNT));
    container.appendChild(list);

    // "显示更多" link
    if (hasMore) {
      const showMore = document.createElement('div');
      showMore.style.cssText = 'padding:12px 16px;color:rgb(29,155,240);font-size:15px;cursor:pointer;transition:background-color 0.2s;';
      showMore.textContent = `显示更多`;
      showMore.addEventListener('mouseenter', () => { showMore.style.backgroundColor = 'rgba(29,155,240,0.1)'; });
      showMore.addEventListener('mouseleave', () => { showMore.style.backgroundColor = ''; });
      showMore.addEventListener('click', () => {
        if (this.showingAll) {
          renderItems(users.slice(0, INITIAL_SHOW_COUNT));
          showMore.textContent = '显示更多';
          this.showingAll = false;
          list.style.maxHeight = '';
          list.style.overflowY = '';
        } else {
          renderItems(users);
          showMore.textContent = '收起';
          this.showingAll = true;
          list.style.maxHeight = '400px';
          list.style.overflowY = 'auto';
        }
      });
      container.appendChild(showMore);
    }

    return container;
  }

  /**
   * Render a single user item matching X's "推荐关注" item style.
   */
  private renderUserItem(user: UserInfo): HTMLElement {
    const item = document.createElement('a');
    item.href = buildProfileUrl(user.username);
    item.target = '_blank';
    item.rel = 'noopener noreferrer';
    item.style.cssText = 'display:flex;align-items:center;gap:12px;padding:12px 16px;text-decoration:none;color:inherit;cursor:pointer;transition:background-color 0.2s;';
    item.addEventListener('click', (e) => {
      e.preventDefault();
      this.onUserClick?.(user.username);
    });
    item.addEventListener('mouseenter', () => { item.style.backgroundColor = 'rgba(255,255,255,0.03)'; });
    item.addEventListener('mouseleave', () => { item.style.backgroundColor = ''; });

    const avatar = document.createElement('img');
    avatar.src = user.avatarUrl;
    avatar.alt = user.displayName;
    avatar.width = 40;
    avatar.height = 40;
    avatar.style.cssText = 'border-radius:50%;object-fit:cover;flex-shrink:0;';

    const info = document.createElement('div');
    info.style.cssText = 'display:flex;flex-direction:column;min-width:0;flex:1;';

    const displayName = document.createElement('span');
    displayName.style.cssText = 'font-size:15px;font-weight:700;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;';
    displayName.textContent = user.displayName;

    const handle = document.createElement('span');
    handle.style.cssText = 'font-size:13px;opacity:0.5;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;';
    handle.textContent = `@${user.username}`;

    info.appendChild(displayName);
    info.appendChild(handle);
    item.appendChild(avatar);
    item.appendChild(info);

    return item;
  }

  /**
   * Render loading state.
   */
  renderLoading(progress: ProgressPayload | null): HTMLElement {
    const container = document.createElement('div');
    container.style.cssText = 'display:flex;flex-direction:column;align-items:center;padding:32px 16px;gap:12px;';

    const spinner = document.createElement('div');
    spinner.style.cssText = 'width:24px;height:24px;border:3px solid rgba(255,255,255,0.2);border-top-color:rgb(29,155,240);border-radius:50%;animation:xnf-spin 0.8s linear infinite;';

    // Inject keyframes if not already there
    if (!document.getElementById('xnf-spinner-style')) {
      const style = document.createElement('style');
      style.id = 'xnf-spinner-style';
      style.textContent = '@keyframes xnf-spin { to { transform: rotate(360deg); } }';
      document.head.appendChild(style);
    }

    const text = document.createElement('p');
    text.style.cssText = 'font-size:14px;opacity:0.6;margin:0;';
    text.textContent = progress ? formatProgress(progress) : '正在初始化，获取认证信息...';

    container.appendChild(spinner);
    container.appendChild(text);
    return container;
  }

  /**
   * Render error state.
   */
  renderError(error: ErrorPayload): HTMLElement {
    const container = document.createElement('div');
    container.style.cssText = 'display:flex;flex-direction:column;align-items:center;padding:32px 16px;gap:12px;text-align:center;';

    const message = document.createElement('p');
    message.style.cssText = 'font-size:14px;opacity:0.7;margin:0;';
    message.textContent = renderErrorMessage(error);

    container.appendChild(message);

    const retryBtn = document.createElement('button');
    retryBtn.style.cssText = 'background-color:rgb(29,155,240);color:#fff;border:none;border-radius:9999px;padding:8px 16px;font-size:14px;font-weight:700;cursor:pointer;';

    if (error.retryCount >= error.maxRetries) {
      retryBtn.textContent = '请稍后再试';
      retryBtn.disabled = true;
      retryBtn.style.opacity = '0.5';
      retryBtn.style.cursor = 'not-allowed';
    } else {
      retryBtn.textContent = '重试';
      retryBtn.addEventListener('click', () => this.onRetryClick?.());
    }

    container.appendChild(retryBtn);
    return container;
  }

  /**
   * Render empty state.
   */
  renderEmpty(): HTMLElement {
    const container = document.createElement('div');
    container.style.cssText = 'display:flex;align-items:center;justify-content:center;padding:32px 16px;text-align:center;';

    const message = document.createElement('p');
    message.style.cssText = 'font-size:14px;opacity:0.6;margin:0;';
    message.textContent = '所有关注的用户都已回关';

    container.appendChild(message);
    return container;
  }
}
