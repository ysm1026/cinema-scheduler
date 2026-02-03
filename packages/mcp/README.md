# @cinema-scheduler/mcp

映画上映スケジュールを検索・最適化するためのMCPサーバー。

## インストール

```bash
pnpm install
pnpm build
```

## Claude Desktop設定

`~/Library/Application Support/Claude/claude_desktop_config.json`に以下を追加:

```json
{
  "mcpServers": {
    "cinema-scheduler": {
      "command": "/opt/homebrew/bin/node",
      "args": ["/path/to/cinema-scheduler/packages/mcp/dist/server.js"]
    }
  }
}
```

**重要**: `command`にはnodeの絶対パスを指定してください（`which node`で確認）。

## 利用可能なツール

### get_showtimes

指定条件に合う上映スケジュールを取得します。

**パラメータ:**
- `date` (任意): 日付（YYYY-MM-DD形式、省略時は今日）
- `areas` (任意): エリア名リスト（例: ["新宿", "池袋"]）
- `theater` (任意): 映画館名（部分一致）
- `movieTitle` (任意): 映画タイトル（曖昧検索）

**例:**
```
新宿エリアの今日の上映スケジュールを教えて
日比谷でランニングマンを見たい
```

### list_theaters

利用可能な映画館の一覧を取得します。

**パラメータ:**
- `areas` (任意): エリア名リストで絞り込み

### list_movies

上映中の映画一覧を取得します。

**パラメータ:**
- `areas` (任意): エリア名リストで絞り込み
- `date` (任意): 日付で絞り込み

### get_data_status

データベースの状態を確認します。

**パラメータ:** なし

### optimize_schedule

複数の映画を効率よく観るためのスケジュールを最適化します。

**パラメータ:**
- `movieTitles` (必須): 観たい映画のタイトルリスト（優先順）
- `areas` (必須): エリア名リスト
- `date` (任意): 日付（YYYY-MM-DD形式、省略時は今日）
- `timeRange` (任意): 希望時間帯 `{ start: "10:00", end: "22:00" }`
- `bufferMinutes` (任意): 映画間の休憩時間（分、デフォルト30）
- `preferPremium` (任意): IMAX/Dolby等を優先するか

**例:**
```
明日、新宿で「ズートピア2」と「シャドウズ・エッジ」を観たいんだけど、
10時から20時の間で最適なスケジュールを組んで
```

## トラブルシューティング

### AIがツールを使わない場合

Claude Desktopで「映画を検索して」と言ってもツールが呼び出されない場合：

1. **明示的にツール使用を指示する**
   ```
   get_showtimes ツールを使って、新宿の映画スケジュールを取得してください
   ```

2. **ツールのdescriptionが重要**
   - AIは `description` を見て「いつ使うべきか」を判断します
   - 「【必須】〜のときはこのツールを使用してください」のような明確な指示が効果的

### ログの確認方法

```bash
# MCPサーバーのログ
tail -f ~/Library/Logs/Claude/mcp-server-cinema-scheduler.log

# Claude Desktop全体のログ
tail -f ~/Library/Logs/Claude/main.log
```

### 接続状態の確認

Claude Desktopの **Settings → Developer → MCP Servers** で `cinema-scheduler` のステータスを確認。

## 開発

```bash
# 開発サーバー起動
pnpm dev

# ビルド
pnpm build

# テスト
pnpm test

# 型チェック
pnpm typecheck
```

## データについて

このMCPサーバーは、`@cinema-scheduler/scraper`で収集したデータを使用します。
データは `~/.cinema-scheduler/data.db` に保存されます。

最新のデータを取得するには:

```bash
pnpm scrape
```

または自動更新を設定するには:

```bash
pnpm cron:dev
```
