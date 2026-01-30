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
      "command": "node",
      "args": ["/path/to/cinema-scheduler/packages/mcp/dist/server.js"],
      "env": {}
    }
  }
}
```

または、npm globalでインストールした場合:

```json
{
  "mcpServers": {
    "cinema-scheduler": {
      "command": "cinema-mcp",
      "args": [],
      "env": {}
    }
  }
}
```

## 利用可能なツール

### get_showtimes

指定条件に合う上映スケジュールを取得します。

**パラメータ:**
- `date` (必須): 日付（YYYY-MM-DD形式）
- `area` (任意): エリア名（例: 新宿、渋谷）
- `theater` (任意): 映画館名
- `movieTitle` (任意): 映画タイトル（部分一致）
- `format` (任意): 上映形式（IMAX, DOLBY_CINEMA等）

**例:**
```
新宿エリアの2026年1月30日の上映スケジュールを教えて
```

### list_theaters

利用可能な映画館の一覧を取得します。

**パラメータ:**
- `area` (任意): エリア名で絞り込み

### list_movies

上映中の映画一覧を取得します。

**パラメータ:**
- `area` (任意): エリア名で絞り込み
- `date` (任意): 日付で絞り込み

### get_data_status

データベースの状態を確認します。

**パラメータ:** なし

### optimize_schedule

複数の映画を効率よく観るためのスケジュールを最適化します。

**パラメータ:**
- `movieTitles` (必須): 観たい映画のタイトルリスト（優先順）
- `date` (必須): 日付（YYYY-MM-DD形式）
- `area` (必須): エリア名
- `timeRange` (任意): 希望時間帯 `{ start: "10:00", end: "22:00" }`
- `bufferMinutes` (任意): 映画間の休憩時間（分、デフォルト30）
- `preferPremium` (任意): IMAX/Dolby等を優先するか

**例:**
```
明日、新宿で「ズートピア2」と「シャドウズ・エッジ」を観たいんだけど、
10時から20時の間で最適なスケジュールを組んでくれない？
休憩は15分くらいでお願い。
```

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

最新のデータを取得するには:

```bash
cd ../scraper
pnpm start -- --area 新宿,渋谷 --days 3
```
