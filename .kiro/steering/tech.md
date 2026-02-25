# Technology Stack

## Architecture

**pnpm workspaces + Turborepo**によるモノレポ構成。MCPサーバー、スクレイパー、共有ライブラリ、Cronジョブ、デバッグUIの5パッケージ。

### GCE 環境（本番稼働中）
```
┌─────────────────┐    ┌───────────┐    ┌─────────────────┐
│ Public Clients  │───►│   Caddy   │───►│  MCP Server     │ (Express + StreamableHTTPServerTransport)
│ (Claude Desktop)│    │  (HTTPS)  │    │  port 8080      │
└─────────────────┘    └───────────┘    └────────┬────────┘
                                                 │
                                        ┌────────▼────────┐
                                        │  GCS → sql.js   │ (data.db を起動時にダウンロード)
                                        └────────▲────────┘
                                                 │
                              ┌──────────────────┘
                              │ GCS upload
┌─────────────────┐    ┌──────┴──────────┐    ┌─────────────────┐
│   eiga.com      │◄───│                 │───►│  TOHO/Sunshine  │
│   (384 areas)   │    │  Local Scraper  │    │  (公式サイト)     │
└─────────────────┘    │  (Windows)      │    └─────────────────┘
                       └────────┬────────┘
                                │
                       ┌────────▼────────┐
                       │ Google Sheets   │
                       └─────────────────┘
```

### ローカル環境
```
┌─────────────────┐    ┌─────────────────┐
│ Claude Desktop  │◄───│   MCP Server    │ (stdio)
└─────────────────┘    └────────┬────────┘
                                │
                       ┌────────▼────────┐
                       │    sql.js DB    │ (~/.cinema-scheduler/data.db)
                       └─────────────────┘
```

**デュアルエントリーポイントパターン**: `server.ts`（stdio）と `handler.ts`（HTTP）でトランスポートのみ分離。ツール登録ロジック（`registerTools`）は共有。

## Core Technologies

- **Language**: TypeScript (strict mode)
- **Runtime**: Node.js 20+
- **Package Manager**: pnpm 9+ with workspaces
- **Build**: Turborepo for parallel builds
- **Database**: sql.js (SQLite in-memory/file)
- **Scraping**: Playwright (Chromium)
- **MCP**: @modelcontextprotocol/sdk
- **HTTPS**: Caddy (Let's Encrypt 自動証明書) + DuckDNS

## Packages

| Package | Purpose |
|---------|---------|
| `@cinema-scheduler/mcp` | MCPサーバー（Claude Desktop連携 + HTTPS公開） |
| `@cinema-scheduler/scraper` | eiga.com + チェーン公式サイトスクレイパー |
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
2. **eiga.com + チェーン統合**: eiga.comで全国カバー + TOHO/Cinema Sunshine公式サイトで高精度データを補完
3. **MCPプロトコル**: Claude Desktopとのネイティブ統合でシームレスな対話体験
4. **モノレポ構成**: 関連パッケージの一元管理と型共有
5. **GCE e2-micro (free tier)**: Cloud Runから移行、常時起動で低コスト運用
6. **Caddy + DuckDNS**: 自動HTTPS証明書管理、無料ドメインで手間なくHTTPS化
7. **ローカルスクレイピング**: VM のリソース制約（e2-micro + Playwright）を回避、ローカル Windows で実行し GCS 経由でデータ共有
8. **ローカルタイムゾーン日付処理**: `new Date().toISOString().split('T')[0]`（UTC）ではなく、`getFullYear()/getMonth()/getDate()`でローカル日付を取得（日本時間でのずれを防止）
9. **マスターデータ駆動チェーンスクレイパー**: theaters.csv で映画館マスターデータを管理、設定変更のみで新チェーン追加可能

## Data Storage

- **ローカル**: `~/.cinema-scheduler/data.db`（sql.jsファイルベース）
- **GCE（本番稼働中）**: GCSバケット上の`data.db` → 起動時にダウンロード → sql.jsインメモリ展開
- **Format**: SQLite (via sql.js)
- **Tables**: theaters, movies, showtimes, scrape_logs

## Infrastructure Stack

| Technology | Purpose |
|-----------|---------|
| GCE e2-micro | MCP サーバー（free tier、us-central1-a） |
| Caddy | HTTPS リバースプロキシ（Let's Encrypt 自動証明書） |
| DuckDNS | 無料ドメイン（`cinema-scheduler.duckdns.org`） |
| Express ^5 | HTTP サーバー + ミドルウェア |
| StreamableHTTPServerTransport | MCP SDK HTTP トランスポート |
| @google-cloud/storage ^7 | GCS 連携（ADC 自動認証） |
| express-rate-limit ^8 | IP ベースレート制限 |
| Terraform (hashicorp/google) | GCP インフラ定義 |
| GitHub Actions + WIF | CI/CD（Workload Identity Federation + IAP SSH） |
| systemd | MCP サーバー＋Caddy のプロセス管理 |

### スクレイパー最適化
- **並列実行**: ワーカープール方式（`runConcurrent`）、デフォルト同時実行数3
- **重複スキップ**: 既存データのある映画館をスキップし、スクレイピング時間を短縮
- **タスクタイムアウト**: 個別タスク10分タイムアウト（ワーカーは次タスクへ継続）
- **データ完全性チェック**: GCS アップロード前にエリアカバレッジ（20%閾値）とショータイム数の減少を検証
- **ブラウザ再起動**: チェーンスクレイパーは日付ごとにブラウザを再起動（リソース枯渇防止）

---
_Document standards and patterns, not every dependency_
_updated_at: 2026-02-25 — Cloud Run → GCE 移行、チェーンスクレイパー、Caddy HTTPS、ローカルスクレイピングモデルを反映_
