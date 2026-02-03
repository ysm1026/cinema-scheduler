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
      audioType: null,
    },
    {
      movieTitle: 'ズートピア2',
      theater: '新宿バルト9',
      startTime: '14:00',
      endTime: '15:48',
      format: 'IMAX',
      audioType: 'subtitled',
    },
    {
      movieTitle: 'シャドウズ・エッジ',
      theater: '新宿バルト9',
      startTime: '12:30',
      endTime: '14:51',
      format: null,
      audioType: null,
    },
    {
      movieTitle: 'シャドウズ・エッジ',
      theater: '新宿バルト9',
      startTime: '16:00',
      endTime: '18:21',
      format: null,
      audioType: 'dubbed',
    },
    {
      movieTitle: 'ワーキングマン',
      theater: '新宿バルト9',
      startTime: '10:55',
      endTime: '13:00',
      format: null,
      audioType: null,
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
    const best = result.candidates[0];

    expect(best?.schedule).toHaveLength(2);
    expect(best?.schedule[0]?.movieTitle).toBe('ズートピア2');
    expect(best?.schedule[0]?.startTime).toBe('10:00');
    expect(best?.schedule[1]?.movieTitle).toBe('シャドウズ・エッジ');
    expect(best?.schedule[1]?.startTime).toBe('12:30');
    expect(best?.excluded).toHaveLength(0);
  });

  it('should prefer premium formats when preferPremium is true', () => {
    const options: OptimizeOptions = {
      movieTitles: ['ズートピア2'],
      showtimes: baseShowtimes,
      bufferMinutes: 0,
      preferPremium: true,
    };

    const result = optimizeSchedule(options);
    const best = result.candidates[0];

    expect(best?.schedule).toHaveLength(1);
    // preferPremium=trueの場合、IMAXが通常版より優先される
    // 時間より高品質フォーマットを優先
    expect(best?.schedule[0]?.startTime).toBe('14:00');
    expect(best?.schedule[0]?.format).toBe('IMAX');
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
    const best = result.candidates[0];

    expect(best?.schedule).toHaveLength(2);
    expect(best?.schedule[0]?.startTime).toBe('14:00');
    expect(best?.schedule[1]?.startTime).toBe('16:00');
  });

  it('should exclude movies not found', () => {
    const options: OptimizeOptions = {
      movieTitles: ['ズートピア2', '存在しない映画'],
      showtimes: baseShowtimes,
      bufferMinutes: 30,
      preferPremium: false,
    };

    const result = optimizeSchedule(options);
    const best = result.candidates[0];

    expect(best?.schedule).toHaveLength(1);
    expect(best?.excluded).toHaveLength(1);
    expect(best?.excluded[0]?.title).toBe('存在しない映画');
    expect(best?.excluded[0]?.reason).toBe('not_found');
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
    const best = result.candidates[0];

    // ズートピア2 10:00-11:48の後、30分バッファで12:18以降の上映が必要
    // ワーキングマン 10:55-13:00 は開始時間が早いので除外される
    expect(best?.schedule).toHaveLength(1);
    expect(best?.excluded).toHaveLength(1);
    expect(best?.excluded[0]?.title).toBe('ワーキングマン');
    expect(best?.excluded[0]?.reason).toBe('time_conflict');
  });

  it('should calculate correct statistics', () => {
    const options: OptimizeOptions = {
      movieTitles: ['ズートピア2', 'シャドウズ・エッジ'],
      showtimes: baseShowtimes,
      bufferMinutes: 30,
      preferPremium: false,
    };

    const result = optimizeSchedule(options);
    const best = result.candidates[0];

    expect(best?.stats.totalMovies).toBe(2);
    // ズートピア2: 108分, シャドウズ・エッジ: 141分
    expect(best?.stats.totalWatchTimeMinutes).toBe(108 + 141);
    // 11:48 -> 12:30 = 42分の休憩
    expect(best?.stats.totalBreakTimeMinutes).toBe(42);
    expect(best?.stats.premiumCount).toBe(0);
  });

  it('should handle empty movie list', () => {
    const options: OptimizeOptions = {
      movieTitles: [],
      showtimes: baseShowtimes,
      bufferMinutes: 30,
      preferPremium: false,
    };

    const result = optimizeSchedule(options);
    const best = result.candidates[0];

    expect(best?.schedule).toHaveLength(0);
    expect(best?.excluded).toHaveLength(0);
  });

  it('should handle empty showtimes', () => {
    const options: OptimizeOptions = {
      movieTitles: ['ズートピア2'],
      showtimes: [],
      bufferMinutes: 30,
      preferPremium: false,
    };

    const result = optimizeSchedule(options);
    const best = result.candidates[0];

    expect(best?.schedule).toHaveLength(0);
    expect(best?.excluded).toHaveLength(1);
    expect(best?.excluded[0]?.reason).toBe('not_found');
  });
});
