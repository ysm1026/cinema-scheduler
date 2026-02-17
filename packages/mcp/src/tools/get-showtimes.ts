import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { Database } from 'sql.js';
import { matchTitle } from '../services/title-matcher.js';
import { resolveAreaNames } from '../services/area-resolver.js';

/**
 * パラメータスキーマ
 */
const inputSchema = z.object({
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'YYYY-MM-DD形式で指定してください')
    .optional()
    .describe('日付（YYYY-MM-DD、省略時は今日）'),
  areas: z
    .array(z.string())
    .optional()
    .describe('エリア名リスト（複数指定可、省略時は全エリア）'),
  theater: z.string().optional().describe('映画館名（部分一致）'),
  movieTitle: z.string().optional().describe('映画タイトル（曖昧検索）'),
});

type Input = z.infer<typeof inputSchema>;

/**
 * 上映時間情報
 */
interface ShowtimeInfo {
  startTime: string;
  endTime: string;
  durationMinutes: number;
  format: string | null;
  audioType: string | null;
}

/**
 * 劇場ごとの上映情報
 */
interface TheaterShowtimes {
  theater: string;
  area: string;
  showtimes: ShowtimeInfo[];
}

/**
 * 映画ごとの上映情報
 */
interface MovieShowtimes {
  movieTitle: string;
  theaters: TheaterShowtimes[];
}

/**
 * レスポンス形式
 */
interface GetShowtimesResponse {
  date: string;
  areas: string[];
  movieTitle: string | null;
  movies: MovieShowtimes[];
  stats: {
    totalMovies: number;
    totalTheaters: number;
    totalShowtimes: number;
  };
}

/**
 * 今日の日付をYYYY-MM-DD形式で取得（ローカルタイムゾーン）
 */
function getTodayDate(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * 上映時間（分）を計算
 */
function calculateDuration(startTime: string, endTime: string): number {
  const [startH, startM] = startTime.split(':').map(Number);
  const [endH, endM] = endTime.split(':').map(Number);

  if (startH === undefined || startM === undefined || endH === undefined || endM === undefined) {
    return 120;
  }

  let startMinutes = startH * 60 + startM;
  let endMinutes = endH * 60 + endM;

  if (endMinutes < startMinutes) {
    endMinutes += 24 * 60;
  }

  return endMinutes - startMinutes;
}

/**
 * get_showtimesツールを登録する
 */
export function registerGetShowtimes(server: McpServer, db: Database): void {
  server.tool(
    'get_showtimes',
    `【必須】映画の上映スケジュール・上映時間を調べるときは必ずこのツールを使用してください。

このツールを使うべき場面:
- 「○○を見たい」「○○の上映時間は？」などの映画視聴に関する質問
- 特定のエリア（新宿、池袋、日比谷など）での映画上映情報
- 映画館のスケジュール確認

対応エリア: 新宿、池袋、有楽町（日比谷）、日本橋、渋谷など東京都内の主要エリア

【結果の提示ルール】
- IMAX/Dolby Cinema等のプレミアムフォーマットを優先して提案
- フォーマット優先順位: IMAX > DOLBY_CINEMA > DOLBY_ATMOS > TCX > GOOON > 4DX > 通常
- 字幕/吹替(audioType)を明示すること`,
    inputSchema.shape,
    async (input: Input) => {
      const date = input.date ?? getTodayDate();
      // エイリアスを解決（日比谷→有楽町など）
      const areas = input.areas ? resolveAreaNames(input.areas) : [];

      // クエリ構築
      let query = `
        SELECT
          t.name as theater,
          t.area,
          m.title as movieTitle,
          s.start_time as startTime,
          s.end_time as endTime,
          s.format,
          s.audio_type as audioType
        FROM showtimes s
        JOIN theaters t ON s.theater_id = t.id
        JOIN movies m ON s.movie_id = m.id
        WHERE s.date = ?
      `;
      const params: (string | number)[] = [date];

      // エリアフィルタ（複数対応）
      if (areas.length > 0) {
        const placeholders = areas.map(() => '?').join(', ');
        query += ` AND t.area IN (${placeholders})`;
        params.push(...areas);
      }

      // 映画館フィルタ
      if (input.theater) {
        query += ' AND t.name LIKE ?';
        params.push(`%${input.theater}%`);
      }

      query += ' ORDER BY m.title, t.name, s.start_time';

      try {
        const stmt = db.prepare(query);
        stmt.bind(params);

        // 映画 → 劇場 → 上映時間 の階層構造に変換
        const movieMap = new Map<string, Map<string, { area: string; showtimes: ShowtimeInfo[] }>>();
        const foundAreas = new Set<string>();
        let totalShowtimes = 0;

        while (stmt.step()) {
          const row = stmt.getAsObject() as {
            theater: string;
            area: string;
            movieTitle: string;
            startTime: string;
            endTime: string;
            format: string | null;
            audioType: string | null;
          };

          // 映画タイトルの曖昧検索
          if (input.movieTitle && !matchTitle(input.movieTitle, row.movieTitle)) {
            continue;
          }

          foundAreas.add(row.area);

          // 映画ごとのマップを取得または作成
          if (!movieMap.has(row.movieTitle)) {
            movieMap.set(row.movieTitle, new Map());
          }
          const theaterMap = movieMap.get(row.movieTitle)!;

          // 劇場ごとの上映情報を取得または作成
          if (!theaterMap.has(row.theater)) {
            theaterMap.set(row.theater, { area: row.area, showtimes: [] });
          }
          const theaterInfo = theaterMap.get(row.theater)!;

          theaterInfo.showtimes.push({
            startTime: row.startTime,
            endTime: row.endTime,
            durationMinutes: calculateDuration(row.startTime, row.endTime),
            format: row.format,
            audioType: row.audioType,
          });

          totalShowtimes++;
        }
        stmt.free();

        // レスポンス形式に変換
        const movies: MovieShowtimes[] = [];
        for (const [movieTitle, theaterMap] of movieMap) {
          const theaters: TheaterShowtimes[] = [];
          for (const [theater, info] of theaterMap) {
            theaters.push({
              theater,
              area: info.area,
              showtimes: info.showtimes,
            });
          }
          movies.push({ movieTitle, theaters });
        }

        const response: GetShowtimesResponse = {
          date,
          areas: areas.length > 0 ? areas : Array.from(foundAreas),
          movieTitle: input.movieTitle ?? null,
          movies,
          stats: {
            totalMovies: movies.length,
            totalTheaters: new Set(movies.flatMap(m => m.theaters.map(t => t.theater))).size,
            totalShowtimes,
          },
        };

        // 結果がない場合
        if (movies.length === 0) {
          return {
            content: [
              {
                type: 'text' as const,
                text: JSON.stringify({
                  error: true,
                  code: 'NO_DATA',
                  message: input.movieTitle
                    ? `「${input.movieTitle}」の上映情報が見つかりません`
                    : `${date}の上映情報が見つかりません`,
                  suggestion: 'スクレイパーを実行してデータを取得してください',
                }),
              },
            ],
            isError: true,
          };
        }

        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify(response, null, 2),
            },
          ],
        };
      } catch (error) {
        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify({
                error: true,
                code: 'QUERY_ERROR',
                message: `クエリ実行エラー: ${error instanceof Error ? error.message : String(error)}`,
              }),
            },
          ],
          isError: true,
        };
      }
    }
  );
}
