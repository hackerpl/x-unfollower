import {
  Message,
  MessageType,
  ProgressPayload,
  CompletePayload,
  ErrorPayload,
} from '../shared/messages';
import { MESSAGE_RETRY_DELAY_MS, MAX_RETRIES } from '../shared/constants';

/**
 * Callback type for handling START_FETCH requests from content scripts.
 * Receives the sender tab ID so the orchestrator knows where to send responses.
 */
export type StartFetchHandler = (tabId: number) => void;

/**
 * MessageHub manages communication between Background Script and Content Scripts.
 * It listens for incoming messages (START_FETCH) and provides methods to send
 * progress, completion, and error messages back to content scripts.
 * Failed message sends are automatically retried after MESSAGE_RETRY_DELAY_MS (5s),
 * up to MAX_RETRIES (3) times.
 */
export class MessageHub {
  private onStartFetch: StartFetchHandler | null = null;

  constructor(handler?: StartFetchHandler) {
    if (handler) {
      this.onStartFetch = handler;
    }
    this.setupListener();
  }

  /**
   * Set or update the START_FETCH handler callback.
   */
  setStartFetchHandler(handler: StartFetchHandler): void {
    this.onStartFetch = handler;
  }

  /**
   * Send a FETCH_PROGRESS message to the specified tab.
   */
  async sendProgress(tabId: number, payload: ProgressPayload): Promise<void> {
    const message: Message = {
      type: MessageType.FETCH_PROGRESS,
      payload,
    };
    await this.sendMessageWithRetry(tabId, message);
  }

  /**
   * Send a FETCH_COMPLETE message to the specified tab.
   */
  async sendComplete(tabId: number, payload: CompletePayload): Promise<void> {
    const message: Message = {
      type: MessageType.FETCH_COMPLETE,
      payload,
    };
    await this.sendMessageWithRetry(tabId, message);
  }

  /**
   * Send a FETCH_ERROR message to the specified tab.
   */
  async sendError(tabId: number, payload: ErrorPayload): Promise<void> {
    const message: Message = {
      type: MessageType.FETCH_ERROR,
      payload,
    };
    await this.sendMessageWithRetry(tabId, message);
  }

  /**
   * Send an AUTH_REQUIRED message to the specified tab.
   */
  async sendAuthRequired(tabId: number): Promise<void> {
    const message: Message = {
      type: MessageType.AUTH_REQUIRED,
      payload: null,
    };
    await this.sendMessageWithRetry(tabId, message);
  }

  /**
   * Send an AUTH_EXPIRED message to the specified tab.
   */
  async sendAuthExpired(tabId: number): Promise<void> {
    const message: Message = {
      type: MessageType.AUTH_EXPIRED,
      payload: null,
    };
    await this.sendMessageWithRetry(tabId, message);
  }

  /**
   * Remove the message listener. Call when cleaning up.
   */
  destroy(): void {
    chrome.runtime.onMessage.removeListener(this.messageListener);
  }

  /**
   * Bound message listener reference for proper removal.
   */
  private messageListener = (
    message: Message,
    sender: chrome.runtime.MessageSender,
    _sendResponse: (response?: unknown) => void
  ): void => {
    if (message.type === MessageType.START_FETCH) {
      const tabId = sender.tab?.id;
      if (tabId != null && this.onStartFetch) {
        this.onStartFetch(tabId);
      }
    }
  };

  /**
   * Set up the chrome.runtime.onMessage listener.
   */
  private setupListener(): void {
    chrome.runtime.onMessage.addListener(this.messageListener);
  }

  /**
   * Send a message to a tab with automatic retry on failure.
   * Retries up to MAX_RETRIES times with MESSAGE_RETRY_DELAY_MS delay between attempts.
   */
  private async sendMessageWithRetry(
    tabId: number,
    message: Message,
    attempt: number = 0
  ): Promise<void> {
    try {
      await chrome.tabs.sendMessage(tabId, message);
    } catch (error) {
      if (attempt < MAX_RETRIES) {
        await this.delay(MESSAGE_RETRY_DELAY_MS);
        await this.sendMessageWithRetry(tabId, message, attempt + 1);
      } else {
        // All retries exhausted, throw to let caller handle
        throw error;
      }
    }
  }

  /**
   * Utility to wait for a specified duration.
   */
  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
