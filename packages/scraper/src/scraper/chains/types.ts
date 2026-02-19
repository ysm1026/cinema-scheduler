import type { ShowtimeFormat } from '@cinema-scheduler/shared';
import type { BrowserContext } from 'playwright';
import type { TheaterEntry } from '../master/loader.js';

/**
 * Result type for chain scraper operations.
 */
export type Result<T, E> = { ok: true; value: T } | { ok: false; error: E };

export function ok<T>(value: T): Result<T, never> {
  return { ok: true, value };
}

export function err<E>(error: E): Result<never, E> {
  return { ok: false, error };
}

/**
 * Scrape error types.
 */
export type ScrapeError =
  | { type: 'navigation_failed'; url: string; reason: string }
  | { type: 'no_theaters_found'; message: string };

/**
 * Scrape progress info.
 */
export interface ScrapeProgress {
  stage: 'initializing' | 'navigating' | 'extracting' | 'scraping' | 'complete';
  current: number;
  total: number;
  message: string;
}

export type OnProgressCallback = (progress: ScrapeProgress) => void;

/**
 * Scrape options for chain scrapers.
 */
export interface ScrapeOptions {
  movieTitles: string[];
  date: Date;
  theaterNames?: string[] | undefined;
}

/**
 * Chain scraper's showtime output.
 */
export interface ChainScrapedShowtime {
  movieTitle: string;
  theater: string;
  theaterChain: string;
  startTime: string; // ISO 8601
  endTime: string;   // ISO 8601
  runtimeMinutes: number;
  format: ShowtimeFormat;
}

/**
 * Chain scraper interface for theater-specific scraping logic.
 */
export interface ChainScraper {
  readonly chainId: string;
  scrapeTheater(
    ctx: BrowserContext,
    entry: TheaterEntry,
    targetDate: Date,
    movieTitles: string[],
    onProgress?: OnProgressCallback
  ): Promise<ChainScrapedShowtime[]>;
}

/**
 * Common interface for all theater chain scrapers.
 */
export interface TheaterScraper {
  readonly theaterChain: string;
  scrapeSchedule(
    options: ScrapeOptions,
    onProgress?: OnProgressCallback
  ): Promise<Result<ChainShowtime[], ScrapeError>>;
  isSupported(theaterName: string): boolean;
  close(): Promise<void>;
}

/**
 * Showtime with Date objects (final output of TheaterScraper).
 */
export interface ChainShowtime {
  movieTitle: string;
  theater: string;
  theaterChain: string;
  startTime: Date;
  endTime: Date;
  format: ShowtimeFormat;
}
