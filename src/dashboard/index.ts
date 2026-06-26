// Dashboard entry point
// Initializes the Dashboard page by detecting locale, resolving userId from twid cookie,
// and instantiating the DashboardManager to orchestrate the full data flow.

import { detectDashboardLocale, getDashboardStrings } from '../shared/dashboard-i18n';
import { DashboardManager } from './dashboard-manager';

/**
 * Extract the current user's ID from the X.com twid cookie.
 * The twid cookie value is URL-encoded and contains the user ID in the format "u=<digits>".
 * Returns null if the cookie is unavailable or cannot be parsed.
 */
async function getCurrentUserId(): Promise<string | null> {
  try {
    const cookie = await chrome.cookies.get({ url: 'https://x.com', name: 'twid' });
    if (cookie && cookie.value) {
      const decoded = decodeURIComponent(cookie.value);
      const match = decoded.match(/u=(\d+)/);
      if (match) return match[1];
    }
  } catch {
    // Cookie access may fail if permissions are missing or context is invalid
  }
  return null;
}

/**
 * Main initialization routine for the Dashboard page.
 * 1. Detect locale and set document title
 * 2. Resolve root element
 * 3. Retrieve userId from twid cookie
 * 4. Instantiate DashboardManager or show login prompt
 */
async function init(): Promise<void> {
  // Detect locale and load i18n strings
  const locale = detectDashboardLocale();
  const strings = getDashboardStrings(locale);

  // Set document title based on detected locale
  document.title = strings.dashboardTitle;

  // Get the root container element
  const root = document.getElementById('app');
  if (!root) {
    console.error('[Dashboard] Root element #app not found');
    return;
  }

  // Retrieve the current user's ID from the twid cookie
  const userId = await getCurrentUserId();

  if (!userId) {
    // No userId found: show login prompt
    root.innerHTML = `
      <div style="display:flex;align-items:center;justify-content:center;height:80vh;flex-direction:column;color:#00ffd5;font-family:'JetBrains Mono',monospace;">
        <p style="font-size:18px;margin-bottom:12px;">${strings.authExpired}</p>
        <p style="font-size:14px;color:rgba(0,255,213,0.5);">${strings.loginPrompt}</p>
      </div>
    `;
    return;
  }

  // Instantiate DashboardManager — it handles store, renderer, message listener, and Grok analysis internally
  new DashboardManager(root, locale, userId);
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    init();
  });
} else {
  init();
}
