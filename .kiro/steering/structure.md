# Project Structure

## Organization Philosophy

**pnpm workspaces + Turborepo**によるモノレポ構成。機能ごとにパッケージを分離し、共有型定義は`shared`パッケージに集約。

## Package Patterns

### MCP Server (`packages/mcp/`)
**Purpose**: Claude Desktop向けMCPサーバー
**Pattern**: ツールごとにファイル分離、サービス層で複雑なロジックを実装
```
src/
├── server.ts              # MCPサーバーエントリーポイント
├── tools/                 # MCPツール定義
│   ├── list-movies.ts
│   ├── list-theaters.ts
│   ├── get-showtimes.ts
│   └── optimize-schedule.ts
└── services/              # ビジネスロジック
    ├── optimizer-service.ts
    └── title-matcher.ts
```

### Scraper (`packages/scraper/`)
**Purpose**: eiga.comからの上映情報スクレイピング
**Pattern**: パーサーとリポジトリを分離、設定はYAMLファイル
```
src/
├── cli.ts                 # CLIエントリーポイント
├── config.ts              # 設定読み込み
├── scraper/
│   ├── eigacom.ts         # eiga.comスクレイパー
│   ├── parser.ts          # HTML解析
│   └── areas.ts           # エリア設定読み込み
└── repository/            # DB操作
    ├── theater.ts
    ├── movie.ts
    └── showtime.ts
config/
└── areas.yaml             # スクレイピング対象エリア設定
```

### Shared (`packages/shared/`)
**Purpose**: パッケージ間共有コード
**Pattern**: 型定義・DB接続・マイグレーションを集約
```
src/
├── types/                 # 共通型定義
│   ├── theater.ts
│   ├── movie.ts
│   └── showtime.ts
└── db/                    # データベース
    ├── connection.ts      # sql.js接続管理
    ├── schema.ts          # テーブル定義
    └── migrations/        # マイグレーション
```

### Inspector (`packages/inspector/`)
**Purpose**: MCPサーバーデバッグ用WebUI
**Pattern**: Honoベースの軽量Webサーバー
```
src/
├── app.ts                 # Honoアプリケーション
├── views/                 # HTMLテンプレート
└── routes/                # ルート定義
```

## Data Structures

### Core Types (shared)
```typescript
interface Theater {
  id: number;
  name: string;
  area: string;
  chain: string | null;
}

interface Movie {
  id: number;
  title: string;
}

interface Showtime {
  id: number;
  theaterId: number;
  movieId: number;
  date: string;        // YYYY-MM-DD
  startTime: string;   // HH:mm
  endTime: string;     // HH:mm
  format: string | null;
}
```

## Naming Conventions

- **Files**: kebab-case (`optimizer-service.ts`)
- **Types/Interfaces**: PascalCase (`Showtime`, `ScheduleResult`)
- **Functions**: camelCase (`optimizeSchedule`, `matchTitle`)
- **Constants**: SCREAMING_SNAKE_CASE (`DEFAULT_BUFFER_MINUTES`)

## Import Organization

```typescript
// 1. External packages
import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

// 2. Workspace packages
import { openDatabase } from '@cinema-scheduler/shared';

// 3. Relative imports
import { matchTitle } from '../services/title-matcher.js';
```

## Code Organization Principles

- MCPツールは1ファイル1ツール（登録関数をエクスポート）
- 複雑なロジックは`services/`に分離
- 型定義は`shared`パッケージに集約
- 設定ファイルはYAML形式で`config/`に配置

---
_Document patterns, not file trees. New files following patterns shouldn't require updates_
