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
  formatDateYYYYMMDD,
  isTargetMovie,
  REQUEST_DELAY_MS,
} from './base.js';

export const tohoChainScraper: ChainScraper = {
  chainId: 'toho',

  async scrapeTheater(
    ctx: BrowserContext,
    entry: TheaterEntry,
    targetDate: Date,
    movieTitles: string[],
    onProgress?: OnProgressCallback
  ): Promise<ChainScrapedShowtime[]> {
    const dateStr = formatDateYYYYMMDD(targetDate);
    const url = `https://hlo.tohotheater.jp/net/schedule/${entry.code}/TNPI2000J01.do?showDay=${dateStr}`;
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

      await page.waitForSelector('.schedule-body-section-item', {
        timeout: 10000,
      }).catch(() => {});

      // TOHOサイトはSPAのため showDay パラメータが無視される場合がある。
      // 対象日付のタブをクリックして正しいスケジュールを表示する。
      const targetMonth = targetDate.getMonth() + 1;
      const targetDay = targetDate.getDate();
      const targetLabel = `${targetMonth}/${targetDay}`;
      const tabClicked = await page.evaluate((label: string) => {
        let result = 'not_found';
        const tabs = document.querySelectorAll('.schedule-tab-item');
        tabs.forEach((tab) => {
          if (result !== 'not_found') return;
          const text = tab.textContent ?? '';
          if (text.includes(label)) {
            if (tab.classList.contains('is-selected')) {
              result = 'already_selected';
              return;
            }
            const clickTarget = (tab.querySelector('.schedule-tab-dates') ?? tab) as HTMLElement;
            clickTarget.click();
            result = 'clicked';
          }
        });
        return result;
      }, targetLabel);

      if (tabClicked === 'clicked') {
        // タブクリック後、スケジュールの再描画を待つ
        await page.waitForTimeout(2000);
        await page.waitForSelector('.schedule-body-section-item', {
          timeout: 10000,
        }).catch(() => {});
      }

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
        formatText: string;
      }
      const showtimes: RawShowtime[] = await page.evaluate(
        (args: { theaterName: string; dateStr: string }) => {
          const results: Array<{
            movieTitle: string;
            theater: string;
            startTime: string;
            endTime: string;
            runtimeMinutes: number;
            formatText: string;
          }> = [];

          const theaterSections = document.querySelectorAll('section.schedule-body-section');

          theaterSections.forEach((section: Element) => {
            const sectionTitleEl = section.querySelector('.schedule-body-section-title');
            const sectionTheaterName =
              sectionTitleEl?.childNodes[0]?.textContent?.trim() ?? args.theaterName;

            const movieItems = section.querySelectorAll('.schedule-body-section-item');

            movieItems.forEach((item: Element) => {
              const titleEl = item.querySelector('h5.schedule-body-title');
              const title = titleEl?.textContent?.trim() ?? '';
              if (!title) return;

              const timeInfoEl = item.querySelector('.schedule-body-info .time');
              const timeInfoText = timeInfoEl?.textContent?.trim() ?? '';
              const runtimeMatch = timeInfoText.match(/(\d+)分/);
              const runtimeMinutes = runtimeMatch?.[1]
                ? parseInt(runtimeMatch[1], 10)
                : 120;

              const screenSections = item.querySelectorAll('section.schedule-screen');

              screenSections.forEach((screenSection: Element) => {
                const screenTitleEl = screenSection.querySelector('h5.schedule-screen-title');
                const screenName = screenTitleEl?.textContent?.trim() ?? '';

                const iconEls = screenSection.querySelectorAll('.schedule-screen-icons li');
                const iconTexts: string[] = [];
                iconEls.forEach((iconEl: Element) => {
                  iconTexts.push(iconEl.textContent?.trim() ?? '');
                });
                const formatText = `${screenName} ${iconTexts.join(' ')} ${title}`;

                const scheduleItems = screenSection.querySelectorAll('.schedule-item');

                scheduleItems.forEach((scheduleItem: Element) => {
                  const startEl = scheduleItem.querySelector('.time .start');
                  const endEl = scheduleItem.querySelector('.time .end');

                  const rawStart = startEl?.textContent?.trim() ?? '';
                  const rawEnd = endEl?.textContent?.trim() ?? '';

                  if (!rawStart) return;

                  const startMatch = rawStart.match(/^(\d{1,2}):(\d{2})$/);
                  const startTime = startMatch && startMatch[1] && startMatch[2]
                    ? `${startMatch[1].padStart(2, '0')}:${startMatch[2]}`
                    : rawStart;
                  const endMatch = rawEnd.match(/^(\d{1,2}):(\d{2})$/);
                  const endTime = endMatch && endMatch[1] && endMatch[2]
                    ? `${endMatch[1].padStart(2, '0')}:${endMatch[2]}`
                    : rawEnd;
                  const datePrefix = `${args.dateStr.slice(0, 4)}-${args.dateStr.slice(4, 6)}-${args.dateStr.slice(6, 8)}`;

                  const existing = results.find(
                    (r) =>
                      r.movieTitle === title &&
                      r.theater === sectionTheaterName &&
                      r.startTime.includes(startTime)
                  );
                  if (!existing) {
                    results.push({
                      movieTitle: title,
                      theater: sectionTheaterName,
                      startTime: `${datePrefix}T${startTime}:00`,
                      endTime: endTime ? `${datePrefix}T${endTime}:00` : '',
                      runtimeMinutes,
                      formatText,
                    });
                  }
                });
              });
            });
          });

          return results;
        },
        { theaterName: entry.name, dateStr }
      );

      return showtimes
        .filter((s) => isTargetMovie(s.movieTitle, movieTitles))
        .map((s) => {
          let endTime = s.endTime;
          if (!endTime) {
            const start = new Date(s.startTime);
            const end = new Date(start.getTime() + s.runtimeMinutes * 60 * 1000);
            endTime = end.toISOString();
          }
          return {
            movieTitle: s.movieTitle,
            theater: s.theater,
            theaterChain: 'toho',
            startTime: s.startTime,
            endTime,
            runtimeMinutes: s.runtimeMinutes,
            format: detectPremiumFormat(s.formatText),
          };
        });
    } finally {
      await page.close();
    }
  },
};

export async function createTohoScraper(): Promise<TheaterScraper> {
  const browserManager = new BrowserManager();
  const theaters = getEnabledTheaters('toho');

  const isSupported = (theaterName: string): boolean => {
    return (
      theaterName.includes('TOHO') ||
      theaterName.includes('TOHOシネマズ') ||
      theaters.some((t) => t.name === theaterName)
    );
  };

  return {
    theaterChain: 'toho',

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
            message: 'TOHOシネマズの対象映画館が見つかりませんでした',
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

          const scraped = await tohoChainScraper.scrapeTheater(
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
            url: 'https://hlo.tohotheater.jp/',
            reason: error.message,
          });
        }
        return err({
          type: 'navigation_failed',
          url: 'https://hlo.tohotheater.jp/',
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
