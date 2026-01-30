import { chromium } from 'playwright';
import type { Browser, BrowserContext, Page } from 'playwright';
import { AREA_CODES } from './areas.js';
import {
  detectPremiumFormat,
  formatDateYYYYMMDD,
  calculateEndTime,
} from './parser.js';

/**
 * スクレイピング結果の上映情報
 */
export interface ScrapedShowtime {
  movieTitle: string;
  theater: string;
  area: string;
  date: string; // YYYY-MM-DD
  startTime: string; // HH:mm
  endTime: string; // HH:mm
  runtimeMinutes: number;
  format: string | null;
}

/**
 * スクレイパー設定
 */
export interface ScraperConfig {
  headless?: boolean;
  requestDelayMs?: number;
  timeout?: number;
  retryCount?: number;
}

const DEFAULT_CONFIG: Required<ScraperConfig> = {
  headless: true,
  requestDelayMs: 1000,
  timeout: 30000,
  retryCount: 2,
};

/**
 * eiga.comスクレイパークラス
 */
export class EigacomScraper {
  private browser: Browser | null = null;
  private context: BrowserContext | null = null;
  private config: Required<ScraperConfig>;

  constructor(config: ScraperConfig = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * ブラウザを初期化する
   */
  private async ensureBrowser(): Promise<BrowserContext> {
    if (!this.browser) {
      this.browser = await chromium.launch({
        headless: this.config.headless,
      });
    }
    if (!this.context) {
      this.context = await this.browser.newContext({
        userAgent:
          'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        viewport: { width: 1280, height: 720 },
      });
    }
    return this.context;
  }

  /**
   * 指定時間待機する
   */
  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * エリアコードからURLを生成する
   * 形式: 都道府県コード/エリアコード (例: 13/130301)
   */
  private getAreaUrl(areaCode: string): string {
    return `https://eiga.com/theater/${areaCode}/`;
  }

  /**
   * エリアから映画館リストを取得する
   */
  private async getTheatersInArea(
    page: Page,
    areaName: string
  ): Promise<Array<{ name: string; url: string }>> {
    const areaCode = AREA_CODES[areaName];
    if (!areaCode) {
      console.warn(`[WARN] Unknown area: ${areaName}`);
      return [];
    }

    const url = this.getAreaUrl(areaCode);
    console.log(`[DEBUG] 映画館リスト取得: ${url}`);

    try {
      await page.goto(url, {
        waitUntil: 'domcontentloaded',
        timeout: this.config.timeout,
      });

      const theaters = await page.evaluate(() => {
        const results: Array<{ name: string; url: string }> = [];

        // 映画館セクションから映画館名を抽出
        document.querySelectorAll('h2.title-xlarge a').forEach((a) => {
          const href = (a as HTMLAnchorElement).href;
          const text = a.textContent?.trim() ?? '';

          // 映画館詳細ページへのリンク
          if (href.includes('/theater/') && text.length > 2) {
            if (!results.some((r) => r.name === text)) {
              results.push({ name: text, url: href });
            }
          }
        });

        return results;
      });

      console.log(`[DEBUG] ${areaName}: ${theaters.length}件の映画館を発見`);
      return theaters;
    } catch (error) {
      console.error(`[ERROR] ${areaName} の映画館リスト取得失敗:`, error);
      return [];
    }
  }

  /**
   * 映画館の上映スケジュールをスクレイピングする
   */
  private async scrapeTheaterSchedule(
    page: Page,
    theaterUrl: string,
    theaterName: string,
    areaName: string,
    targetDate: Date
  ): Promise<ScrapedShowtime[]> {
    const dateStr = formatDateYYYYMMDD(targetDate);
    const dateISO = targetDate.toISOString().split('T')[0]!;

    try {
      await page.goto(theaterUrl, {
        waitUntil: 'domcontentloaded',
        timeout: this.config.timeout,
      });

      // 日付タブをクリック
      try {
        const dateSelector = `input[data-date="${dateStr}"], [data-date="${dateStr}"]`;
        const dateTab = await page.$(dateSelector);
        if (dateTab) {
          await dateTab.click();
          await this.delay(500);
        }
      } catch {
        // 日付タブがない場合は現在表示を使用
      }

      // 上映スケジュールを抽出
      const rawShowtimes = await page.evaluate(
        (args: { theaterName: string; areaName: string; dateStr: string; dateISO: string }) => {
          const results: Array<{
            movieTitle: string;
            theater: string;
            area: string;
            date: string;
            startTime: string;
            endTime: string;
            runtimeMinutes: number;
            formatText: string;
          }> = [];

          const titleElements = document.querySelectorAll(
            'h2.title-xlarge a[href*="/movie/"]'
          );

          titleElements.forEach((titleLink) => {
            const rawTitle = titleLink.textContent?.trim() ?? '';
            if (!rawTitle || rawTitle === '作品情報を見る') return;

            const section = titleLink.closest('section');
            if (!section) return;

            // 上映時間を抽出
            const sectionText = section.textContent ?? '';
            const runtimeMatch = sectionText.match(/(\d+)分(?:G|PG|R|[^0-9]|$)/);
            const runtimeMinutes =
              runtimeMatch && runtimeMatch[1]
                ? parseInt(runtimeMatch[1], 10)
                : 120;

            // 対象日付のセルを取得
            const dateCells = section.querySelectorAll(
              `td[data-date="${args.dateStr}"]`
            );

            dateCells.forEach((cell) => {
              // a.btn, a.ticket2 (シネコン) または span (ミニシアター) を取得
              const timeElements = cell.querySelectorAll(
                'a.btn, a.ticket2, span, a[class*="ticket"]'
              );

              timeElements.forEach((el) => {
                const text = el.textContent?.trim() ?? '';
                // p.dateタグは除外
                if (el.tagName === 'SPAN' && el.parentElement?.classList.contains('date')) return;
                const timeMatch = text.match(/^(\d{1,2}):(\d{2})/);

                if (timeMatch && timeMatch[1] && timeMatch[2]) {
                  const hour = parseInt(timeMatch[1], 10);
                  if (hour >= 6 && hour <= 23) {
                    const hourStr = timeMatch[1].padStart(2, '0');
                    const minute = timeMatch[2];
                    const startTime = `${hourStr}:${minute}`;

                    // 終了時間を抽出
                    let endTime = '';
                    const smallEl = el.querySelector('small');
                    if (smallEl) {
                      const smallText = smallEl.textContent?.trim() ?? '';
                      const endMatch = smallText.match(/～(\d{1,2}):(\d{2})/);
                      if (endMatch && endMatch[1] && endMatch[2]) {
                        endTime = `${endMatch[1].padStart(2, '0')}:${endMatch[2]}`;
                      }
                    }
                    if (!endTime) {
                      const endTimeMatch = text.match(/～(\d{1,2}):(\d{2})/);
                      if (endTimeMatch && endTimeMatch[1] && endTimeMatch[2]) {
                        endTime = `${endTimeMatch[1].padStart(2, '0')}:${endTimeMatch[2]}`;
                      }
                    }

                    // 重複チェック
                    const existing = results.find(
                      (r) =>
                        r.movieTitle === rawTitle && r.startTime === startTime
                    );
                    if (!existing) {
                      results.push({
                        movieTitle: rawTitle,
                        theater: args.theaterName,
                        area: args.areaName,
                        date: args.dateISO,
                        startTime,
                        endTime,
                        runtimeMinutes,
                        formatText: text,
                      });
                    }
                  }
                }
              });
            });
          });

          return results;
        },
        { theaterName, areaName, dateStr, dateISO }
      );

      // ScrapedShowtime に変換
      return rawShowtimes.map((s) => ({
        movieTitle: s.movieTitle,
        theater: s.theater,
        area: s.area,
        date: s.date,
        startTime: s.startTime,
        endTime: s.endTime || calculateEndTime(s.startTime, s.runtimeMinutes),
        runtimeMinutes: s.runtimeMinutes,
        format: detectPremiumFormat(s.formatText),
      }));
    } catch (error) {
      console.error(`[ERROR] ${theaterName} のスケジュール取得失敗:`, error);
      return [];
    }
  }

  /**
   * 指定エリア・日付の上映スケジュールをスクレイピングする
   */
  async scrapeArea(area: string, date: Date): Promise<ScrapedShowtime[]> {
    const ctx = await this.ensureBrowser();
    const page = await ctx.newPage();

    try {
      // 映画館リストを取得
      const theaters = await this.getTheatersInArea(page, area);
      if (theaters.length === 0) {
        console.warn(`[WARN] ${area} で映画館が見つかりませんでした`);
        return [];
      }

      const allShowtimes: ScrapedShowtime[] = [];

      for (let i = 0; i < theaters.length; i++) {
        const theater = theaters[i];
        if (!theater) continue;

        console.log(
          `[INFO] [${i + 1}/${theaters.length}] ${theater.name} をスクレイピング中...`
        );

        const showtimes = await this.scrapeTheaterSchedule(
          page,
          theater.url,
          theater.name,
          area,
          date
        );

        console.log(`[INFO] ${theater.name}: ${showtimes.length}件の上映情報`);
        allShowtimes.push(...showtimes);

        if (i < theaters.length - 1) {
          await this.delay(this.config.requestDelayMs);
        }
      }

      return allShowtimes;
    } finally {
      await page.close();
    }
  }

  /**
   * 複数エリア・複数日付のスケジュールをスクレイピングする
   */
  async scrapeMultiple(
    areas: string[],
    dates: Date[]
  ): Promise<ScrapedShowtime[]> {
    const allShowtimes: ScrapedShowtime[] = [];

    for (const area of areas) {
      for (const date of dates) {
        const dateStr = date.toISOString().split('T')[0];
        console.log(`[INFO] ${area} / ${dateStr} をスクレイピング中...`);

        const showtimes = await this.scrapeArea(area, date);
        allShowtimes.push(...showtimes);
      }
    }

    return allShowtimes;
  }

  /**
   * ブラウザを閉じる
   */
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

/**
 * スクレイパーインスタンスを作成する
 */
export function createScraper(config?: ScraperConfig): EigacomScraper {
  return new EigacomScraper(config);
}
