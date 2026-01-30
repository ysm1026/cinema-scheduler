import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { Database } from 'sql.js';
import { registerGetShowtimes } from './get-showtimes.js';
import { registerListTheaters } from './list-theaters.js';
import { registerListMovies } from './list-movies.js';
import { registerGetDataStatus } from './get-data-status.js';
import { registerOptimizeSchedule } from './optimize-schedule.js';

/**
 * 全ツールをMCPサーバーに登録する
 */
export function registerTools(server: McpServer, db: Database): void {
  registerGetShowtimes(server, db);
  registerListTheaters(server, db);
  registerListMovies(server, db);
  registerGetDataStatus(server, db);
  registerOptimizeSchedule(server, db);
}
