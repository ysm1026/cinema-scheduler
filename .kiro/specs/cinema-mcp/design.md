# Cinema Scheduler MCP - 技術設計書

## 1. 技術スタック

### 1.1 共通
| カテゴリ | 技術 | バージョン | 用途 |
|---------|------|-----------|------|
| 言語 | TypeScript | 5.x | 全コンポーネント |
| ランタイム | Node.js | 20+ | 実行環境 |
| DB | SQLite | 3.x | データ永続化 |
| ORM | better-sqlite3 | 11.x | 同期的SQLite操作 |
| バリデーション | zod | 3.x | スキーマ検証 |

### 1.2 cinema-scraper
| カテゴリ | 技術 | 用途 |
|---------|------|------|
| スクレイピング | Playwright | ブラウザ自動化 |
| CLI | commander | コマンドライン引数 |
| ロギング | pino | 構造化ログ |

### 1.3 cinema-mcp
| カテゴリ | 技術 | 用途 |
|---------|------|------|
| MCP SDK | @modelcontextprotocol/sdk | MCPサーバー実装 |
| 通信 | stdio | Claude Desktopとの通信 |

### 1.4 cinema-inspector
| カテゴリ | 技術 | 用途 |
|---------|------|------|
| フレームワーク | Hono | 軽量Webフレームワーク |
| テンプレート | hono/html | HTMLテンプレート |
| MCP Client | @modelcontextprotocol/sdk | MCPクライアント実装 |

---

## 2. ディレクトリ構成

```
cinema-scheduler/
├── packages/
│   ├── shared/                    # 共有モジュール
│   │   ├── src/
│   │   │   ├── db/
│   │   │   │   ├── schema.ts      # SQLiteスキーマ定義
│   │   │   │   ├── connection.ts  # DB接続管理
│   │   │   │   └── migrations/    # マイグレーション
│   │   │   ├── types/
│   │   │   │   ├── movie.ts       # 映画関連型定義
│   │   │   │   ├── theater.ts     # 映画館関連型定義
│   │   │   │   └── showtime.ts    # 上映時間関連型定義
│   │   │   └── index.ts
│   │   └── package.json
│   │
│   ├── scraper/                   # cinema-scraper
│   │   ├── src/
│   │   │   ├── cli.ts             # CLIエントリポイント
│   │   │   ├── scraper/
│   │   │   │   ├── eigacom.ts     # eiga.comスクレイパー
│   │   │   │   ├── parser.ts      # HTML解析
│   │   │   │   └── areas.ts       # エリア定義
│   │   │   ├── repository/
│   │   │   │   ├── theater.ts     # 映画館リポジトリ
│   │   │   │   ├── movie.ts       # 映画リポジトリ
│   │   │   │   └── showtime.ts    # 上映時間リポジトリ
│   │   │   └── index.ts
│   │   └── package.json
│   │
│   ├── mcp/                       # cinema-mcp
│   │   ├── src/
│   │   │   ├── server.ts          # MCPサーバーエントリ
│   │   │   ├── tools/
│   │   │   │   ├── get-showtimes.ts
│   │   │   │   ├── optimize-schedule.ts
│   │   │   │   ├── list-theaters.ts
│   │   │   │   ├── list-movies.ts
│   │   │   │   └── get-data-status.ts
│   │   │   ├── services/
│   │   │   │   ├── showtime-service.ts
│   │   │   │   └── optimizer-service.ts
│   │   │   └── index.ts
│   │   └── package.json
│   │
│   └── inspector/                 # cinema-inspector
│       ├── src/
│       │   ├── server.ts          # Webサーバーエントリ
│       │   ├── routes/
│       │   │   ├── index.ts       # ルート定義
│       │   │   ├── tools.ts       # ツール実行API
│       │   │   └── history.ts     # 履歴API
│       │   ├── mcp-client.ts      # MCPクライアント
│       │   ├── views/
│       │   │   ├── layout.ts      # 共通レイアウト
│       │   │   ├── home.ts        # ホーム画面
│       │   │   └── tool.ts        # ツール実行画面
│       │   └── index.ts
│       └── package.json
│
├── data/                          # ローカル開発用データ
│   └── .gitkeep
├── package.json                   # ワークスペース設定
├── tsconfig.base.json            # 共通TypeScript設定
└── turbo.json                    # Turborepo設定
```

---

## 3. データベース設計

### 3.1 ER図

```
┌─────────────┐       ┌─────────────┐
│  theaters   │       │   movies    │
├─────────────┤       ├─────────────┤
│ id (PK)     │       │ id (PK)     │
│ name        │       │ title       │
│ area        │       │ runtime_min │
│ chain       │       └──────┬──────┘
└──────┬──────┘              │
       │                     │
       │    ┌────────────────┴────────────────┐
       │    │           showtimes             │
       │    ├─────────────────────────────────┤
       └────┤ id (PK)                         │
            │ theater_id (FK) ────────────────┘
            │ movie_id (FK)
            │ date
            │ start_time
            │ end_time
            │ format
            └─────────────────────────────────┘

┌─────────────────┐
│   scrape_log    │
├─────────────────┤
│ id (PK)         │
│ area            │
│ scraped_at      │
│ showtime_count  │
│ error           │
└─────────────────┘
```

### 3.2 インデックス設計

```sql
-- 上映スケジュール検索用
CREATE INDEX idx_showtimes_date ON showtimes(date);
CREATE INDEX idx_showtimes_theater_date ON showtimes(theater_id, date);
CREATE INDEX idx_showtimes_movie_date ON showtimes(movie_id, date);

-- 映画館検索用
CREATE INDEX idx_theaters_area ON theaters(area);

-- 映画タイトル検索用
CREATE INDEX idx_movies_title ON movies(title);

-- スクレイピングログ検索用
CREATE INDEX idx_scrape_log_area_time ON scrape_log(area, scraped_at DESC);
```

### 3.3 データベース接続管理

```typescript
// packages/shared/src/db/connection.ts

import Database from 'better-sqlite3';
import { existsSync, mkdirSync } from 'fs';
import { dirname, join } from 'path';
import { homedir } from 'os';

const DB_DIR = join(homedir(), '.cinema-scheduler');
const DB_PATH = join(DB_DIR, 'data.db');

export function getDatabase(options?: { readonly?: boolean }): Database.Database {
  // ディレクトリ作成
  if (!existsSync(DB_DIR)) {
    mkdirSync(DB_DIR, { recursive: true });
  }

  const db = new Database(DB_PATH, {
    readonly: options?.readonly ?? false,
  });

  // WALモード有効化（書き込み時のみ）
  if (!options?.readonly) {
    db.pragma('journal_mode = WAL');
  }

  // 外部キー制約有効化
  db.pragma('foreign_keys = ON');

  return db;
}
```

---

## 4. コンポーネント詳細設計

### 4.1 cinema-scraper

#### 4.1.1 クラス図

```
┌─────────────────────────────────┐
│          ScraperCLI             │
├─────────────────────────────────┤
│ + run(args: string[]): void     │
└──────────────┬──────────────────┘
               │ uses
               ▼
┌─────────────────────────────────┐
│        EigacomScraper           │
├─────────────────────────────────┤
│ - browser: Browser              │
│ - page: Page                    │
├─────────────────────────────────┤
│ + scrapeArea(area, date): []    │
│ - parseSchedulePage(): []       │
│ - extractShowtimes(el): []      │
└──────────────┬──────────────────┘
               │ uses
               ▼
┌─────────────────────────────────┐
│       ShowtimeRepository        │
├─────────────────────────────────┤
│ - db: Database                  │
├─────────────────────────────────┤
│ + upsertShowtimes(data): void   │
│ + deleteOldData(before): void   │
└─────────────────────────────────┘
```

#### 4.1.2 スクレイピングフロー

```
┌──────┐    ┌─────────────┐    ┌──────────────┐    ┌────────┐
│ CLI  │───▶│  Scraper    │───▶│   Parser     │───▶│  DB    │
└──────┘    └─────────────┘    └──────────────┘    └────────┘
   │              │                   │                 │
   │  args        │  fetch page       │  parse HTML     │  upsert
   │──────────────▶──────────────────▶────────────────▶│
   │              │                   │                 │
   │              │  for each area    │                 │
   │              │◀─────────────────▶│                 │
   │              │                   │                 │
   │  log result  │                   │                 │
   │◀─────────────│                   │                 │
```

#### 4.1.3 エリアコード定義

```typescript
// packages/scraper/src/scraper/areas.ts

export const AREA_CODES: Record<string, string> = {
  '新宿': 'A1301108',
  '渋谷': 'A1303101',
  '池袋': 'A1301102',
  '上野': 'A1301110',
  '銀座': 'A1301105',
  '日比谷': 'A1301101',
  '六本木': 'A1303201',
  '品川': 'A1301111',
  '有楽町': 'A1301104',
  '二子玉川': 'A1303501',
};

export type AreaName = keyof typeof AREA_CODES;
```

---

### 4.2 cinema-mcp

#### 4.2.1 MCPサーバー構成

```
┌─────────────────────────────────────────────┐
│              Claude Desktop                  │
└─────────────────┬───────────────────────────┘
                  │ stdio (JSON-RPC)
                  ▼
┌─────────────────────────────────────────────┐
│              MCP Server                      │
├─────────────────────────────────────────────┤
│  ┌─────────────────────────────────────┐    │
│  │          Tool Registry              │    │
│  ├─────────────────────────────────────┤    │
│  │ - get_showtimes                     │    │
│  │ - optimize_schedule                 │    │
│  │ - list_theaters                     │    │
│  │ - list_movies                       │    │
│  │ - get_data_status                   │    │
│  └─────────────────────────────────────┘    │
│                    │                         │
│                    ▼                         │
│  ┌─────────────────────────────────────┐    │
│  │          Services                    │    │
│  ├─────────────────────────────────────┤    │
│  │ - ShowtimeService                   │    │
│  │ - OptimizerService                  │    │
│  └─────────────────────────────────────┘    │
│                    │                         │
│                    ▼                         │
│  ┌─────────────────────────────────────┐    │
│  │       Database (Read Only)          │    │
│  └─────────────────────────────────────┘    │
└─────────────────────────────────────────────┘
```

#### 4.2.2 MCPサーバー実装

```typescript
// packages/mcp/src/server.ts

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { getDatabase } from '@cinema-scheduler/shared';
import { registerTools } from './tools/index.js';

async function main() {
  const db = getDatabase({ readonly: true });

  const server = new McpServer({
    name: 'cinema-scheduler',
    version: '1.0.0',
  });

  // ツール登録
  registerTools(server, db);

  // stdio通信開始
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch(console.error);
```

#### 4.2.3 ツール定義例

```typescript
// packages/mcp/src/tools/get-showtimes.ts

import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type Database from 'better-sqlite3';

const inputSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  area: z.string().optional(),
  theater: z.string().optional(),
  movieTitle: z.string().optional(),
});

export function registerGetShowtimes(server: McpServer, db: Database.Database) {
  server.tool(
    'get_showtimes',
    '映画館の上映スケジュールを取得する',
    inputSchema,
    async (input) => {
      const { date, area, theater, movieTitle } = input;

      // クエリ構築
      let query = `
        SELECT
          t.name as theater,
          t.area,
          m.title as movieTitle,
          s.start_time as startTime,
          s.end_time as endTime,
          m.runtime_minutes as durationMinutes,
          s.format
        FROM showtimes s
        JOIN theaters t ON s.theater_id = t.id
        JOIN movies m ON s.movie_id = m.id
        WHERE 1=1
      `;
      const params: Record<string, string> = {};

      if (date) {
        query += ' AND s.date = :date';
        params.date = date;
      }
      if (area) {
        query += ' AND t.area = :area';
        params.area = area;
      }
      if (theater) {
        query += ' AND t.name LIKE :theater';
        params.theater = `%${theater}%`;
      }
      if (movieTitle) {
        query += ' AND m.title LIKE :movieTitle';
        params.movieTitle = `%${movieTitle}%`;
      }

      query += ' ORDER BY s.start_time';

      const results = db.prepare(query).all(params);

      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            date: date ?? new Date().toISOString().split('T')[0],
            area: area ?? 'all',
            results,
            totalCount: results.length,
          }, null, 2),
        }],
      };
    }
  );
}
```

#### 4.2.4 スケジュール最適化アルゴリズム

```typescript
// packages/mcp/src/services/optimizer-service.ts

interface Showtime {
  movieTitle: string;
  theater: string;
  startTime: string;  // HH:mm
  endTime: string;    // HH:mm
  format: string | null;
}

interface OptimizeOptions {
  movieTitles: string[];
  showtimes: Showtime[];
  timeRange?: { start: string; end: string };
  bufferMinutes: number;
  preferPremium: boolean;
}

interface ScheduleItem {
  order: number;
  movieTitle: string;
  theater: string;
  startTime: string;
  endTime: string;
  durationMinutes: number;
  format: string | null;
  breakMinutesBefore: number;
}

export function optimizeSchedule(options: OptimizeOptions): {
  schedule: ScheduleItem[];
  excluded: Array<{ title: string; reason: string }>;
  stats: {
    totalMovies: number;
    totalWatchTimeMinutes: number;
    totalBreakTimeMinutes: number;
    premiumCount: number;
  };
} {
  const { movieTitles, showtimes, timeRange, bufferMinutes, preferPremium } = options;

  // 1. 各映画の候補上映時間を収集
  const candidates = new Map<string, Showtime[]>();
  for (const title of movieTitles) {
    const matches = showtimes.filter(s =>
      s.movieTitle.includes(title) || title.includes(s.movieTitle)
    );
    candidates.set(title, matches);
  }

  // 2. 貪欲法でスケジュール構築
  const schedule: ScheduleItem[] = [];
  const excluded: Array<{ title: string; reason: string }> = [];
  let currentEndTime = timeRange?.start ?? '00:00';

  for (const title of movieTitles) {
    const movieShowtimes = candidates.get(title) ?? [];

    if (movieShowtimes.length === 0) {
      excluded.push({ title, reason: 'not_found' });
      continue;
    }

    // プレミアム優先ソート
    if (preferPremium) {
      movieShowtimes.sort((a, b) => {
        const aIsPremium = a.format !== null;
        const bIsPremium = b.format !== null;
        return bIsPremium ? 1 : aIsPremium ? -1 : 0;
      });
    }

    // 時間的に可能な上映を探す
    const minStartTime = addMinutes(currentEndTime, bufferMinutes);
    const validShowtimes = movieShowtimes.filter(s => {
      if (s.startTime < minStartTime) return false;
      if (timeRange?.end && s.endTime > timeRange.end) return false;
      return true;
    });

    if (validShowtimes.length === 0) {
      excluded.push({ title, reason: 'time_conflict' });
      continue;
    }

    // 最も早い上映を選択
    const selected = validShowtimes.sort((a, b) =>
      a.startTime.localeCompare(b.startTime)
    )[0];

    const breakMinutes = schedule.length === 0
      ? 0
      : diffMinutes(currentEndTime, selected.startTime);

    schedule.push({
      order: schedule.length + 1,
      movieTitle: selected.movieTitle,
      theater: selected.theater,
      startTime: selected.startTime,
      endTime: selected.endTime,
      durationMinutes: diffMinutes(selected.startTime, selected.endTime),
      format: selected.format,
      breakMinutesBefore: breakMinutes,
    });

    currentEndTime = selected.endTime;
  }

  // 3. 統計計算
  const totalWatchTime = schedule.reduce((sum, s) => sum + s.durationMinutes, 0);
  const totalBreakTime = schedule.reduce((sum, s) => sum + s.breakMinutesBefore, 0);
  const premiumCount = schedule.filter(s => s.format !== null).length;

  return {
    schedule,
    excluded,
    stats: {
      totalMovies: schedule.length,
      totalWatchTimeMinutes: totalWatchTime,
      totalBreakTimeMinutes: totalBreakTime,
      premiumCount,
    },
  };
}

function addMinutes(time: string, minutes: number): string {
  const [h, m] = time.split(':').map(Number);
  const totalMinutes = h * 60 + m + minutes;
  return `${Math.floor(totalMinutes / 60).toString().padStart(2, '0')}:${(totalMinutes % 60).toString().padStart(2, '0')}`;
}

function diffMinutes(from: string, to: string): number {
  const [h1, m1] = from.split(':').map(Number);
  const [h2, m2] = to.split(':').map(Number);
  return (h2 * 60 + m2) - (h1 * 60 + m1);
}
```

---

### 4.3 cinema-inspector

#### 4.3.1 アーキテクチャ

```
┌─────────────────────────────────────────────┐
│              Browser (WebUI)                 │
└─────────────────┬───────────────────────────┘
                  │ HTTP
                  ▼
┌─────────────────────────────────────────────┐
│           Hono Web Server                    │
├─────────────────────────────────────────────┤
│  Routes:                                     │
│  - GET  /                 → ホーム画面       │
│  - GET  /tools            → ツール一覧       │
│  - GET  /tools/:name      → ツール詳細       │
│  - POST /api/tools/:name  → ツール実行       │
│  - GET  /api/history      → 履歴取得         │
│  - GET  /api/status       → DB状態           │
└─────────────────┬───────────────────────────┘
                  │ stdio
                  ▼
┌─────────────────────────────────────────────┐
│           MCP Client                         │
├─────────────────────────────────────────────┤
│  - cinema-mcp を子プロセスとして起動         │
│  - JSON-RPC で通信                           │
└─────────────────────────────────────────────┘
```

#### 4.3.2 MCPクライアント実装

```typescript
// packages/inspector/src/mcp-client.ts

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { spawn } from 'child_process';

export class McpClientWrapper {
  private client: Client | null = null;
  private transport: StdioClientTransport | null = null;

  async connect(): Promise<void> {
    const serverProcess = spawn('node', [
      '../mcp/dist/server.js'
    ], {
      stdio: ['pipe', 'pipe', 'inherit'],
    });

    this.transport = new StdioClientTransport({
      reader: serverProcess.stdout,
      writer: serverProcess.stdin,
    });

    this.client = new Client({
      name: 'cinema-inspector',
      version: '1.0.0',
    });

    await this.client.connect(this.transport);
  }

  async listTools(): Promise<Tool[]> {
    if (!this.client) throw new Error('Not connected');
    const result = await this.client.listTools();
    return result.tools;
  }

  async callTool(name: string, args: Record<string, unknown>): Promise<unknown> {
    if (!this.client) throw new Error('Not connected');
    const result = await this.client.callTool({ name, arguments: args });
    return result;
  }

  async disconnect(): Promise<void> {
    await this.transport?.close();
    this.client = null;
    this.transport = null;
  }
}
```

#### 4.3.3 Web画面設計

**ホーム画面 (`/`)**
```
┌─────────────────────────────────────────────────────────┐
│  Cinema Scheduler Inspector                              │
├─────────────────────────────────────────────────────────┤
│                                                          │
│  📊 データ状態                                           │
│  ┌─────────────────────────────────────────────────────┐│
│  │ 最終スクレイピング: 2026-01-29 05:00:00             ││
│  │ エリア数: 10 | 映画館数: 83 | 上映データ数: 5420    ││
│  │ データ期間: 2026-01-29 〜 2026-02-05                ││
│  └─────────────────────────────────────────────────────┘│
│                                                          │
│  🔧 利用可能なツール                                     │
│  ┌──────────────────┐ ┌──────────────────┐              │
│  │ get_showtimes    │ │ optimize_schedule │              │
│  │ 上映スケジュール取得│ │ スケジュール最適化│              │
│  └──────────────────┘ └──────────────────┘              │
│  ┌──────────────────┐ ┌──────────────────┐              │
│  │ list_theaters    │ │ list_movies      │              │
│  │ 映画館一覧取得    │ │ 映画一覧取得     │              │
│  └──────────────────┘ └──────────────────┘              │
│                                                          │
└─────────────────────────────────────────────────────────┘
```

**ツール実行画面 (`/tools/:name`)**
```
┌─────────────────────────────────────────────────────────┐
│  get_showtimes                                           │
├─────────────────────────────────────────────────────────┤
│                                                          │
│  📝 パラメータ                                           │
│  ┌─────────────────────────────────────────────────────┐│
│  │ date:       [2026-01-29        ]                    ││
│  │ area:       [新宿 ▼            ]                    ││
│  │ theater:    [                  ]                    ││
│  │ movieTitle: [                  ]                    ││
│  │                                                      ││
│  │              [実行]                                  ││
│  └─────────────────────────────────────────────────────┘│
│                                                          │
│  📤 リクエスト                                           │
│  ┌─────────────────────────────────────────────────────┐│
│  │ { "date": "2026-01-29", "area": "新宿" }            ││
│  └─────────────────────────────────────────────────────┘│
│                                                          │
│  📥 レスポンス                                           │
│  ┌─────────────────────────────────────────────────────┐│
│  │ {                                                    ││
│  │   "date": "2026-01-29",                              ││
│  │   "area": "新宿",                                    ││
│  │   "results": [ ... ],                                ││
│  │   "totalCount": 26                                   ││
│  │ }                                                    ││
│  └─────────────────────────────────────────────────────┘│
│                                                          │
└─────────────────────────────────────────────────────────┘
```

---

## 5. Claude Desktop統合

### 5.1 設定ファイル

```json
// ~/Library/Application Support/Claude/claude_desktop_config.json

{
  "mcpServers": {
    "cinema-scheduler": {
      "command": "node",
      "args": [
        "/path/to/cinema-scheduler/packages/mcp/dist/server.js"
      ],
      "env": {}
    }
  }
}
```

### 5.2 ユーザー操作フロー

```
┌────────────────────────────────────────────────────────────┐
│ User: 新宿で今日、ズートピア2とシャドウズ・エッジを        │
│       観たいんだけど、最適なスケジュールを教えて           │
└────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌────────────────────────────────────────────────────────────┐
│ Claude: optimize_schedule ツールを呼び出します              │
│                                                             │
│ {                                                           │
│   "movieTitles": ["ズートピア2", "シャドウズ・エッジ"],    │
│   "date": "2026-01-29",                                     │
│   "area": "新宿",                                           │
│   "bufferMinutes": 30                                       │
│ }                                                           │
└────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌────────────────────────────────────────────────────────────┐
│ Claude: 最適なスケジュールが見つかりました！               │
│                                                             │
│ 1. 11:00〜12:48 ズートピア2（新宿バルト9）                 │
│    ↓ 52分の休憩                                            │
│ 2. 13:40〜15:51 シャドウズ・エッジ（新宿バルト9）          │
│                                                             │
│ 合計鑑賞時間: 4時間19分                                    │
│ 休憩時間: 52分                                              │
└────────────────────────────────────────────────────────────┘
```

---

## 6. エラーハンドリング

### 6.1 エラー分類

| エラータイプ | 発生箇所 | 対処方法 |
|-------------|---------|---------|
| DB接続エラー | 全コンポーネント | ログ出力 + 適切なエラーメッセージ返却 |
| スクレイピングエラー | scraper | リトライ + エラーログ記録 |
| ツール引数エラー | mcp | Zodバリデーションエラー返却 |
| データなしエラー | mcp | 空配列 + メッセージ返却 |

### 6.2 MCPエラーレスポンス形式

```typescript
// エラー時のレスポンス
{
  content: [{
    type: 'text',
    text: JSON.stringify({
      error: true,
      code: 'NO_DATA',
      message: '指定されたエリアのデータが見つかりません',
      suggestion: 'スクレイパーを実行してデータを取得してください',
    }),
  }],
  isError: true,
}
```

---

## 7. テスト戦略

### 7.1 テスト構成

| レイヤー | テスト種別 | ツール |
|---------|-----------|-------|
| 単体テスト | ユニットテスト | Vitest |
| 統合テスト | DB操作テスト | Vitest + SQLite |
| E2Eテスト | MCPツールテスト | Vitest + MCP Client |

### 7.2 テストディレクトリ構成

```
packages/
├── shared/
│   └── src/
│       └── __tests__/
│           └── db.test.ts
├── scraper/
│   └── src/
│       └── __tests__/
│           ├── parser.test.ts
│           └── repository.test.ts
├── mcp/
│   └── src/
│       └── __tests__/
│           ├── tools/
│           │   ├── get-showtimes.test.ts
│           │   └── optimize-schedule.test.ts
│           └── services/
│               └── optimizer.test.ts
└── inspector/
    └── src/
        └── __tests__/
            └── routes.test.ts
```

---

## 8. デプロイメント

### 8.1 ビルド手順

```bash
# 依存関係インストール
pnpm install

# 全パッケージビルド
pnpm build

# または個別ビルド
pnpm --filter @cinema-scheduler/scraper build
pnpm --filter @cinema-scheduler/mcp build
pnpm --filter @cinema-scheduler/inspector build
```

### 8.2 スクレイパー定期実行設定（macOS）

```xml
<!-- ~/Library/LaunchAgents/com.cinema-scheduler.scraper.plist -->
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>com.cinema-scheduler.scraper</string>
    <key>ProgramArguments</key>
    <array>
        <string>/usr/local/bin/node</string>
        <string>/path/to/cinema-scheduler/packages/scraper/dist/cli.js</string>
        <string>--all-areas</string>
    </array>
    <key>StartCalendarInterval</key>
    <dict>
        <key>Hour</key>
        <integer>5</integer>
        <key>Minute</key>
        <integer>0</integer>
    </dict>
    <key>StandardOutPath</key>
    <string>/Users/username/.cinema-scheduler/scraper.log</string>
    <key>StandardErrorPath</key>
    <string>/Users/username/.cinema-scheduler/scraper-error.log</string>
</dict>
</plist>
```

### 8.3 Claude Desktop設定

```bash
# 設定ファイルの場所
# macOS: ~/Library/Application Support/Claude/claude_desktop_config.json

# MCPサーバー追加
{
  "mcpServers": {
    "cinema-scheduler": {
      "command": "node",
      "args": ["/absolute/path/to/packages/mcp/dist/server.js"]
    }
  }
}
```
