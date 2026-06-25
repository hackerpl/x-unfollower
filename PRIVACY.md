# Privacy Policy - X Unfollowed

**Last Updated: June 25, 2026**

## Overview

X Unfollowed is a Chrome browser extension that helps users identify accounts they follow on X (Twitter) that do not follow them back. This privacy policy explains how the extension handles user data.

## Data Collection

**X Unfollowed does NOT collect, store, or transmit any personal data to external servers.**

All data processing happens entirely within your browser. No data is sent to any third-party service, analytics platform, or remote server.

## Data Usage

The extension accesses the following data solely for its core functionality:

### Cookies (ct0, twid)
- **Purpose**: Read your X login session cookies to authenticate API requests on your behalf
- **Storage**: Never stored permanently; read on-demand when fetching data
- **Transmission**: Only sent to X (x.com) API endpoints as part of authenticated requests

### X API Data (Following/Followers lists)
- **Purpose**: Compare your following and followers lists to identify non-followers
- **Storage**: Cached locally in Chrome's extension storage (`chrome.storage.local`) to avoid repeated API calls
- **Transmission**: Never sent to any external server; stays in your browser

### Chrome Storage
- **Purpose**: Cache the last successful result for faster display on subsequent page loads
- **Storage**: Local to your browser only
- **Transmission**: Never transmitted externally

## Data Sharing

X Unfollowed does NOT share any data with third parties. The extension:

- Has no analytics or tracking
- Has no external server or backend
- Makes no network requests except to X's own API (x.com)
- Does not collect or store your X password

## Data Retention

Cached data is stored in your browser's local storage and can be cleared at any time by:
- Removing the extension
- Clearing the extension's storage via Chrome settings

## Permissions Explained

| Permission | Why it's needed |
|-----------|----------------|
| `cookies` | Read X login cookies (ct0, twid) to authenticate API requests |
| `storage` | Cache results locally for faster subsequent loads |
| `host_permissions` (x.com, api.x.com) | Make API requests to X to fetch following/followers data |

## Open Source

This extension is open source. You can review the complete source code at:
https://github.com/hackerpl/x-unfollower

## Changes to This Policy

If this privacy policy is updated, changes will be posted in the GitHub repository.

## Contact

For questions or concerns about this privacy policy, please open an issue on GitHub:
https://github.com/hackerpl/x-unfollower/issues
