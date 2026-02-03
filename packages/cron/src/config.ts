/**
 * Cron設定の読み込み
 */

import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import * as yaml from 'yaml';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * 設定の型定義
 */
export interface CronConfig {
  scrape: {
    areas?: string[];
    days: number;
  };
  googleSheets: {
    keyFilePath: string;
    spreadsheetId: string;
  };
  schedule: {
    scrape: string;
    export: string;
  };
}

/**
 * デフォルト設定
 */
const DEFAULT_CONFIG: CronConfig = {
  scrape: {
    days: 3,
  },
  googleSheets: {
    keyFilePath: './config/google-service-account.json',
    spreadsheetId: '',
  },
  schedule: {
    scrape: '0 6 * * *',
    export: '0 7 * * *',
  },
};

let cachedConfig: CronConfig | null = null;

/**
 * 設定ファイルを読み込む
 */
export function loadConfig(configPath?: string): CronConfig {
  if (cachedConfig !== null) {
    return cachedConfig;
  }

  // 設定ファイルのパスを解決
  const defaultConfigPath = path.resolve(__dirname, '../config/cron.yaml');
  const resolvedPath = configPath ?? process.env.CRON_CONFIG_PATH ?? defaultConfigPath;

  try {
    if (fs.existsSync(resolvedPath)) {
      const content = fs.readFileSync(resolvedPath, 'utf-8');
      const parsed = yaml.parse(content) as Partial<CronConfig>;

      // デフォルト設定とマージ
      cachedConfig = {
        scrape: {
          ...DEFAULT_CONFIG.scrape,
          ...parsed.scrape,
        },
        googleSheets: {
          ...DEFAULT_CONFIG.googleSheets,
          ...parsed.googleSheets,
        },
        schedule: {
          ...DEFAULT_CONFIG.schedule,
          ...parsed.schedule,
        },
      };
    } else {
      console.warn(`設定ファイルが見つかりません: ${resolvedPath}`);
      console.warn('デフォルト設定を使用します');
      cachedConfig = DEFAULT_CONFIG;
    }
  } catch (error) {
    console.error('設定ファイルの読み込みに失敗:', error);
    cachedConfig = DEFAULT_CONFIG;
  }

  return cachedConfig;
}

/**
 * キャッシュをクリア（テスト用）
 */
export function clearConfigCache(): void {
  cachedConfig = null;
}

/**
 * Google Sheets設定が有効かチェック
 */
export function isGoogleSheetsConfigured(config: CronConfig): boolean {
  return !!(config.googleSheets.keyFilePath && config.googleSheets.spreadsheetId);
}
