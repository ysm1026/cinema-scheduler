import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { Database } from 'sql.js';
import {
  optimizeSchedule,
  type Showtime,
  type OptimizeResult,
} from '../services/optimizer-service.js';

/**
 * 今日の日付をYYYY-MM-DD形式で取得
 */
function getTodayDate(): string {
  const now = new Date();
  return now.toISOString().split('T')[0]!;
}

/**
 * パラメータスキーマ
 */
const inputSchema = z.object({
  movieTitles: z
    .array(z.string())
    .min(1)
    .describe('観たい映画のタイトルリスト（優先順）'),
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'YYYY-MM-DD形式で指定してください')
    .optional()
    .describe('日付（YYYY-MM-DD、省略時は今日）'),
  areas: z
    .array(z.string())
    .min(1)
    .describe('エリア名リスト（複数指定可）'),
  timeRange: z
    .object({
      start: z.string().regex(/^\d{2}:\d{2}$/, 'HH:mm形式').describe('開始時刻'),
      end: z.string().regex(/^\d{2}:\d{2}$/, 'HH:mm形式').describe('終了時刻'),
    })
    .optional()
    .describe('希望時間帯'),
  bufferMinutes: z
    .number()
    .int()
    .min(0)
    .max(120)
    .optional()
    .default(30)
    .describe('映画間の休憩時間（分、デフォルト30）'),
  preferPremium: z
    .boolean()
    .optional()
    .default(false)
    .describe('IMAX/Dolby等を優先するか'),
});

type Input = z.infer<typeof inputSchema>;

/**
 * optimize_scheduleツールを登録する
 */
export function registerOptimizeSchedule(server: McpServer, db: Database): void {
  server.tool(
    'optimize_schedule',
    '複数の映画を効率よく観るためのスケジュールを最適化する',
    inputSchema.shape,
    async (input: Input) => {
      const {
        movieTitles,
        areas,
        timeRange,
        bufferMinutes = 30,
        preferPremium = false,
      } = input;
      const date = input.date ?? getTodayDate();

      // 上映データを取得（複数エリア対応）
      const placeholders = areas.map(() => '?').join(', ');
      const query = `
        SELECT
          m.title as movieTitle,
          t.name as theater,
          t.area as area,
          s.start_time as startTime,
          s.end_time as endTime,
          s.format
        FROM showtimes s
        JOIN theaters t ON s.theater_id = t.id
        JOIN movies m ON s.movie_id = m.id
        WHERE s.date = ? AND t.area IN (${placeholders})
        ORDER BY s.start_time
      `;

      try {
        const stmt = db.prepare(query);
        stmt.bind([date, ...areas]);

        const showtimes: Showtime[] = [];
        while (stmt.step()) {
          const row = stmt.getAsObject() as {
            movieTitle: string;
            theater: string;
            area: string;
            startTime: string;
            endTime: string;
            format: string | null;
          };
          showtimes.push({
            movieTitle: row.movieTitle,
            theater: row.theater,
            startTime: row.startTime,
            endTime: row.endTime,
            format: row.format,
          });
        }
        stmt.free();

        if (showtimes.length === 0) {
          return {
            content: [
              {
                type: 'text' as const,
                text: JSON.stringify({
                  error: true,
                  code: 'NO_DATA',
                  message: `${areas.join(', ')}の${date}のデータが見つかりません`,
                  suggestion:
                    'スクレイパーを実行してデータを取得してください',
                }),
              },
            ],
            isError: true,
          };
        }

        // スケジュール最適化
        const optimizeOptions = {
          movieTitles,
          showtimes,
          bufferMinutes,
          preferPremium,
          ...(timeRange && { timeRange: { start: timeRange.start, end: timeRange.end } }),
        };
        const result: OptimizeResult = optimizeSchedule(optimizeOptions);

        // 候補がない場合
        if (result.candidates.length === 0) {
          return {
            content: [
              {
                type: 'text' as const,
                text: JSON.stringify({
                  error: true,
                  code: 'NO_SCHEDULE',
                  message: '条件に合うスケジュールが見つかりませんでした',
                  suggestion: '時間帯を広げるか、映画の数を減らしてください',
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
              text: JSON.stringify(result, null, 2),
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
                code: 'OPTIMIZE_ERROR',
                message: `最適化エラー: ${error instanceof Error ? error.message : String(error)}`,
              }),
            },
          ],
          isError: true,
        };
      }
    }
  );
}
