import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { Database } from 'sql.js';

/**
 * パラメータスキーマ
 */
const inputSchema = z.object({
  areas: z
    .array(z.string())
    .optional()
    .describe('エリア名リスト（複数指定可、省略時は全エリア）'),
});

type Input = z.infer<typeof inputSchema>;

/**
 * 映画館情報
 */
interface TheaterInfo {
  name: string;
  area: string;
  chain: string | null;
}

interface ListTheatersResponse {
  areas: string[];
  theaters: TheaterInfo[];
  totalCount: number;
}

/**
 * list_theatersツールを登録する
 */
export function registerListTheaters(server: McpServer, db: Database): void {
  server.tool(
    'list_theaters',
    'エリアの映画館リストを取得する',
    inputSchema.shape,
    async (input: Input) => {
      const areas = input.areas ?? [];

      let query = `
        SELECT name, area, chain
        FROM theaters
      `;
      const params: string[] = [];

      if (areas.length > 0) {
        const placeholders = areas.map(() => '?').join(', ');
        query += ` WHERE area IN (${placeholders})`;
        params.push(...areas);
      }

      query += ' ORDER BY area, name';

      try {
        const stmt = db.prepare(query);
        stmt.bind(params);

        const theaters: TheaterInfo[] = [];
        const foundAreas = new Set<string>();

        while (stmt.step()) {
          const row = stmt.getAsObject() as { name: string; area: string; chain: string | null };
          theaters.push({
            name: row.name,
            area: row.area,
            chain: row.chain,
          });
          foundAreas.add(row.area);
        }
        stmt.free();

        // 結果がない場合
        if (theaters.length === 0) {
          return {
            content: [
              {
                type: 'text' as const,
                text: JSON.stringify({
                  error: true,
                  code: 'NO_DATA',
                  message: areas.length > 0
                    ? `${areas.join(', ')}に映画館が見つかりません`
                    : '映画館データがありません',
                  suggestion: 'スクレイパーを実行してデータを取得してください',
                }),
              },
            ],
            isError: true,
          };
        }

        const response: ListTheatersResponse = {
          areas: areas.length > 0 ? areas : Array.from(foundAreas),
          theaters,
          totalCount: theaters.length,
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
