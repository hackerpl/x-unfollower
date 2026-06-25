// Grok AI client for analyzing X user content via X's built-in Grok API

import type { AuthCredentials } from '../shared/types';

/**
 * Result of a Grok AI analysis request
 */
export interface GrokAnalysisResult {
  success: boolean;
  content: string | null; // Formatted analysis text
  error?: string;
}

/**
 * Grok API endpoints
 */
const GROK_CREATE_CONVERSATION_URL = 'https://x.com/i/api/graphql/6cmfJY3d7EPWuCSXWrkOFg/CreateGrokConversation';
const GROK_ADD_RESPONSE_URL = 'https://api.x.com/2/grok/add_response.json';

/**
 * Generate a random UUID v4 hex string (no dashes) for x-client-uuid header
 */
function generateClientUuid(): string {
  const hex = '0123456789abcdef';
  let uuid = '';
  for (let i = 0; i < 32; i++) {
    uuid += hex[Math.floor(Math.random() * 16)];
  }
  return uuid;
}

/**
 * GrokClient handles communication with X's built-in Grok API
 * to analyze user content with strict rate limiting.
 */
export class GrokClient {
  // Timestamp of the last API call for rate limiting
  private lastCallTime: number = 0;

  // Minimum interval between calls in milliseconds (15 seconds)
  private readonly MIN_INTERVAL = 15000;

  // Client UUID for Grok API requests
  private clientUuid: string = generateClientUuid();

  /**
   * Analyze a user's content using Grok AI.
   * Enforces rate limiting (max 4 calls per minute, at least 15s between calls).
   * Returns failure status on error without throwing.
   */
  async analyzeUser(
    userScreenName: string,
    credentials: AuthCredentials
  ): Promise<GrokAnalysisResult> {
    try {
      // Enforce rate limit before making the request
      await this.waitForRateLimit();

      // Step 1: Create a new conversation
      const conversationId = await this.createConversation(credentials);
      if (!conversationId) {
        return {
          success: false,
          content: null,
          error: 'Failed to create Grok conversation',
        };
      }

      // Step 2: Send analysis prompt
      const prompt = this.buildPrompt(userScreenName);

      const payload = {
        responses: [
          {
            message: prompt,
            sender: 1,
          },
        ],
        systemPromptName: '',
        grokModelOptionId: 'grok-3',
        conversationId,
        returnSearchResults: true,
        returnCitations: false,
        promptMetadata: {
          promptSource: 'NATURAL',
          action: 'INPUT',
        },
        imageGenerationCount: 0,
        requestFeatures: {
          eagerTweets: false,
          serverHistory: false,
        },
      };

      const response = await fetch(GROK_ADD_RESPONSE_URL, {
        method: 'POST',
        headers: this.buildHeaders(credentials),
        credentials: 'include',
        body: JSON.stringify(payload),
      });

      // Update last call time after request (even if failed, for rate limiting)
      this.lastCallTime = Date.now();

      if (!response.ok) {
        let responseBody = '';
        try {
          responseBody = await response.text();
        } catch { /* ignore */ }
        console.error(
          `[Grok] API error for @${userScreenName}:`,
          `\n  Status: ${response.status} ${response.statusText}`,
          `\n  URL: ${GROK_ADD_RESPONSE_URL}`,
          `\n  Response body: ${responseBody.substring(0, 500)}`,
        );
        return {
          success: false,
          content: null,
          error: `Grok API returned status ${response.status}: ${responseBody.substring(0, 200)}`,
        };
      }

      // Parse the streaming response
      const analysisText = await this.parseStreamingResponse(response);

      if (!analysisText) {
        console.warn(`[Grok] Empty/unparseable response for @${userScreenName}`);
        return {
          success: false,
          content: null,
          error: 'Empty response from Grok API',
        };
      }

      console.log(`[Grok] Successfully analyzed @${userScreenName}: ${analysisText.substring(0, 60)}...`);

      return {
        success: true,
        content: analysisText,
      };
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error during Grok analysis';
      console.error(`[Grok] Exception for @${userScreenName}:`, error);
      return {
        success: false,
        content: null,
        error: errorMessage,
      };
    }
  }

  /**
   * Create a new Grok conversation and return the conversation ID.
   */
  private async createConversation(credentials: AuthCredentials): Promise<string | null> {
    try {
      const queryId = '6cmfJY3d7EPWuCSXWrkOFg';
      const payload = {
        variables: {},
        queryId,
      };

      const response = await fetch(GROK_CREATE_CONVERSATION_URL, {
        method: 'POST',
        headers: this.buildHeaders(credentials),
        credentials: 'include',
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        console.error(`[Grok] CreateConversation failed: HTTP ${response.status}`);
        return null;
      }

      const json = await response.json();
      const conversationId = json?.data?.create_grok_conversation?.conversation_id;

      if (!conversationId) {
        console.error('[Grok] CreateConversation: no conversation_id in response', json);
        return null;
      }

      return conversationId;
    } catch (error) {
      console.error('[Grok] CreateConversation exception:', error);
      return null;
    }
  }

  /**
   * Build standard headers for Grok API requests.
   */
  private buildHeaders(credentials: AuthCredentials): Record<string, string> {
    return {
      Authorization: `Bearer ${credentials.bearerToken}`,
      'Content-Type': 'application/json',
      'x-csrf-token': credentials.csrfToken,
      'x-twitter-auth-type': 'OAuth2Session',
      'x-twitter-active-user': 'yes',
      'x-client-uuid': this.clientUuid,
    };
  }

  /**
   * Build the analysis prompt for a given user screen name.
   * Asks Grok to analyze the user's posting content in Chinese within 100 characters.
   */
  private buildPrompt(userScreenName: string): string {
    return `请分析 X 用户 @${userScreenName} 的发布内容。请简要说明：1. 主要发布领域 2. 内容质量 3. 值得关注的理由。请用中文回答，控制在100字以内。`;
  }

  /**
   * Wait for rate limit cooldown if necessary.
   * Ensures at least MIN_INTERVAL (15s) between consecutive calls.
   */
  async waitForRateLimit(): Promise<void> {
    const now = Date.now();
    const elapsed = now - this.lastCallTime;

    if (this.lastCallTime > 0 && elapsed < this.MIN_INTERVAL) {
      const waitTime = this.MIN_INTERVAL - elapsed;
      await this.delay(waitTime);
    }
  }

  /**
   * Parse the Grok API streaming response (newline-delimited JSON).
   * Extracts the final message text from the streamed data.
   */
  private async parseStreamingResponse(response: Response): Promise<string | null> {
    const text = await response.text();

    if (!text) {
      return null;
    }

    // The Grok API returns newline-delimited JSON lines
    // Concatenate all message tokens to form the complete response
    const lines = text.split('\n').filter((line) => line.trim().length > 0);
    let fullMessage = '';

    for (const line of lines) {
      try {
        const parsed = JSON.parse(line);

        // Collect message tokens (streamed partial messages)
        if (parsed?.result?.message) {
          fullMessage = parsed.result.message;
        }
      } catch {
        // Skip non-JSON lines
        continue;
      }
    }

    return fullMessage || null;
  }

  /**
   * Async delay utility.
   */
  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
