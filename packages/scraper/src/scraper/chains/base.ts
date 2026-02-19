import { chromium } from 'playwright';
import type { Browser, BrowserContext } from 'playwright';
import type { ShowtimeFormat } from '@cinema-scheduler/shared';
import type { OnProgressCallback, ScrapeProgress } from './types.js';

/**
 * Premium format detection patterns.
 */
const PREMIUM_FORMAT_PATTERNS: Array<{ pattern: RegExp; format: NonNullable<ShowtimeFormat> }> = [
  { pattern: /IMAX[^レ]*レーザー|IMAXレーザー/i, format: 'IMAX_LASER' },
  { pattern: /IMAX/i, format: 'IMAX' },
  { pattern: /ドルビーシネマ|Dolby\s*Cinema/i, format: 'DOLBY_CINEMA' },
  { pattern: /ドルビーアトモス|Dolby[\s\-]*Atmos|Dolby[\s\-]*ATMOS|ＤｏｌｂｙＡＴＭＯＳ/i, format: 'DOLBY_ATMOS' },
  { pattern: /SCREEN\s*X|ＳｃｒｅｅｎＸ/i, format: 'SCREENX' },
  { pattern: /4DX/i, format: '4DX' },
  { pattern: /轟音|GOOON|GOUON/i, format: 'GOOON' },
  { pattern: /TCX|TOHO\s*CINEMAS\s*eXtra/i, format: 'TCX' },
];

export function detectPremiumFormat(text: string): ShowtimeFormat {
  for (const { pattern, format } of PREMIUM_FORMAT_PATTERNS) {
    if (pattern.test(text)) {
      return format;
    }
  }
  return null;
}

export function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function reportProgress(
  onProgress: OnProgressCallback | undefined,
  progress: ScrapeProgress
): void {
  if (onProgress) {
    onProgress(progress);
  }
}

export function formatDateYYYYMMDD(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}${month}${day}`;
}

export function formatDateISO(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function formatDateMMDD(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${month}/${day}`;
}

export function normalizeForMatch(str: string): string {
  return str
    .toLowerCase()
    .replace(/[\s・\-ー−:：]/g, '')
    .replace(/[！!？?。、,]/g, '')
    .replace(/【[^】]*】/g, '')
    .replace(/[（(][^）)]*[）)]/g, '')
    .replace(/[ａ-ｚＡ-Ｚ０-９]/g, (s) =>
      String.fromCharCode(s.charCodeAt(0) - 0xfee0)
    )
    .trim();
}

export function isTargetMovie(title: string, movieTitles: string[]): boolean {
  if (movieTitles.length === 0) return true;
  const normalizedTitle = normalizeForMatch(title);
  return movieTitles.some((target) => {
    const normalizedTarget = normalizeForMatch(target);
    return (
      normalizedTitle.includes(normalizedTarget) ||
      normalizedTarget.includes(normalizedTitle) ||
      title.includes(target) ||
      target.includes(title)
    );
  });
}

export class BrowserManager {
  private browser: Browser | null = null;
  private context: BrowserContext | null = null;

  async ensureContext(): Promise<BrowserContext> {
    if (!this.browser) {
      this.browser = await chromium.launch({ headless: true });
    }
    if (!this.context) {
      this.context = await this.browser.newContext({
        userAgent:
          'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        viewport: { width: 1280, height: 720 },
      });

      await this.context.route('**/*.{png,jpg,jpeg,gif,webp,svg,ico}', (route: { abort: () => void }) => route.abort());
      await this.context.route('**/*.{woff,woff2,ttf,eot}', (route: { abort: () => void }) => route.abort());
    }
    return this.context;
  }

  async close(): Promise<void> {
    if (this.context) {
      await this.context.close();
      this.context = null;
    }
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
    }
  }
}

export const REQUEST_DELAY_MS = 1000;
