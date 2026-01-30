import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { Database } from 'sql.js';

/**
 * データ状態レスポンス
 */
interface DataStatusResponse {
  lastScrapedAt: string | null;
  areaCount: number;
  theaterCount: number;
  showtimeCount: number;
  dateRange: {
    from: string | null;
    to: string | null;
  };
}

/**
 * get_data_statusツールを登録する
 */
export function registerGetDataStatus(server: McpServer, db: Database): void {
  server.tool(
    'get_data_status',
    'スクレイピングデータの状態を確認する',
    {},
    async () => {
      try {
        // 最終スクレイピング日時
        const lastScrapedResult = db.exec(
          'SELECT MAX(scraped_at) as last FROM scrape_log'
        );
        const lastScrapedAt =
          (lastScrapedResult[0]?.values[0]?.[0] as string | null) ?? null;

        // エリア数
        const areaCountResult = db.exec(
          'SELECT COUNT(DISTINCT area) as count FROM theaters'
        );
        const areaCount = (areaCountResult[0]?.values[0]?.[0] as number) ?? 0;

        // 映画館数
        const theaterCountResult = db.exec(
          'SELECT COUNT(*) as count FROM theaters'
        );
        const theaterCount =
          (theaterCountResult[0]?.values[0]?.[0] as number) ?? 0;

        // 上映データ数
        const showtimeCountResult = db.exec(
          'SELECT COUNT(*) as count FROM showtimes'
        );
        const showtimeCount =
          (showtimeCountResult[0]?.values[0]?.[0] as number) ?? 0;

        // データ期間
        const dateRangeResult = db.exec(
          'SELECT MIN(date) as min_date, MAX(date) as max_date FROM showtimes'
        );
        const fromDate =
          (dateRangeResult[0]?.values[0]?.[0] as string | null) ?? null;
        const toDate =
          (dateRangeResult[0]?.values[0]?.[1] as string | null) ?? null;

        const response: DataStatusResponse = {
          lastScrapedAt,
          areaCount,
          theaterCount,
          showtimeCount,
          dateRange: {
            from: fromDate,
            to: toDate,
          },
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
