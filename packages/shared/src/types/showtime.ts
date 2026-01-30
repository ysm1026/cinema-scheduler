/**
 * 上映形式
 */
export type ShowtimeFormat = 'IMAX' | 'DOLBY_CINEMA' | 'DOLBY_ATMOS' | '4DX' | 'SCREENX' | null;

/**
 * 上映スケジュール情報
 */
export interface Showtime {
  id: number;
  theaterId: number;
  movieId: number;
  date: string; // YYYY-MM-DD
  startTime: string; // HH:mm
  endTime: string; // HH:mm
  format: ShowtimeFormat;
}

/**
 * 上映スケジュール作成用のデータ（IDなし）
 */
export interface ShowtimeInput {
  theaterId: number;
  movieId: number;
  date: string;
  startTime: string;
  endTime: string;
  format?: ShowtimeFormat;
}

/**
 * 検索結果用の上映スケジュール（映画・映画館名を含む）
 */
export interface ShowtimeWithDetails {
  id: number;
  theater: string;
  area: string;
  movieTitle: string;
  date: string;
  startTime: string;
  endTime: string;
  durationMinutes: number;
  format: ShowtimeFormat;
}

/**
 * スクレイピングログ
 */
export interface ScrapeLog {
  id: number;
  area: string;
  scrapedAt: string; // ISO 8601
  showtimeCount: number | null;
  error: string | null;
}
