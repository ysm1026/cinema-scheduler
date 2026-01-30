# Technology Stack

## Architecture

**pnpm workspaces + Turborepo**によるモノレポ構成。MCPサーバー、スクレイパー、共有ライブラリ、デバッグUIの4パッケージ。

```
┌─────────────────┐    ┌─────────────────┐
│ Claude Desktop  │◄───│   MCP Server    │
└─────────────────┘    └────────┬────────┘
                                │
                       ┌────────▼────────┐
                       │    sql.js DB    │
                       └────────▲────────┘
                                │
┌─────────────────┐    ┌────────┴────────┐
│   eiga.com      │◄───│    Scraper      │
└─────────────────┘    └─────────────────┘
```

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
```

## Key Technical Decisions

1. **sql.js採用**: ファイルベースSQLiteをNode.jsで直接操作、ネイティブモジュール不要
2. **eiga.com統合**: 複数映画館チェーンの情報を一元的に取得可能
3. **MCPプロトコル**: Claude Desktopとのネイティブ統合でシームレスな対話体験
4. **モノレポ構成**: 関連パッケージの一元管理と型共有

## Data Storage

- **Path**: `~/.cinema-scheduler/data.db`
- **Format**: SQLite (via sql.js)
- **Tables**: theaters, movies, showtimes, scrape_logs

---
_Document standards and patterns, not every dependency_
