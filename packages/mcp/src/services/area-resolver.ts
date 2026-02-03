import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import * as yaml from 'yaml';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

interface AreaConfig {
  aliases?: Record<string, string>;
  [area: string]: string | Record<string, string> | undefined;
}

let areaAliases: Map<string, string> | null = null;

/**
 * エリアエイリアスを読み込む
 */
function loadAreaAliases(): Map<string, string> {
  if (areaAliases !== null) {
    return areaAliases;
  }

  areaAliases = new Map();

  try {
    // scraper パッケージの config を参照
    const configPath = path.resolve(__dirname, '../../../scraper/dist/config/areas.yaml');

    if (fs.existsSync(configPath)) {
      const content = fs.readFileSync(configPath, 'utf-8');
      const config = yaml.parse(content) as AreaConfig;

      if (config.aliases && typeof config.aliases === 'object') {
        for (const [alias, target] of Object.entries(config.aliases)) {
          areaAliases.set(alias, target);
        }
      }
    }
  } catch (error) {
    console.error('Failed to load area aliases:', error);
  }

  return areaAliases;
}

/**
 * エリア名を解決する（エイリアスがあれば実際のエリア名に変換）
 */
export function resolveAreaName(area: string): string {
  const aliases = loadAreaAliases();
  return aliases.get(area) ?? area;
}

/**
 * 複数のエリア名を解決する
 */
export function resolveAreaNames(areas: string[]): string[] {
  const resolved = areas.map(resolveAreaName);
  // 重複を除去（異なるエイリアスが同じエリアを指す場合）
  return [...new Set(resolved)];
}

/**
 * エイリアスのキャッシュをクリア（テスト用）
 */
export function clearAliasCache(): void {
  areaAliases = null;
}
