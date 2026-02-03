import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { Database } from 'sql.js';
import { resolveAreaNames } from '../services/area-resolver.js';

/**
 * パラメータスキーマ
 */
const inputSchema = z.object({
  areas: z
    .array(z.string())
    .optional()
    .describe('エリア名リスト（複数指定可、省略時は全エリア）'),
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'YYYY-MM-DD形式で指定してください')
    .optional()
    .describe('日付（YYYY-MM-DD、省略時は今日）'),
});

type Input = z.infer<typeof inputSchema>;

/**
 * 映画情報
 */
interface MovieInfo {
  title: string;
  theaterCount: number;
  showtimeCount: number;
}

interface ListMoviesResponse {
  date: string;
  areas: string[];
  movies: MovieInfo[];
  totalCount: number;
}

/**
 * 今日の日付をYYYY-MM-DD形式で取得
 */
function getTodayDate(): string {
  const now = new Date();
  return now.toISOString().split('T')[0]!;
}

/**
 * list_moviesツールを登録する
 */
export function registerListMovies(server: McpServer, db: Database): void {
  server.tool(
    'list_movies',
    `【必須】現在上映中の映画一覧を調べるときはこのツールを使用してください。

このツールを使うべき場面:
- 「今やってる映画は？」「上映中の映画を教えて」などの質問
- 特定エリアで見られる映画のリストを確認したいとき`,
    inputSchema.shape,
    async (input: Input) => {
      const date = input.date ?? getTodayDate();
      // エイリアスを解決（日比谷→有楽町など）
      const areas = input.areas ? resolveAreaNames(input.areas) : [];

      let query = `
        SELECT
          m.title,
          COUNT(DISTINCT t.id) as theaterCount,
          COUNT(*) as showtimeCount
        FROM showtimes s
        JOIN movies m ON s.movie_id = m.id
        JOIN theaters t ON s.theater_id = t.id
        WHERE s.date = ?
      `;
      const params: string[] = [date];

      if (areas.length > 0) {
        const placeholders = areas.map(() => '?').join(', ');
        query += ` AND t.area IN (${placeholders})`;
        params.push(...areas);
      }

      query += ' GROUP BY m.id ORDER BY theaterCount DESC, m.title';

      try {
        const stmt = db.prepare(query);
        stmt.bind(params);

        const movies: MovieInfo[] = [];
        const foundAreas = new Set<string>();

        while (stmt.step()) {
          const row = stmt.getAsObject() as {
            title: string;
            theaterCount: number;
            showtimeCount: number;
          };
          movies.push({
            title: row.title,
            theaterCount: row.theaterCount,
            showtimeCount: row.showtimeCount,
          });
        }
        stmt.free();

        // エリア情報を取得（全エリアモードの場合）
        if (areas.length === 0 && movies.length > 0) {
          const areaQuery = `SELECT DISTINCT area FROM theaters`;
          const areaStmt = db.prepare(areaQuery);
          while (areaStmt.step()) {
            const row = areaStmt.getAsObject() as { area: string };
            foundAreas.add(row.area);
          }
          areaStmt.free();
        }

        // 結果がない場合
        if (movies.length === 0) {
          return {
            content: [
              {
                type: 'text' as const,
                text: JSON.stringify({
                  error: true,
                  code: 'NO_DATA',
                  message: areas.length > 0
                    ? `${areas.join(', ')}の${date}に上映中の映画が見つかりません`
                    : `${date}に上映中の映画が見つかりません`,
                  suggestion: 'スクレイパーを実行してデータを取得してください',
                }),
              },
            ],
            isError: true,
          };
        }

        const response: ListMoviesResponse = {
          date,
          areas: areas.length > 0 ? areas : Array.from(foundAreas),
          movies,
          totalCount: movies.length,
        };

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
