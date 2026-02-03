/**
 * 上映時間情報
 */
export interface Showtime {
  movieTitle: string;
  theater: string;
  startTime: string; // HH:mm
  endTime: string; // HH:mm
  format: string | null;
  audioType: string | null;
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
  audioType: string | null;
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

  // フォーマット優先度を定義
  const getFormatPriority = (format: string | null): number => {
    if (!format) return 0;
    switch (format) {
      case 'IMAX': return 100;
      case 'DOLBY_CINEMA': return 90;
      case 'DOLBY_ATMOS': return 80;
      case 'TCX': return 70;
      case 'GOOON': return 60;
      case '4DX': return 50;
      default: return 10;
    }
  };

  // ソート: preferPremiumならフォーマット優先、そうでなければ時間優先
  validShowtimes.sort((a, b) => {
    if (preferPremium) {
      // フォーマット優先度で比較（高い順）
      const aPriority = getFormatPriority(a.format);
      const bPriority = getFormatPriority(b.format);
      if (aPriority !== bPriority) return bPriority - aPriority;
    }
    // 同じフォーマット（または preferPremium=false）なら開始時間順
    const aMinutes = timeToMinutes(a.startTime);
    const bMinutes = timeToMinutes(b.startTime);
    return aMinutes - bMinutes;
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
      audioType: showtime.audioType,
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

  // 3. ソート優先順位:
  //    - 観られる映画数（多い順）
  //    - プレミアムフォーマット数（多い順）★重要
  //    - 休憩時間（少ない順）
  const formatPriority = (format: string | null): number => {
    if (!format) return 0;
    switch (format) {
      case 'IMAX': return 100;
      case 'DOLBY_CINEMA': return 90;
      case 'DOLBY_ATMOS': return 80;
      case 'TCX': return 70;
      case 'GOOON': return 60;
      case '4DX': return 50;
      default: return 10;
    }
  };

  results.sort((a, b) => {
    // まず観られる映画数
    if (b.stats.totalMovies !== a.stats.totalMovies) {
      return b.stats.totalMovies - a.stats.totalMovies;
    }
    // 次にプレミアムフォーマット数（IMAX等）を優先
    if (b.stats.premiumCount !== a.stats.premiumCount) {
      return b.stats.premiumCount - a.stats.premiumCount;
    }
    // 同じプレミアム数なら、フォーマットの優先度で比較
    const aTotalPriority = a.schedule.reduce((sum, s) => sum + formatPriority(s.format), 0);
    const bTotalPriority = b.schedule.reduce((sum, s) => sum + formatPriority(s.format), 0);
    if (bTotalPriority !== aTotalPriority) {
      return bTotalPriority - aTotalPriority;
    }
    // 最後に休憩時間
    return a.stats.totalBreakTimeMinutes - b.stats.totalBreakTimeMinutes;
  });

  // 4. グランドシネマサンシャイン池袋のIMAX上映を含む候補を確保
  //    第1候補に含まれていない場合、別候補として追加
  const GRAND_CINEMA_SUNSHINE = 'グランドシネマサンシャイン池袋';

  const hasGrandCinemaImax = (schedule: ScheduleItem[]): boolean => {
    return schedule.some(
      (s) => s.theater.includes(GRAND_CINEMA_SUNSHINE) && s.format === 'IMAX'
    );
  };

  // 第1候補がグランドシネマサンシャインIMAXを含んでいない場合
  if (results.length > 0 && !hasGrandCinemaImax(results[0]!.schedule)) {
    // グランドシネマサンシャインIMAXを含む候補を探す
    const grandCinemaCandidate = results.find((r) => hasGrandCinemaImax(r.schedule));

    if (grandCinemaCandidate) {
      // 既に含まれている場合は2番目に移動
      const index = results.indexOf(grandCinemaCandidate);
      if (index > 1) {
        results.splice(index, 1);
        results.splice(1, 0, grandCinemaCandidate);
      }
    }
  }

  return {
    candidates: results,
    totalCandidates: results.length,
  };
}
