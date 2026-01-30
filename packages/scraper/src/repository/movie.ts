import type { Database } from 'sql.js';
import type { Movie } from '@cinema-scheduler/shared';

/**
 * 映画をUPSERT（存在しなければINSERT、存在すればUPDATE）
 * @returns 映画ID
 */
export function upsertMovie(
  db: Database,
  movie: { title: string; runtimeMinutes?: number }
): number {
  // まず既存のレコードを検索
  const stmt = db.prepare('SELECT id FROM movies WHERE title = ?');
  stmt.bind([movie.title]);

  let movieId: number;
  if (stmt.step()) {
    // 既存レコードあり
    movieId = stmt.getAsObject()['id'] as number;
    stmt.free();

    // runtime_minutesを更新（提供された場合のみ）
    if (movie.runtimeMinutes !== undefined) {
      db.run('UPDATE movies SET runtime_minutes = ? WHERE id = ?', [
        movie.runtimeMinutes,
        movieId,
      ]);
    }
  } else {
    stmt.free();
    // 新規INSERT
    db.run('INSERT INTO movies (title, runtime_minutes) VALUES (?, ?)', [
      movie.title,
      movie.runtimeMinutes ?? null,
    ]);

    // 挿入されたIDを取得
    const lastIdStmt = db.prepare('SELECT last_insert_rowid() as id');
    lastIdStmt.step();
    movieId = lastIdStmt.getAsObject()['id'] as number;
    lastIdStmt.free();
  }

  return movieId;
}

/**
 * タイトルで映画を検索
 */
export function findMovieByTitle(db: Database, title: string): Movie | null {
  const stmt = db.prepare('SELECT * FROM movies WHERE title = ?');
  stmt.bind([title]);

  if (stmt.step()) {
    const row = stmt.getAsObject() as {
      id: number;
      title: string;
      runtime_minutes: number | null;
    };
    stmt.free();
    return {
      id: row.id,
      title: row.title,
      runtimeMinutes: row.runtime_minutes,
    };
  }

  stmt.free();
  return null;
}

/**
 * 全映画を取得
 */
export function getAllMovies(db: Database): Movie[] {
  const stmt = db.prepare('SELECT * FROM movies ORDER BY title');

  const movies: Movie[] = [];
  while (stmt.step()) {
    const row = stmt.getAsObject() as {
      id: number;
      title: string;
      runtime_minutes: number | null;
    };
    movies.push({
      id: row.id,
      title: row.title,
      runtimeMinutes: row.runtime_minutes,
    });
  }
  stmt.free();

  return movies;
}
