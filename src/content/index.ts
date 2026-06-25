// Content Script entry point
// Continuously monitors the page and injects our card into the X sidebar.
// Handles SPA navigation by re-injecting when our element is removed.

import { ThemeDetector } from './theme-detector';
import { UIRenderer } from './ui-renderer';
import { SidebarManager } from './sidebar-manager';

/** Unique ID to prevent duplicate injection */
const SIDEBAR_HOST_ID = 'x-nf-checker-sidebar';

/**
 * Common class parts shared between light and dark mode sidebar cards.
 * Light: css-175oi2r r-14lw9ot r-15ma8z r-1867qdf r-1phboty r-rs99b7 r-1ifxtd0 r-1udh08x
 * Dark:  css-175oi2r r-16331v6 r-dgm4ly r-1867qdf r-1phboty r-rs99b7 r-1ifxtd0 r-1udh08x
 * We match on the stable classes shared by both.
 */
const CARD_COMMON_CLASSES = 'css-175oi2r r-1867qdf r-1phboty r-rs99b7 r-1ifxtd0 r-1udh08x';

/** Interval (ms) to check if our card is still in the DOM */
const PRESENCE_CHECK_INTERVAL = 2000;

/** Current sidebar manager instance (if active) */
let currentManager: SidebarManager | null = null;

/**
 * Find all sidebar cards matching the known class pattern (works in light and dark mode).
 * Returns the last one found (we will insert after it).
 */
function findLastSidebarCard(): HTMLElement | null {
  const selector = '.' + CARD_COMMON_CLASSES.split(' ').join('.');
  const allCards = document.querySelectorAll(selector);
  if (allCards.length === 0) return null;
  // Filter out our own card
  const filtered = Array.from(allCards).filter(el => el.id !== SIDEBAR_HOST_ID);
  if (filtered.length === 0) return null;
  return filtered[filtered.length - 1] as HTMLElement;
}

/**
 * Try to inject our card. Returns true if successful, false otherwise.
 */
function tryInject(): boolean {
  // Already injected and present
  const existing = document.getElementById(SIDEBAR_HOST_ID);
  if (existing && document.contains(existing)) {
    return true;
  }

  // Find the last sidebar card
  const lastCard = findLastSidebarCard();
  if (!lastCard) return false;

  const parent = lastCard.parentElement;
  if (!parent) return false;

  // Detect theme
  const themeDetector = new ThemeDetector();
  const initialTheme = themeDetector.detectTheme();

  // Create our card container — copy the exact class from the reference card
  // so it matches the current theme (light or dark)
  const ourCard = document.createElement('div');
  ourCard.id = SIDEBAR_HOST_ID;
  ourCard.className = lastCard.className;

  // Insert after the last card
  if (lastCard.nextSibling) {
    parent.insertBefore(ourCard, lastCard.nextSibling);
  } else {
    parent.appendChild(ourCard);
  }

  // Clean up previous manager if any
  if (currentManager) {
    currentManager.destroy();
    currentManager = null;
  }

  // Create renderer and manager
  const renderer = new UIRenderer(initialTheme, ourCard);
  const sidebarManager = new SidebarManager(renderer, themeDetector);
  currentManager = sidebarManager;

  // Initialize asynchronously (loads cache, auto-fetches if needed)
  sidebarManager.initialize();

  return true;
}

/**
 * Persistent loop: check if our card exists, re-inject if removed.
 * This handles X's SPA navigation which rebuilds the sidebar DOM.
 */
function startPresenceMonitor(): void {
  setInterval(() => {
    const existing = document.getElementById(SIDEBAR_HOST_ID);
    if (!existing || !document.contains(existing)) {
      // Our card was removed (SPA navigation), try to re-inject
      tryInject();
    }
  }, PRESENCE_CHECK_INTERVAL);
}

// Initial injection attempt + start monitoring
function main(): void {
  // Try immediately
  if (!tryInject()) {
    // If sidebar cards aren't ready yet, retry a few times
    let attempts = 0;
    const retryInterval = setInterval(() => {
      attempts++;
      if (tryInject() || attempts >= 15) {
        clearInterval(retryInterval);
      }
    }, 1000);
  }

  // Start persistent presence monitor
  startPresenceMonitor();
}

main();
