/**
 * 上映時間情報
 */
export interface Showtime {
  movieTitle: string;
  theater: string;
  startTime: string; // HH:mm
  endTime: string; // HH:mm
  format: string | null;
}

/**
 * 最適化オプション
 */
export interface OptimizeOptions {
  movieTitles: string[];
  showtimes: Showtime[];
  timeRange?: { start: string; end: string };
  bufferMinutes: number;
  preferPremium: boolean;
}

/**
 * スケジュールアイテム
 */
export interface ScheduleItem {
  order: number;
  movieTitle: string;
  theater: string;
  startTime: string;
  endTime: string;
  durationMinutes: number;
  format: string | null;
  breakMinutesBefore: number;
}

/**
 * 除外された映画
 */
export interface ExcludedMovie {
  title: string;
  reason: 'not_found' | 'time_conflict';
}

/**
 * 統計情報
 */
export interface ScheduleStats {
  totalMovies: number;
  totalWatchTimeMinutes: number;
  totalBreakTimeMinutes: number;
  premiumCount: number;
}

/**
 * 単一スケジュール結果
 */
export interface ScheduleResult {
  schedule: ScheduleItem[];
  excluded: ExcludedMovie[];
  stats: ScheduleStats;
}

/**
 * 最適化結果（複数候補）
 */
export interface OptimizeResult {
  candidates: ScheduleResult[];
  totalCandidates: number;
}

import { matchTitle } from './title-matcher.js';

/**
 * 時刻文字列を分に変換
 */
function timeToMinutes(time: string): number {
  const [h, m] = time.split(':').map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
}

/**
 * 上映時間（分）を計算
 */
function calculateDuration(startTime: string, endTime: string): number {
  let startMinutes = timeToMinutes(startTime);
  let endMinutes = timeToMinutes(endTime);

  if (endMinutes < startMinutes) {
    endMinutes += 24 * 60;
  }

  return endMinutes - startMinutes;
}

/**
 * 統計情報を計算
 */
function calculateStats(schedule: ScheduleItem[]): ScheduleStats {
  const totalWatchTime = schedule.reduce((sum, s) => sum + s.durationMinutes, 0);
  const totalBreakTime = schedule.reduce((sum, s) => sum + s.breakMinutesBefore, 0);
  const premiumCount = schedule.filter((s) => s.format !== null).length;

  return {
    totalMovies: schedule.length,
    totalWatchTimeMinutes: totalWatchTime,
    totalBreakTimeMinutes: totalBreakTime,
    premiumCount,
  };
}

/**
 * 再帰的に全スケジュール候補を生成
 */
function generateSchedules(
  movieTitles: string[],
  candidatesMap: Map<string, Showtime[]>,
  timeRange: { start: string; end: string } | undefined,
  bufferMinutes: number,
  preferPremium: boolean,
  currentSchedule: ScheduleItem[],
  currentEndTime: string,
  excluded: ExcludedMovie[],
  results: ScheduleResult[],
  maxResults: number
): void {
  // 結果数制限
  if (results.length >= maxResults) return;

  // 全映画を処理した
  if (movieTitles.length === 0) {
    results.push({
      schedule: [...currentSchedule],
      excluded: [...excluded],
      stats: calculateStats(currentSchedule),
    });
    return;
  }

  const [title, ...remainingTitles] = movieTitles;
  const movieShowtimes = candidatesMap.get(title!) ?? [];

  // この映画の上映がない場合
  if (movieShowtimes.length === 0) {
    generateSchedules(
      remainingTitles,
      candidatesMap,
      timeRange,
      bufferMinutes,
      preferPremium,
      currentSchedule,
      currentEndTime,
      [...excluded, { title: title!, reason: 'not_found' }],
      results,
      maxResults
    );
    return;
  }

  // 時間的に可能な上映を抽出
  const minStartMinutes = timeToMinutes(currentEndTime) + bufferMinutes;
  const maxEndMinutes = timeRange?.end ? timeToMinutes(timeRange.end) : 24 * 60;

  const validShowtimes = movieShowtimes.filter((s) => {
    const startMinutes = timeToMinutes(s.startTime);
    const endMinutes = timeToMinutes(s.endTime);

    if (startMinutes < minStartMinutes) return false;
    if (timeRange?.end && endMinutes > maxEndMinutes) return false;
    return true;
  });

  // 可能な上映がない場合
  if (validShowtimes.length === 0) {
    generateSchedules(
      remainingTitles,
      candidatesMap,
      timeRange,
      bufferMinutes,
      preferPremium,
      currentSchedule,
      currentEndTime,
      [...excluded, { title: title!, reason: 'time_conflict' }],
      results,
      maxResults
    );
    return;
  }

  // 開始時間でソート（プレミアム優先も考慮）
  validShowtimes.sort((a, b) => {
    const aMinutes = timeToMinutes(a.startTime);
    const bMinutes = timeToMinutes(b.startTime);
    if (aMinutes !== bMinutes) return aMinutes - bMinutes;
    if (preferPremium) {
      const aIsPremium = a.format !== null;
      const bIsPremium = b.format !== null;
      if (aIsPremium && !bIsPremium) return -1;
      if (!aIsPremium && bIsPremium) return 1;
    }
    return 0;
  });

  // 各候補について再帰
  for (const showtime of validShowtimes) {
    if (results.length >= maxResults) return;

    const durationMinutes = calculateDuration(showtime.startTime, showtime.endTime);
    const breakMinutes =
      currentSchedule.length === 0
        ? 0
        : timeToMinutes(showtime.startTime) - timeToMinutes(currentEndTime);

    const newItem: ScheduleItem = {
      order: currentSchedule.length + 1,
      movieTitle: showtime.movieTitle,
      theater: showtime.theater,
      startTime: showtime.startTime,
      endTime: showtime.endTime,
      durationMinutes,
      format: showtime.format,
      breakMinutesBefore: Math.max(0, breakMinutes),
    };

    generateSchedules(
      remainingTitles,
      candidatesMap,
      timeRange,
      bufferMinutes,
      preferPremium,
      [...currentSchedule, newItem],
      showtime.endTime,
      excluded,
      results,
      maxResults
    );
  }
}

/**
 * スケジュールを最適化する（複数候補生成）
 */
export function optimizeSchedule(options: OptimizeOptions): OptimizeResult {
  const { movieTitles, showtimes, timeRange, bufferMinutes, preferPremium } = options;
  const maxResults = 10; // 最大候補数

  // 1. 各映画の候補上映時間を収集（曖昧検索）
  const candidatesMap = new Map<string, Showtime[]>();
  for (const title of movieTitles) {
    const matches = showtimes.filter((s) => matchTitle(title, s.movieTitle));
    candidatesMap.set(title, matches);
  }

  // 2. 全候補を生成
  const results: ScheduleResult[] = [];
  generateSchedules(
    movieTitles,
    candidatesMap,
    timeRange,
    bufferMinutes,
    preferPremium,
    [],
    timeRange?.start ?? '00:00',
    [],
    results,
    maxResults
  );

  // 3. 観られる映画数でソート（多い順）、同数なら休憩時間が少ない順
  results.sort((a, b) => {
    if (b.stats.totalMovies !== a.stats.totalMovies) {
      return b.stats.totalMovies - a.stats.totalMovies;
    }
    return a.stats.totalBreakTimeMinutes - b.stats.totalBreakTimeMinutes;
  });

  return {
    candidates: results,
    totalCandidates: results.length,
  };
}
