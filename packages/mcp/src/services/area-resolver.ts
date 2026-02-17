/**
 * エリアエイリアス定義（areas.yaml と同期）
 * Docker 環境では scraper パッケージが存在しないため、ここに埋め込む
 */
const AREA_ALIASES: Record<string, string> = {
  日比谷: '有楽町',
  丸の内: '有楽町',
  '銀座・有楽町': '有楽町',
  東京駅: '日本橋',
  秋葉原: '上野',
  原宿: '渋谷',
  表参道: '渋谷',
  青山: '渋谷',
  新大久保: '新宿',
  歌舞伎町: '新宿',
  代官山: '恵比寿',
  中目黒: '恵比寿',
  自由が丘: '二子玉川',
  三軒茶屋: '下北沢',
  巣鴨: '大塚',
  浅草: '上野',
  押上: '錦糸町',
  スカイツリー: '錦糸町',
  東京ドーム: '水道橋',
  後楽園: '水道橋',
};

const areaAliases = new Map<string, string>(Object.entries(AREA_ALIASES));

/**
 * エリア名を解決する（エイリアスがあれば実際のエリア名に変換）
 */
export function resolveAreaName(area: string): string {
  return areaAliases.get(area) ?? area;
}

/**
 * 複数のエリア名を解決する
 */
export function resolveAreaNames(areas: string[]): string[] {
  const resolved = areas.map(resolveAreaName);
  // 重複を除去（異なるエイリアスが同じエリアを指す場合）
  return [...new Set(resolved)];
}

