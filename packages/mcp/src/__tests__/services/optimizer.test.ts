import { describe, it, expect } from 'vitest';
import {
  optimizeSchedule,
  type Showtime,
  type OptimizeOptions,
} from '../../services/optimizer-service.js';

describe('optimizeSchedule', () => {
  const baseShowtimes: Showtime[] = [
    {
      movieTitle: 'ズートピア2',
      theater: '新宿バルト9',
      startTime: '10:00',
      endTime: '11:48',
      format: null,
    },
    {
      movieTitle: 'ズートピア2',
      theater: '新宿バルト9',
      startTime: '14:00',
      endTime: '15:48',
      format: 'IMAX',
    },
    {
      movieTitle: 'シャドウズ・エッジ',
      theater: '新宿バルト9',
      startTime: '12:30',
      endTime: '14:51',
      format: null,
    },
    {
      movieTitle: 'シャドウズ・エッジ',
      theater: '新宿バルト9',
      startTime: '16:00',
      endTime: '18:21',
      format: null,
    },
    {
      movieTitle: 'ワーキングマン',
      theater: '新宿バルト9',
      startTime: '10:55',
      endTime: '13:00',
      format: null,
    },
  ];

  it('should create optimal schedule for multiple movies', () => {
    const options: OptimizeOptions = {
      movieTitles: ['ズートピア2', 'シャドウズ・エッジ'],
      showtimes: baseShowtimes,
      bufferMinutes: 30,
      preferPremium: false,
    };

    const result = optimizeSchedule(options);

    expect(result.schedule).toHaveLength(2);
    expect(result.schedule[0]?.movieTitle).toBe('ズートピア2');
    expect(result.schedule[0]?.startTime).toBe('10:00');
    expect(result.schedule[1]?.movieTitle).toBe('シャドウズ・エッジ');
    expect(result.schedule[1]?.startTime).toBe('12:30');
    expect(result.excluded).toHaveLength(0);
  });

  it('should prefer premium formats when preferPremium is true', () => {
    const options: OptimizeOptions = {
      movieTitles: ['ズートピア2'],
      showtimes: baseShowtimes,
      bufferMinutes: 0,
      preferPremium: true,
    };

    const result = optimizeSchedule(options);

    expect(result.schedule).toHaveLength(1);
    // 最も早い上映を選ぶが、IMAX優先でソートされている
    // ただし10:00と14:00では10:00が先なので通常版が選ばれる
    expect(result.schedule[0]?.startTime).toBe('10:00');
  });

  it('should respect time range', () => {
    const options: OptimizeOptions = {
      movieTitles: ['ズートピア2', 'シャドウズ・エッジ'],
      showtimes: baseShowtimes,
      timeRange: { start: '13:00', end: '20:00' },
      bufferMinutes: 10, // 15:48終了 + 10分 = 15:58、16:00開始はOK
      preferPremium: false,
    };

    const result = optimizeSchedule(options);

    expect(result.schedule).toHaveLength(2);
    expect(result.schedule[0]?.startTime).toBe('14:00');
    expect(result.schedule[1]?.startTime).toBe('16:00');
  });

  it('should exclude movies not found', () => {
    const options: OptimizeOptions = {
      movieTitles: ['ズートピア2', '存在しない映画'],
      showtimes: baseShowtimes,
      bufferMinutes: 30,
      preferPremium: false,
    };

    const result = optimizeSchedule(options);

    expect(result.schedule).toHaveLength(1);
    expect(result.excluded).toHaveLength(1);
    expect(result.excluded[0]?.title).toBe('存在しない映画');
    expect(result.excluded[0]?.reason).toBe('not_found');
  });

  it('should exclude movies with time conflict', () => {
    // 10:00-11:48のズートピア2と同時間帯のワーキングマン
    const options: OptimizeOptions = {
      movieTitles: ['ズートピア2', 'ワーキングマン'],
      showtimes: baseShowtimes,
      bufferMinutes: 30,
      preferPremium: false,
    };

    const result = optimizeSchedule(options);

    // ズートピア2 10:00-11:48の後、30分バッファで12:18以降の上映が必要
    // ワーキングマン 10:55-13:00 は開始時間が早いので除外される
    expect(result.schedule).toHaveLength(1);
    expect(result.excluded).toHaveLength(1);
    expect(result.excluded[0]?.title).toBe('ワーキングマン');
    expect(result.excluded[0]?.reason).toBe('time_conflict');
  });

  it('should calculate correct statistics', () => {
    const options: OptimizeOptions = {
      movieTitles: ['ズートピア2', 'シャドウズ・エッジ'],
      showtimes: baseShowtimes,
      bufferMinutes: 30,
      preferPremium: false,
    };

    const result = optimizeSchedule(options);

    expect(result.stats.totalMovies).toBe(2);
    // ズートピア2: 108分, シャドウズ・エッジ: 141分
    expect(result.stats.totalWatchTimeMinutes).toBe(108 + 141);
    // 11:48 -> 12:30 = 42分の休憩
    expect(result.stats.totalBreakTimeMinutes).toBe(42);
    expect(result.stats.premiumCount).toBe(0);
  });

  it('should handle empty movie list', () => {
    const options: OptimizeOptions = {
      movieTitles: [],
      showtimes: baseShowtimes,
      bufferMinutes: 30,
      preferPremium: false,
    };

    const result = optimizeSchedule(options);

    expect(result.schedule).toHaveLength(0);
    expect(result.excluded).toHaveLength(0);
  });

  it('should handle empty showtimes', () => {
    const options: OptimizeOptions = {
      movieTitles: ['ズートピア2'],
      showtimes: [],
      bufferMinutes: 30,
      preferPremium: false,
    };

    const result = optimizeSchedule(options);

    expect(result.schedule).toHaveLength(0);
    expect(result.excluded).toHaveLength(1);
    expect(result.excluded[0]?.reason).toBe('not_found');
  });
});
