// Theme detection module for X (Twitter) page
// Detects current theme mode (light/dark/dim) and monitors changes via MutationObserver

/**
 * Theme information extracted from X page
 */
export interface ThemeInfo {
  mode: 'light' | 'dark' | 'dim';
  backgroundColor: string;
  textColor: string;
  borderColor: string;
  accentColor: string;
}

/**
 * Default theme color palettes for X page modes
 */
const THEME_COLORS: Record<ThemeInfo['mode'], Omit<ThemeInfo, 'mode'>> = {
  light: {
    backgroundColor: '#ffffff',
    textColor: '#0f1419',
    borderColor: '#eff3f4',
    accentColor: '#1d9bf0',
  },
  dark: {
    backgroundColor: '#000000',
    textColor: '#e7e9ea',
    borderColor: '#2f3336',
    accentColor: '#1d9bf0',
  },
  dim: {
    backgroundColor: '#15202b',
    textColor: '#f7f9f9',
    borderColor: '#38444d',
    accentColor: '#1d9bf0',
  },
};

/**
 * ThemeDetector monitors the X page DOM for theme mode changes.
 * X uses a `data-color-mode` attribute on <html> or background-color
 * on <body> to indicate the active theme.
 */
export class ThemeDetector {
  private observer: MutationObserver | null = null;
  private callback: ((theme: ThemeInfo) => void) | null = null;
  private currentTheme: ThemeInfo | null = null;

  /**
   * Detect current X page theme by inspecting DOM attributes and computed styles.
   */
  detectTheme(): ThemeInfo {
    const mode = this.detectMode();
    const colors = this.extractColors(mode);
    const theme: ThemeInfo = { mode, ...colors };
    this.currentTheme = theme;
    return theme;
  }

  /**
   * Start observing theme changes via MutationObserver.
   * Calls the provided callback whenever the theme changes.
   */
  observeThemeChanges(callback: (theme: ThemeInfo) => void): void {
    this.callback = callback;
    // Detect initial theme
    this.currentTheme = this.detectTheme();

    this.observer = new MutationObserver(() => {
      const newTheme = this.detectTheme();
      if (this.currentTheme && newTheme.mode !== this.currentTheme.mode) {
        this.currentTheme = newTheme;
        this.callback?.(newTheme);
      }
    });

    // Observe <html> element for attribute changes (data-color-mode)
    const htmlEl = document.documentElement;
    this.observer.observe(htmlEl, {
      attributes: true,
      attributeFilter: ['data-color-mode', 'style', 'class'],
    });

    // Observe <body> for style and data attribute changes
    const bodyEl = document.body;
    if (bodyEl) {
      this.observer.observe(bodyEl, {
        attributes: true,
        attributeFilter: ['style', 'data-color-mode', 'class'],
      });
    }
  }

  /**
   * Stop observing theme changes and clean up resources.
   */
  stopObserving(): void {
    if (this.observer) {
      this.observer.disconnect();
      this.observer = null;
    }
    this.callback = null;
  }

  /**
   * Detect the current theme mode from DOM attributes and styles.
   * X uses a background color on body to differentiate themes:
   * - light: white (#ffffff)
   * - dark: black (#000000)
   * - dim: dark blue (#15202b)
   */
  private detectMode(): ThemeInfo['mode'] {
    // Strategy 1: Check data-color-mode attribute on <html> or <body>
    const htmlAttr = document.documentElement.getAttribute('data-color-mode');
    if (htmlAttr) {
      return this.parseColorMode(htmlAttr);
    }

    const bodyAttr = document.body?.getAttribute('data-color-mode');
    if (bodyAttr) {
      return this.parseColorMode(bodyAttr);
    }

    // Strategy 2: Check computed background color of <body>
    if (document.body) {
      const bgColor = this.getBackgroundColor();
      return this.inferModeFromBackground(bgColor);
    }

    // Default to light if nothing detected
    return 'light';
  }

  /**
   * Parse a data-color-mode attribute value into a ThemeInfo mode.
   */
  private parseColorMode(value: string): ThemeInfo['mode'] {
    const normalized = value.toLowerCase().trim();
    if (normalized === 'dark') return 'dark';
    if (normalized === 'dim') return 'dim';
    return 'light';
  }

  /**
   * Get the background color from body style attribute or computed style.
   */
  private getBackgroundColor(): string {
    // Try inline style first
    const inlineStyle = document.body.style.backgroundColor;
    if (inlineStyle) {
      return inlineStyle;
    }

    // Fall back to computed style
    const computed = window.getComputedStyle(document.body);
    return computed.backgroundColor || '';
  }

  /**
   * Infer theme mode from background color value.
   */
  private inferModeFromBackground(bgColor: string): ThemeInfo['mode'] {
    if (!bgColor) return 'light';

    const normalized = bgColor.toLowerCase().replace(/\s/g, '');

    // Transparent or empty means no explicit background — default to light
    if (
      normalized === 'transparent' ||
      normalized === 'rgba(0,0,0,0)' ||
      normalized === ''
    ) {
      return 'light';
    }

    // Check for dark mode (black background)
    if (
      normalized === '#000000' ||
      normalized === '#000' ||
      normalized === 'rgb(0,0,0)'
    ) {
      return 'dark';
    }

    // Check for dim mode (dark blue background)
    if (
      normalized === '#15202b' ||
      normalized === 'rgb(21,32,43)'
    ) {
      return 'dim';
    }

    // Check for light mode (white background)
    if (
      normalized === '#ffffff' ||
      normalized === '#fff' ||
      normalized === 'rgb(255,255,255)'
    ) {
      return 'light';
    }

    // Heuristic: compute luminance from rgb
    const rgb = this.parseRgb(bgColor);
    if (rgb) {
      const luminance = (0.299 * rgb.r + 0.587 * rgb.g + 0.114 * rgb.b) / 255;
      if (luminance < 0.1) return 'dark';
      if (luminance < 0.3) return 'dim';
      return 'light';
    }

    return 'light';
  }

  /**
   * Parse an rgb/rgba color string into r, g, b components.
   */
  private parseRgb(color: string): { r: number; g: number; b: number } | null {
    const match = color.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
    if (match) {
      return {
        r: parseInt(match[1], 10),
        g: parseInt(match[2], 10),
        b: parseInt(match[3], 10),
      };
    }
    return null;
  }

  /**
   * Extract theme colors based on the detected mode.
   * Uses default palettes and attempts to read actual computed values from page.
   */
  private extractColors(mode: ThemeInfo['mode']): Omit<ThemeInfo, 'mode'> {
    const defaults = THEME_COLORS[mode];

    // Attempt to read actual page colors from computed styles
    if (document.body) {
      const computed = window.getComputedStyle(document.body);
      const bgColor = computed.backgroundColor;
      const textColor = computed.color;

      if (bgColor && bgColor !== 'rgba(0, 0, 0, 0)') {
        defaults.backgroundColor = bgColor;
      }
      if (textColor) {
        defaults.textColor = textColor;
      }
    }

    return { ...defaults };
  }
}
