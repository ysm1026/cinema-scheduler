import type { Database } from 'sql.js';
import type { Migration } from './index.js';

/**
 * Migration 002: audio_typeカラムを追加
 * 字幕(subtitled)/吹替(dubbed)の情報を格納
 */
export const migration002: Migration = {
  version: 2,
  name: 'add_audio_type',
  up(db: Database): void {
    // カラムが既に存在するか確認（SCHEMA_SQLで作成済みの場合をスキップ）
    const columns = db.exec('PRAGMA table_info(showtimes)');
    const hasAudioType = columns[0]?.values.some((row) => row[1] === 'audio_type');
    if (!hasAudioType) {
      db.run(`ALTER TABLE showtimes ADD COLUMN audio_type TEXT`);
    }
  },
};
