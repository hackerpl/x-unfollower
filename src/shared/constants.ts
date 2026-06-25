// Retry policy and timing constants

/** Maximum number of retries for failed requests */
export const MAX_RETRIES = 3;

/** Wait time in ms when rate limited (default if no rate-limit-reset header) */
export const RATE_LIMIT_WAIT_MS = 60000;

/** Delay in ms before retrying a failed message send */
export const MESSAGE_RETRY_DELAY_MS = 5000;

/** Timeout in ms for a single API request */
export const REQUEST_TIMEOUT_MS = 30000;

/** Minimum delay in ms between pagination requests */
export const PAGINATION_DELAY_MS = 1000;
