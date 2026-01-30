import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'yaml';

const __dirname = dirname(fileURLToPath(import.meta.url));

/**
 * YAMLファイルからエリアコードを読み込む
 */
function loadAreaCodes(): Record<string, string> {
  // dist/scraper/areas.js から dist/config/areas.yaml を参照
  const configPath = join(__dirname, '../config/areas.yaml');
  const content = readFileSync(configPath, 'utf-8');
  return parse(content) as Record<string, string>;
}

/**
 * eiga.comのエリアコード定義
 * 形式: 都道府県コード/エリアコード (例: 13/130301)
 */
export const AREA_CODES: Record<string, string> = loadAreaCodes();

export type AreaName = string;

/**
 * エリア名の一覧を取得
 */
export function getAreaNames(): string[] {
  return Object.keys(AREA_CODES);
}

/**
 * エリア名からエリアコードを取得
 */
export function getAreaCode(areaName: string): string | undefined {
  return AREA_CODES[areaName];
}

/**
 * エリア設定を再読み込みする
 */
export function reloadAreaCodes(): void {
  const newCodes = loadAreaCodes();
  // 既存のキーを削除
  for (const key of Object.keys(AREA_CODES)) {
    delete AREA_CODES[key];
  }
  // 新しいキーを追加
  Object.assign(AREA_CODES, newCodes);
}
