# Technology Stack

## Architecture

**pnpm workspaces + Turborepo**によるモノレポ構成。MCPサーバー、スクレイパー、共有ライブラリ、Cronジョブ、デバッグUIの5パッケージ。

### ローカル環境（現行）
```
┌─────────────────┐    ┌─────────────────┐
│ Claude Desktop  │◄───│   MCP Server    │ (stdio)
└─────────────────┘    └────────┬────────┘
                                │
                       ┌────────▼────────┐
                       │    sql.js DB    │ (~/.cinema-scheduler/data.db)
                       └────────▲────────┘
                                │
┌─────────────────┐    ┌────────┴────────┐    ┌─────────────────┐
│   eiga.com      │◄───│    Scraper      │◄───│      Cron       │
└─────────────────┘    └─────────────────┘    └────────┬────────┘
                                                       │
                                              ┌────────▼────────┐
                                              │ Google Sheets   │
                                              └─────────────────┘
```

### Cloud Run 環境（本番稼働中）
```
┌─────────────────┐    ┌─────────────────┐
│ Public Clients  │───►│ Cloud Run Svc   │ (HTTP/Express + StreamableHTTPServerTransport)
└─────────────────┘    └────────┬────────┘
                                │
                       ┌────────▼────────┐
                       │  GCS → sql.js   │ (data.db をメモリに展開、5分間隔で自動リロード)
                       └────────▲────────┘
                                │
┌─────────────────┐    ┌────────┴────────┐    ┌─────────────────┐
│   eiga.com      │◄───│ Cloud Run Job   │◄───│ Cloud Scheduler │
└─────────────────┘    └─────────────────┘    └─────────────────┘
```
**デュアルエントリーポイントパターン**: `server.ts`（stdio）と `handler.ts`（HTTP）でトランスポートのみ分離。ツール登録ロジック（`registerTools`）は共有。
**GCS 自動リロード**: `createGcsAutoReloadProxy` で generation ベースの変更検知 + Proxy パターンで DB を透過的に入れ替え。

## Core Technologies

- **Language**: TypeScript (strict mode)
- **Runtime**: Node.js 20+
- **Package Manager**: pnpm 9+ with workspaces
- **Build**: Turborepo for parallel builds
- **Database**: sql.js (SQLite in-memory/file)
- **Scraping**: Playwright (Chromium)
- **MCP**: @modelcontextprotocol/sdk

## Packages

| Package | Purpose |
|---------|---------|
| `@cinema-scheduler/mcp` | MCPサーバー（Claude Desktop連携） |
| `@cinema-scheduler/scraper` | eiga.comスクレイパー |
| `@cinema-scheduler/shared` | DB接続・型定義・マイグレーション |
| `@cinema-scheduler/cron` | 定期実行（スクレイピング + Googleスプレッドシート連携） |
| `@cinema-scheduler/inspector` | MCPデバッグ用WebUI |

## Development Standards

### Type Safety
- TypeScript strict mode
- Zod for runtime validation (MCP tool parameters)
- 明示的な型定義（スクレイピングデータ構造）

### Code Quality
- ESLint + Prettier
- Vitest for testing
- 明確なパッケージ分離

### Testing
- Vitest（単体テスト）
- スクレイピング結果のパーステスト
- 最適化ロジックの単体テスト

## Development Environment

### Required Tools
- Node.js 20+
- pnpm 9+
- Playwright browsers (`pnpm exec playwright install chromium`)

### Common Commands
```bash
pnpm build          # 全パッケージビルド
pnpm test           # 全パッケージテスト
pnpm scrape         # スクレイピング実行
pnpm dev:mcp        # MCPサーバー開発
pnpm dev:inspector  # Inspector WebUI起動
pnpm cron:dev       # Cronジョブ開発（バックグラウンド推奨）
```

## Key Technical Decisions

1. **sql.js採用**: ファイルベースSQLiteをNode.jsで直接操作、ネイティブモジュール不要
2. **eiga.com統合**: 複数映画館チェーンの情報を一元的に取得可能
3. **MCPプロトコル**: Claude Desktopとのネイティブ統合でシームレスな対話体験
4. **モノレポ構成**: 関連パッケージの一元管理と型共有
5. **DB自動リロード**: ローカルは`createAutoReloadProxy`でファイル変更検知、Cloud Run は`createGcsAutoReloadProxy`で GCS generation 変更検知
6. **ローカルタイムゾーン日付処理**: `new Date().toISOString().split('T')[0]`（UTC）ではなく、`getFullYear()/getMonth()/getDate()`でローカル日付を取得（日本時間でのずれを防止）

## Data Storage

- **ローカル**: `~/.cinema-scheduler/data.db`（sql.jsファイルベース）
- **Cloud Run（本番稼働中）**: GCSバケット上の`data.db` → 起動時にダウンロード → sql.jsインメモリ展開 → generation ベースで5分間隔自動リロード
- **Format**: SQLite (via sql.js)
- **Tables**: theaters, movies, showtimes, scrape_logs

## Cloud Run 技術スタック（本番稼働中）

| Technology | Purpose |
|-----------|---------|
| Express ^5 | HTTP サーバー + ミドルウェア |
| StreamableHTTPServerTransport | MCP SDK HTTP トランスポート |
| @google-cloud/storage ^7 | GCS 連携（ADC 自動認証） |
| express-rate-limit ^8 | IP ベースレート制限 |
| Terraform (hashicorp/google) | GCP インフラ定義 |
| GitHub Actions + WIF | CI/CD（Workload Identity Federation） |

### スクレイパー最適化
- **並列実行**: ワーカープール方式（`runConcurrent`）、デフォルト同時実行数3
- **重複スキップ**: 既存データのある映画館をスキップし、スクレイピング時間を短縮
- **タスクタイムアウト**: 個別タスク10分タイムアウト（ワーカーは次タスクへ継続）
- **データ完全性チェック**: GCS アップロード前にエリアカバレッジとショータイム数の減少を検証

---
_Document standards and patterns, not every dependency_
