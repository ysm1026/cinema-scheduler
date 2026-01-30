import { z } from 'zod';
import { AREA_CODES } from './scraper/areas.js';

/**
 * CLI設定スキーマ
 */
export const ConfigSchema = z.object({
  areas: z.array(z.string()).min(1),
  days: z.number().int().min(1).max(7),
  dryRun: z.boolean(),
  verbose: z.boolean(),
});

export type Config = z.infer<typeof ConfigSchema>;

/**
 * デフォルト設定
 */
export const DEFAULT_CONFIG: Config = {
  areas: Object.keys(AREA_CODES),
  days: 7,
  dryRun: false,
  verbose: false,
};

/**
 * エリア名を検証する
 */
export function validateAreas(areas: string[]): { valid: string[]; invalid: string[] } {
  const valid: string[] = [];
  const invalid: string[] = [];

  for (const area of areas) {
    if (area in AREA_CODES) {
      valid.push(area);
    } else {
      invalid.push(area);
    }
  }

  return { valid, invalid };
}

/**
 * 日付範囲を生成する
 */
export function generateDateRange(days: number): string[] {
  const dates: string[] = [];
  const today = new Date();

  for (let i = 0; i < days; i++) {
    const date = new Date(today);
    date.setDate(today.getDate() + i);
    dates.push(date.toISOString().split('T')[0]!);
  }

  return dates;
}
