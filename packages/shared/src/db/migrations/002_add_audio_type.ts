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
    // showtimesテーブルにaudio_typeカラムを追加
    db.run(`ALTER TABLE showtimes ADD COLUMN audio_type TEXT`);
  },
};
