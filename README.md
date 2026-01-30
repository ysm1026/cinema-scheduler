# Cinema Scheduler

映画館の上映スケジュールをスクレイピングし、Claude Desktop からMCPツールとして利用できるシステム。

## 構成

| パッケージ | 説明 |
|-----------|------|
| `@cinema-scheduler/shared` | 共有コード（DB、型定義） |
| `@cinema-scheduler/scraper` | eiga.com スクレイパー |
| `@cinema-scheduler/mcp` | MCP サーバー |
| `@cinema-scheduler/inspector` | WebUI インスペクター |

## セットアップ

```bash
# 依存関係インストール
pnpm install

# ビルド
pnpm build
```

## 使い方

### 1. スクレイピング

```bash
# 東京エリアを3日分スクレイピング
pnpm scrape --area tokyo --days 3

# ドライラン（DB保存なし）
pnpm scrape --area tokyo --days 1 --dry-run

# 利用可能なエリア一覧
pnpm scrape --list-areas
```

### 2. Claude Desktop との連携

`~/Library/Application Support/Claude/claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "cinema-scheduler": {
      "command": "node",
      "args": ["/path/to/cinema-scheduler/packages/mcp/dist/server.js"]
    }
  }
}
```

### 3. Inspector WebUI

```bash
pnpm inspector
```

http://localhost:3001 でMCPツールをブラウザからテストできます。

## MCPツール

| ツール | 説明 |
|--------|------|
| `get_showtimes` | 上映スケジュール検索 |
| `list_theaters` | 映画館一覧 |
| `list_movies` | 上映中映画一覧 |
| `get_data_status` | データ状態確認 |
| `optimize_schedule` | 複数映画の最適上映順序 |

## 開発

```bash
# テスト
pnpm test

# 型チェック
pnpm typecheck

# リント
pnpm lint
```

## ディレクトリ構造

```
cinema-scheduler/
├── packages/
│   ├── shared/      # 共有コード
│   ├── scraper/     # スクレイパー
│   ├── mcp/         # MCPサーバー
│   └── inspector/   # WebUI
├── data/            # SQLiteデータベース
└── .kiro/           # 仕様・ステアリングドキュメント
```
