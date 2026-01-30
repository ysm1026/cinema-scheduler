# @cinema-scheduler/inspector

MCP ツールのインスペクター WebUI。ブラウザからMCPツールをテスト・実行できます。

## 機能

- **ホーム画面**: データステータス表示、ツール一覧
- **ツール実行**: フォームからパラメータを入力してツールを実行
- **履歴管理**: 過去の実行履歴の確認、リプレイ機能

## 起動方法

```bash
# プロジェクトルートから
pnpm --filter @cinema-scheduler/inspector start

# または
cd packages/inspector
pnpm start
```

デフォルトポート: http://localhost:3001

ポートを変更する場合:
```bash
PORT=3002 pnpm start
```

## 前提条件

- MCP サーバー (`@cinema-scheduler/mcp`) がビルド済みであること
- データベース (`data/cinema.db`) が存在すること

## 技術スタック

- **Hono**: Web フレームワーク
- **@hono/node-server**: Node.js サーバー
- **MCP SDK**: MCPサーバーとの接続

## 画面

### ホーム (`/`)
- データステータス（最終スクレイピング日時、件数）
- 利用可能なツール一覧

### ツール一覧 (`/tools`)
- 全ツールの一覧表示

### ツール詳細 (`/tools/:name`)
- パラメータ入力フォーム
- 実行結果表示

### 履歴 (`/history`)
- 実行履歴一覧
- リプレイ機能
