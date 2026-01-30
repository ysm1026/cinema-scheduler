import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { openDatabase, closeDatabase } from '@cinema-scheduler/shared';
import type { Database } from 'sql.js';
import {
  upsertTheater,
  getTheatersByArea,
  findTheater,
} from '../repository/theater.js';
import {
  upsertMovie,
  findMovieByTitle,
  getAllMovies,
} from '../repository/movie.js';
import {
  upsertShowtime,
  getShowtimesByDateAndArea,
  deleteOldShowtimes,
} from '../repository/showtime.js';
import {
  addScrapeLog,
  getLatestScrapeLogByArea,
  getAllLatestScrapeLogs,
} from '../repository/scrape-log.js';

describe('Repository Layer', () => {
  let db: Database;

  beforeEach(async () => {
    db = await openDatabase({ inMemory: true });
  });

  afterEach(() => {
    closeDatabase(db);
  });

  describe('TheaterRepository', () => {
    it('should insert new theater', () => {
      const id = upsertTheater(db, {
        name: '新宿バルト9',
        area: '新宿',
        chain: 'ティ・ジョイ',
      });

      expect(id).toBeGreaterThan(0);

      const theater = findTheater(db, '新宿バルト9', '新宿');
      expect(theater).not.toBeNull();
      expect(theater?.name).toBe('新宿バルト9');
      expect(theater?.area).toBe('新宿');
      expect(theater?.chain).toBe('ティ・ジョイ');
    });

    it('should update existing theater', () => {
      const id1 = upsertTheater(db, {
        name: '新宿バルト9',
        area: '新宿',
      });
      const id2 = upsertTheater(db, {
        name: '新宿バルト9',
        area: '新宿',
        chain: 'ティ・ジョイ',
      });

      expect(id1).toBe(id2);

      const theater = findTheater(db, '新宿バルト9', '新宿');
      expect(theater?.chain).toBe('ティ・ジョイ');
    });

    it('should get theaters by area', () => {
      upsertTheater(db, { name: '新宿バルト9', area: '新宿' });
      upsertTheater(db, { name: 'TOHOシネマズ 新宿', area: '新宿' });
      upsertTheater(db, { name: 'TOHOシネマズ 渋谷', area: '渋谷' });

      const theaters = getTheatersByArea(db, '新宿');
      expect(theaters).toHaveLength(2);
    });
  });

  describe('MovieRepository', () => {
    it('should insert new movie', () => {
      const id = upsertMovie(db, {
        title: 'ズートピア2',
        runtimeMinutes: 108,
      });

      expect(id).toBeGreaterThan(0);

      const movie = findMovieByTitle(db, 'ズートピア2');
      expect(movie).not.toBeNull();
      expect(movie?.title).toBe('ズートピア2');
      expect(movie?.runtimeMinutes).toBe(108);
    });

    it('should update existing movie', () => {
      const id1 = upsertMovie(db, { title: 'ズートピア2' });
      const id2 = upsertMovie(db, { title: 'ズートピア2', runtimeMinutes: 108 });

      expect(id1).toBe(id2);

      const movie = findMovieByTitle(db, 'ズートピア2');
      expect(movie?.runtimeMinutes).toBe(108);
    });

    it('should get all movies', () => {
      upsertMovie(db, { title: 'ズートピア2' });
      upsertMovie(db, { title: 'シャドウズ・エッジ' });

      const movies = getAllMovies(db);
      expect(movies).toHaveLength(2);
    });
  });

  describe('ShowtimeRepository', () => {
    let theaterId: number;
    let movieId: number;

    beforeEach(() => {
      theaterId = upsertTheater(db, { name: '新宿バルト9', area: '新宿' });
      movieId = upsertMovie(db, { title: 'ズートピア2' });
    });

    it('should insert new showtime', () => {
      const id = upsertShowtime(db, {
        theaterId,
        movieId,
        date: '2026-01-30',
        startTime: '10:00',
        endTime: '11:48',
        format: 'IMAX',
      });

      expect(id).toBeGreaterThan(0);
    });

    it('should update existing showtime', () => {
      const id1 = upsertShowtime(db, {
        theaterId,
        movieId,
        date: '2026-01-30',
        startTime: '10:00',
        endTime: '11:48',
      });
      const id2 = upsertShowtime(db, {
        theaterId,
        movieId,
        date: '2026-01-30',
        startTime: '10:00',
        endTime: '11:48',
        format: 'IMAX',
      });

      expect(id1).toBe(id2);
    });

    it('should get showtimes by date and area', () => {
      const movie2Id = upsertMovie(db, { title: 'シャドウズ・エッジ' });

      upsertShowtime(db, {
        theaterId,
        movieId,
        date: '2026-01-30',
        startTime: '10:00',
        endTime: '11:48',
      });
      upsertShowtime(db, {
        theaterId,
        movieId: movie2Id,
        date: '2026-01-30',
        startTime: '12:00',
        endTime: '14:21',
      });
      // 別の日付
      upsertShowtime(db, {
        theaterId,
        movieId,
        date: '2026-01-31',
        startTime: '10:00',
        endTime: '11:48',
      });

      const showtimes = getShowtimesByDateAndArea(db, '2026-01-30', '新宿');
      expect(showtimes).toHaveLength(2);
      expect(showtimes[0]?.startTime).toBe('10:00');
      expect(showtimes[1]?.startTime).toBe('12:00');
    });

    it('should delete old showtimes', () => {
      upsertShowtime(db, {
        theaterId,
        movieId,
        date: '2026-01-28',
        startTime: '10:00',
        endTime: '11:48',
      });
      upsertShowtime(db, {
        theaterId,
        movieId,
        date: '2026-01-30',
        startTime: '10:00',
        endTime: '11:48',
      });

      const deleted = deleteOldShowtimes(db, '2026-01-29');
      expect(deleted).toBe(1);

      const remaining = getShowtimesByDateAndArea(db, '2026-01-30', '新宿');
      expect(remaining).toHaveLength(1);
    });
  });

  describe('ScrapeLogRepository', () => {
    it('should add scrape log', () => {
      const id = addScrapeLog(db, {
        area: '新宿',
        showtimeCount: 100,
      });

      expect(id).toBeGreaterThan(0);

      const log = getLatestScrapeLogByArea(db, '新宿');
      expect(log).not.toBeNull();
      expect(log?.area).toBe('新宿');
      expect(log?.showtimeCount).toBe(100);
    });

    it('should get latest log per area', () => {
      addScrapeLog(db, { area: '新宿', showtimeCount: 50 });
      addScrapeLog(db, { area: '新宿', showtimeCount: 100 });
      addScrapeLog(db, { area: '渋谷', showtimeCount: 80 });

      const allLogs = getAllLatestScrapeLogs(db);
      expect(allLogs).toHaveLength(2);

      const shinjukuLog = allLogs.find((l) => l.area === '新宿');
      expect(shinjukuLog?.showtimeCount).toBe(100);
    });

    it('should record error', () => {
      addScrapeLog(db, {
        area: '新宿',
        error: 'Connection timeout',
      });

      const log = getLatestScrapeLogByArea(db, '新宿');
      expect(log?.error).toBe('Connection timeout');
      expect(log?.showtimeCount).toBeNull();
    });
  });
});
