import type { Database } from 'sql.js';
import type { Theater, TheaterChain } from '@cinema-scheduler/shared';

/**
 * 映画館をUPSERT（存在しなければINSERT、存在すればUPDATE）
 * @returns 映画館ID
 */
export function upsertTheater(
  db: Database,
  theater: { name: string; area: string; chain?: string }
): number {
  // まず既存のレコードを検索
  const stmt = db.prepare(
    'SELECT id FROM theaters WHERE name = ? AND area = ?'
  );
  stmt.bind([theater.name, theater.area]);

  let theaterId: number;
  if (stmt.step()) {
    // 既存レコードあり
    theaterId = stmt.getAsObject()['id'] as number;
    stmt.free();

    // チェーン情報を更新
    if (theater.chain !== undefined) {
      db.run('UPDATE theaters SET chain = ? WHERE id = ?', [
        theater.chain,
        theaterId,
      ]);
    }
  } else {
    stmt.free();
    // 新規INSERT
    db.run('INSERT INTO theaters (name, area, chain) VALUES (?, ?, ?)', [
      theater.name,
      theater.area,
      theater.chain ?? null,
    ]);

    // 挿入されたIDを取得
    const lastIdStmt = db.prepare('SELECT last_insert_rowid() as id');
    lastIdStmt.step();
    theaterId = lastIdStmt.getAsObject()['id'] as number;
    lastIdStmt.free();
  }

  return theaterId;
}

/**
 * エリア内の全映画館を取得
 */
export function getTheatersByArea(db: Database, area: string): Theater[] {
  const stmt = db.prepare('SELECT * FROM theaters WHERE area = ?');
  stmt.bind([area]);

  const theaters: Theater[] = [];
  while (stmt.step()) {
    const row = stmt.getAsObject() as {
      id: number;
      name: string;
      area: string;
      chain: string | null;
    };
    theaters.push({
      id: row.id,
      name: row.name,
      area: row.area,
      chain: (row.chain as TheaterChain) ?? null,
    });
  }
  stmt.free();

  return theaters;
}

/**
 * 映画館名とエリアで映画館を検索
 */
export function findTheater(
  db: Database,
  name: string,
  area: string
): Theater | null {
  const stmt = db.prepare(
    'SELECT * FROM theaters WHERE name = ? AND area = ?'
  );
  stmt.bind([name, area]);

  if (stmt.step()) {
    const row = stmt.getAsObject() as {
      id: number;
      name: string;
      area: string;
      chain: string | null;
    };
    stmt.free();
    return {
      id: row.id,
      name: row.name,
      area: row.area,
      chain: (row.chain as TheaterChain) ?? null,
    };
  }

  stmt.free();
  return null;
}
