import type { Database } from 'sql.js';
import type { ShowtimeFormat, AudioType } from '@cinema-scheduler/shared';

/**
 * 上映情報の入力型
 */
export interface ShowtimeInput {
  theaterId: number;
  movieId: number;
  date: string;
  startTime: string;
  endTime: string;
  format?: string;
  audioType?: AudioType;
}

/**
 * 検索結果用の上映スケジュール（映画・映画館名を含む）
 */
export interface ShowtimeResult {
  id: number;
  theaterName: string;
  movieTitle: string;
  date: string;
  startTime: string;
  endTime: string;
  format: ShowtimeFormat;
  audioType: AudioType;
}

/**
 * 上映情報をUPSERT（存在しなければINSERT、存在すればUPDATE）
 * @returns 上映情報ID
 */
export function upsertShowtime(db: Database, showtime: ShowtimeInput): number {
  // まず既存のレコードを検索
  const stmt = db.prepare(
    'SELECT id FROM showtimes WHERE theater_id = ? AND movie_id = ? AND date = ? AND start_time = ?'
  );
  stmt.bind([
    showtime.theaterId,
    showtime.movieId,
    showtime.date,
    showtime.startTime,
  ]);

  let showtimeId: number;
  if (stmt.step()) {
    // 既存レコードあり
    showtimeId = stmt.getAsObject()['id'] as number;
    stmt.free();

    // end_time, format, audio_typeを更新
    db.run(
      'UPDATE showtimes SET end_time = ?, format = ?, audio_type = ? WHERE id = ?',
      [showtime.endTime, showtime.format ?? null, showtime.audioType ?? null, showtimeId]
    );
  } else {
    stmt.free();
    // 新規INSERT
    db.run(
      'INSERT INTO showtimes (theater_id, movie_id, date, start_time, end_time, format, audio_type) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [
        showtime.theaterId,
        showtime.movieId,
        showtime.date,
        showtime.startTime,
        showtime.endTime,
        showtime.format ?? null,
        showtime.audioType ?? null,
      ]
    );

    // 挿入されたIDを取得
    const lastIdStmt = db.prepare('SELECT last_insert_rowid() as id');
    lastIdStmt.step();
    showtimeId = lastIdStmt.getAsObject()['id'] as number;
    lastIdStmt.free();
  }

  return showtimeId;
}

/**
 * 指定日・エリアの上映情報を取得
 */
export function getShowtimesByDateAndArea(
  db: Database,
  date: string,
  area: string
): ShowtimeResult[] {
  const stmt = db.prepare(`
    SELECT
      s.id,
      t.name as theater_name,
      t.area,
      m.title as movie_title,
      s.date,
      s.start_time,
      s.end_time,
      s.format,
      s.audio_type
    FROM showtimes s
    JOIN theaters t ON s.theater_id = t.id
    JOIN movies m ON s.movie_id = m.id
    WHERE s.date = ? AND t.area = ?
    ORDER BY s.start_time
  `);
  stmt.bind([date, area]);

  const showtimes: ShowtimeResult[] = [];
  while (stmt.step()) {
    const row = stmt.getAsObject() as {
      id: number;
      theater_name: string;
      area: string;
      movie_title: string;
      date: string;
      start_time: string;
      end_time: string;
      format: string | null;
      audio_type: string | null;
    };
    showtimes.push({
      id: row.id,
      theaterName: row.theater_name,
      movieTitle: row.movie_title,
      date: row.date,
      startTime: row.start_time,
      endTime: row.end_time,
      format: (row.format as ShowtimeFormat) ?? null,
      audioType: (row.audio_type as AudioType) ?? null,
    });
  }
  stmt.free();

  return showtimes;
}

