import type { BrowserContext } from 'playwright';
import type { TheaterEntry } from '../master/loader.js';
import { getEnabledTheaters } from '../master/loader.js';
import {
  type ChainScraper,
  type ChainScrapedShowtime,
  type TheaterScraper,
  type ScrapeOptions,
  type ScrapeError,
  type ChainShowtime,
  type OnProgressCallback,
  type Result,
  ok,
  err,
} from './types.js';
import {
  BrowserManager,
  detectPremiumFormat,
  delay,
  reportProgress,
  formatDateISO,
  formatDateMMDD,
  isTargetMovie,
  REQUEST_DELAY_MS,
} from './base.js';

export const cinemaSunshineChainScraper: ChainScraper = {
  chainId: 'cinema_sunshine',

  async scrapeTheater(
    ctx: BrowserContext,
    entry: TheaterEntry,
    targetDate: Date,
    movieTitles: string[],
    onProgress?: OnProgressCallback
  ): Promise<ChainScrapedShowtime[]> {
    const url = `https://www.cinemasunshine.co.jp/theater/${entry.code}/`;
    const targetDateStr = formatDateMMDD(targetDate);
    const datePrefix = formatDateISO(targetDate);
    const page = await ctx.newPage();

    try {
      reportProgress(onProgress, {
        stage: 'navigating',
        current: 0,
        total: 1,
        message: `${entry.name}のスケジュールページにアクセス中...`,
      });

      const response = await page.goto(url, {
        waitUntil: 'domcontentloaded',
        timeout: 30000,
      });

      if (!response || !response.ok()) {
        return [];
      }

      await page.waitForSelector('.schedule-swiper__item', {
        timeout: 15000,
      });

      const dateClicked = await page.evaluate((targetDateStr: string) => {
        const dateItems = document.querySelectorAll('.schedule-swiper__item');
        let clicked = false;
        dateItems.forEach((item) => {
          if (clicked) return;
          const dayEl = item.querySelector('.day');
          if (dayEl && dayEl.textContent?.trim() === targetDateStr) {
            (item as HTMLElement).click();
            clicked = true;
          }
        });
        return clicked;
      }, targetDateStr);

      if (!dateClicked) {
        return [];
      }

      await delay(1500);
      await page.waitForSelector('.content-item', { timeout: 10000 }).catch(() => {});

      reportProgress(onProgress, {
        stage: 'extracting',
        current: 0,
        total: 1,
        message: `${entry.name}の上映スケジュールを抽出中...`,
      });

      interface RawShowtime {
        movieTitle: string;
        theater: string;
        startTime: string;
        endTime: string;
        runtimeMinutes: number;
        screenInfo: string;
        titleInfo: string;
      }
      const showtimes: RawShowtime[] = await page.evaluate(
        (args: { theaterName: string; datePrefix: string }) => {
          const results: Array<{
            movieTitle: string;
            theater: string;
            startTime: string;
            endTime: string;
            runtimeMinutes: number;
            screenInfo: string;
            titleInfo: string;
          }> = [];

          const contentItems = document.querySelectorAll('#tab_title_content .content-item');

          contentItems.forEach((item: Element) => {
            const titleEl = item.querySelector('.title');
            const rawTitle = titleEl?.textContent?.trim() ?? '';
            if (!rawTitle) return;

            const durationEl = item.querySelector('.s_time');
            const durationText = durationEl?.textContent?.trim() ?? '';
            const durationMatch = durationText.match(/(\d+)分/);
            const runtimeMinutes = durationMatch?.[1]
              ? parseInt(durationMatch[1], 10)
              : 120;

            const scheduleItems = item.querySelectorAll('.schedule-item');

            scheduleItems.forEach((scheduleItem: Element) => {
              const timeEl = scheduleItem.querySelector('.time');
              if (!timeEl) return;

              const startSpan = timeEl.querySelector('span');
              const startText = startSpan?.textContent?.trim() ?? '';
              const startMatch = startText.match(/(\d{1,2}):(\d{2})/);
              if (!startMatch?.[1] || !startMatch?.[2]) return;

              const startHour = startMatch[1].padStart(2, '0');
              const startMinute = startMatch[2];

              const timeText = timeEl.textContent?.trim() ?? '';
              const endMatch = timeText.match(/[〜～]\s*(\d{1,2}):(\d{2})/);
              let endTime = '';
              if (endMatch?.[1] && endMatch?.[2]) {
                endTime = `${endMatch[1].padStart(2, '0')}:${endMatch[2]}`;
              }

              const infoEl = scheduleItem.querySelector('.info');
              const screenInfo = infoEl?.textContent?.trim() ?? '';

              const startTimeStr = `${startHour}:${startMinute}`;
              const existing = results.find(
                (r) => r.movieTitle === rawTitle && r.startTime.includes(startTimeStr)
              );
              if (!existing) {
                results.push({
                  movieTitle: rawTitle,
                  theater: args.theaterName,
                  startTime: `${args.datePrefix}T${startHour}:${startMinute}:00`,
                  endTime: endTime ? `${args.datePrefix}T${endTime}:00` : '',
                  runtimeMinutes,
                  screenInfo,
                  titleInfo: rawTitle,
                });
              }
            });
          });

          return results;
        },
        { theaterName: entry.name, datePrefix }
      );

      return showtimes
        .filter((s) => isTargetMovie(s.movieTitle, movieTitles))
        .map((s) => {
          const combinedText = `${s.screenInfo} ${s.titleInfo}`;
          let endTime = s.endTime;
          if (!endTime) {
            const start = new Date(s.startTime);
            const end = new Date(start.getTime() + s.runtimeMinutes * 60 * 1000);
            endTime = end.toISOString();
          }
          return {
            movieTitle: s.movieTitle,
            theater: s.theater,
            theaterChain: 'cinema_sunshine',
            startTime: s.startTime,
            endTime,
            runtimeMinutes: s.runtimeMinutes,
            format: detectPremiumFormat(combinedText),
          };
        });
    } finally {
      await page.close();
    }
  },
};

export async function createCinemaSunshineScraper(): Promise<TheaterScraper> {
  const browserManager = new BrowserManager();
  const theaters = getEnabledTheaters('cinema_sunshine');

  const isSupported = (theaterName: string): boolean => {
    return (
      theaterName.includes('シネマサンシャイン') ||
      theaterName.includes('CINEMA SUNSHINE') ||
      theaterName.includes('グランドシネマサンシャイン') ||
      theaterName.includes('ディノスシネマズ') ||
      theaterName.includes('サツゲキ') ||
      theaters.some((t) => t.name === theaterName)
    );
  };

  return {
    theaterChain: 'cinema_sunshine',

    async scrapeSchedule(
      options: ScrapeOptions,
      onProgress?: OnProgressCallback
    ): Promise<Result<ChainShowtime[], ScrapeError>> {
      const { movieTitles, date, theaterNames } = options;

      reportProgress(onProgress, {
        stage: 'initializing',
        current: 0,
        total: 1,
        message: 'ブラウザを起動中...',
      });

      const ctx = await browserManager.ensureContext();

      try {
        let targetTheaters: TheaterEntry[];
        if (theaterNames && theaterNames.length > 0) {
          targetTheaters = theaters.filter((t) =>
            theaterNames.some((name: string) => t.name.includes(name) || name.includes(t.name))
          );
        } else {
          targetTheaters = theaters;
        }

        if (targetTheaters.length === 0) {
          return err({
            type: 'no_theaters_found',
            message: 'シネマサンシャインの対象映画館が見つかりませんでした',
          });
        }

        const allShowtimes: ChainShowtime[] = [];

        for (let i = 0; i < targetTheaters.length; i++) {
          const entry = targetTheaters[i];
          if (!entry) continue;

          reportProgress(onProgress, {
            stage: 'scraping',
            current: i + 1,
            total: targetTheaters.length,
            message: `${entry.name}のスケジュールを取得中... (${i + 1}/${targetTheaters.length})`,
          });

          const scraped = await cinemaSunshineChainScraper.scrapeTheater(
            ctx, entry, date, movieTitles, onProgress
          );

          for (const s of scraped) {
            allShowtimes.push({
              movieTitle: s.movieTitle,
              theater: s.theater,
              theaterChain: s.theaterChain,
              startTime: new Date(s.startTime),
              endTime: new Date(s.endTime),
              format: s.format,
            });
          }

          if (i < targetTheaters.length - 1) {
            await delay(REQUEST_DELAY_MS);
          }
        }

        reportProgress(onProgress, {
          stage: 'complete',
          current: targetTheaters.length,
          total: targetTheaters.length,
          message: `スクレイピング完了: ${allShowtimes.length}件の上映情報を取得`,
        });

        return ok(allShowtimes);
      } catch (error) {
        if (error instanceof Error) {
          return err({
            type: 'navigation_failed',
            url: 'https://www.cinemasunshine.co.jp/',
            reason: error.message,
          });
        }
        return err({
          type: 'navigation_failed',
          url: 'https://www.cinemasunshine.co.jp/',
          reason: 'Unknown error',
        });
      }
    },

    isSupported,

    async close(): Promise<void> {
      await browserManager.close();
    },
  };
}
