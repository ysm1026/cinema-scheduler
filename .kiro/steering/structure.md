# Project Structure

## Organization Philosophy

**pnpm workspaces + Turborepo**によるモノレポ構成。機能ごとにパッケージを分離し、共有型定義は`shared`パッケージに集約。

## Package Patterns

### MCP Server (`packages/mcp/`)
**Purpose**: Claude Desktop向けMCPサーバー + GCE HTTPS サーバー（本番稼働中）
**Pattern**: ツールごとにファイル分離、`tools/index.ts`で一括登録（`registerTools`パターン）、サービス層で複雑なロジックを実装。デュアルエントリーポイント（stdio / HTTP）でトランスポートのみ分離。
```
src/
├── server.ts              # MCPサーバーエントリーポイント（stdioトランスポート）
├── handler.ts             # GCE用HTTPエントリーポイント（Express + StreamableHTTPServerTransport）
├── middleware/             # Express ミドルウェア
│   ├── auth.ts            # APIキー認証ミドルウェア
│   └── rate-limit.ts      # IPベースレート制限ミドルウェア
├── tools/                 # MCPツール定義（トランスポート非依存）
│   ├── index.ts           # registerTools() - 全ツール一括登録
│   ├── list-movies.ts
│   ├── list-theaters.ts
│   ├── get-showtimes.ts
│   ├── get-data-status.ts # データ状態確認
│   └── optimize-schedule.ts
└── services/              # ビジネスロジック
    ├── optimizer-service.ts
    ├── title-matcher.ts
    └── area-resolver.ts   # エリア名エイリアス解決（埋め込みエイリアスマップ）
```

### Scraper (`packages/scraper/`)
**Purpose**: eiga.com + チェーン公式サイトからの上映情報スクレイピング
**Pattern**: パーサーとリポジトリを分離、設定はYAML/CSV。チェーンスクレイパーは基底クラス + レジストリパターン。
```
src/
├── cli.ts                 # CLIエントリーポイント
├── config.ts              # 設定読み込み
├── scraper/
│   ├── eigacom.ts         # eiga.comスクレイパー（全国384エリア）
│   ├── parser.ts          # HTML解析
│   ├── areas.ts           # エリア設定読み込み
│   ├── chains/            # チェーン公式サイトスクレイパー
│   │   ├── base.ts        # 基底クラス（共通ロジック）
│   │   ├── types.ts       # チェーンスクレイパー型定義
│   │   ├── registry.ts    # チェーンレジストリ（名前→クラスマッピング）
│   │   ├── config-loader.ts # YAML設定読み込み
│   │   ├── cinema-sunshine.ts # Cinema Sunshine スクレイパー
│   │   └── toho.ts        # TOHO シネマズスクレイパー
│   └── master/            # マスターデータ管理
│       └── loader.ts      # theaters.csv ローダー
└── repository/            # DB操作
    ├── index.ts           # リポジトリ一括エクスポート
    ├── theater.ts
    ├── movie.ts
    ├── showtime.ts
    └── scrape-log.ts      # スクレイピングログ記録
config/
├── areas.yaml             # eiga.comスクレイピング対象エリア設定
├── scraper.yaml           # チェーンスクレイパー設定（有効/無効、日数）
└── theaters.csv           # 映画館マスターデータ（チェーン、コード、備考）
```

### Shared (`packages/shared/`)
**Purpose**: パッケージ間共有コード
**Pattern**: 型定義・DB接続・マイグレーションを集約。DB接続は環境に応じて自動切り替え（ローカルファイル / GCS）。
```
src/
├── types/                 # 共通型定義
│   ├── theater.ts
│   ├── movie.ts
│   └── showtime.ts
└── db/                    # データベース
    ├── connection.ts      # sql.js接続管理（openDatabase/saveDatabase/openDatabaseFromGcs）
    ├── gcs-storage.ts     # GCS読み書き抽象化（download/upload/getMetadata）
    ├── schema.ts          # テーブル定義
    └── migrations/        # マイグレーション（連番ファイル: 001_initial, 002_add_audio_type...）
```

### Cron (`packages/cron/`)
**Purpose**: 定期実行ジョブ（スクレイピング + エクスポート）
**Pattern**: ローカル node-cron でスケジュール or 直接実行
```
src/
├── index.ts               # Cronデーモンエントリーポイント（ローカル用）
├── config.ts              # YAML設定読み込み
└── jobs/
    ├── scrape.ts          # ローカルスクレイピングジョブ
    ├── scrape-cloud.ts    # GCS連携スクレイピング（データ完全性チェック付き）
    └── export-sheets.ts   # Googleスプレッドシートエクスポート
config/
├── cron.yaml              # スケジュール・エクスポート設定
└── service-account.json   # Google API認証（gitignore対象）
```

### Inspector (`packages/inspector/`)
**Purpose**: MCPサーバーデバッグ用WebUI
**Pattern**: Honoベースの軽量Webサーバー、MCPクライアント経由でツールを対話的にテスト
```
src/
├── server.ts              # Honoサーバーエントリーポイント + ルート定義
├── mcp-client.ts          # MCPサーバーへのstdioクライアント接続
├── services/
│   └── history-service.ts # ツール実行履歴管理
└── views/                 # HTMLテンプレート（SSR）
    ├── layout.ts
    ├── home.ts
    ├── tool.ts
    └── history.ts
```

### Infrastructure (`infra/`)
**Purpose**: GCPインフラのTerraform定義 + VM運用スクリプト
**Pattern**: フラット構成（リソース数が少ないためモジュール分割しない）。VMスクリプトは `scripts/` に配置。
```
infra/
├── main.tf                # GCE instance, GCS, firewall, Cloud Functions, WIF
├── variables.tf           # パラメータ定義
├── outputs.tf             # 出力値
├── terraform.tfvars       # 環境固有値（gitignore対象外）
├── scripts/
│   ├── startup.sh         # VM初回セットアップ（Node.js, pnpm, Caddy, systemd）
│   ├── deploy.sh          # デプロイスクリプト（git pull + dist展開 + Caddy設定）
│   ├── Caddyfile          # Caddy リバースプロキシ設定テンプレート
│   ├── cinema-mcp.service # MCP サーバー systemd ユニット
│   └── cinema-scraper.*   # スクレイパー systemd ユニット（現在未使用）
└── functions/
    └── budget-shutdown/   # 予算超過時 GCE 停止 Cloud Function
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
  format: ShowtimeFormat;
  audioType: AudioType;  // 'subtitled' | 'dubbed' | null
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
- 設定ファイルはYAML/CSV形式で`config/`に配置
- エントリーポイントはトランスポートのみ担当し、ツール登録ロジック（`registerTools`）を共有
- チェーンスクレイパーは基底クラス + レジストリパターンで拡張可能

---
_Document patterns, not file trees. New files following patterns shouldn't require updates_
_updated_at: 2026-02-25 — GCE インフラ構成、チェーンスクレイパー構造、VM スクリプト構成を反映_
