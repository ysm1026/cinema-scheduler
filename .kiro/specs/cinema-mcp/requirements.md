# Cinema Scheduler MCP - 要件定義

## 1. プロダクト概要

### 1.1 目的
映画マラソン（1日に複数の映画を効率的に鑑賞する）の計画を支援するClaude Desktop用MCPサーバー。

### 1.2 ターゲットユーザー
- 映画ファン（1日に複数本の映画を観たい人）
- Claude Desktopユーザー

### 1.3 主要な価値提案
- 自然言語で映画マラソンの計画を依頼できる
- 実際の上映スケジュールに基づいた正確な提案
- 時間の衝突を自動回避した最適なスケジュール生成

---

## 2. システムアーキテクチャ

### 2.1 全体構成

```
┌─────────────────────────────────────────────────────────┐
│ コンポーネント1: cinema-scraper（スクレイパーバッチ）   │
│   - 1日1回実行（cron/launchd）                          │
│   - eiga.comをスクレイピング                            │
│   - SQLiteにデータ保存                                  │
└─────────────────────────────────────────────────────────┘
                          ↓ 書き込み
                   ┌──────────────┐
                   │   SQLite DB   │
                   └──────────────┘
                          ↑ 読み取り
┌─────────────────────────────────────────────────────────┐
│ コンポーネント2: cinema-mcp（MCPサーバー）              │
│   - Claude Desktopから起動                              │
│   - DBからデータ読み取り（Read Only）                   │
│   - スケジュール最適化ロジック                          │
└─────────────────────────────────────────────────────────┘
                          ↑
              User ─→ Claude Desktop

┌─────────────────────────────────────────────────────────┐
│ コンポーネント3: cinema-inspector（デバッグWebUI）      │
│   - 開発・デバッグ用                                    │
│   - MCPツールをブラウザから実行                         │
└─────────────────────────────────────────────────────────┘
```

### 2.2 コンポーネント間の責務分離

| コンポーネント | 責務 | 実行タイミング |
|---------------|------|---------------|
| cinema-scraper | データ収集・保存 | 1日1回（cron/launchd） |
| cinema-mcp | データ提供・最適化 | Claude Desktop起動時 |
| cinema-inspector | 開発・デバッグ | 開発者が手動実行 |

---

## 3. 機能要件

### 3.1 cinema-scraper（スクレイパーバッチ）

#### FR-SCR-001: 映画館スケジュールのスクレイピング
- eiga.comから指定エリアの映画館上映スケジュールを取得する
- 対象エリア: 東京主要エリア（新宿、渋谷、池袋、上野、日比谷、銀座、六本木など）
- 対象期間: 今日〜7日後

#### FR-SCR-002: データベースへの保存
- スクレイピング結果をSQLiteデータベースに保存する
- 既存データは上書き更新（UPSERT）
- 過去日付のデータは自動削除

#### FR-SCR-003: CLIオプション
- `--area <areas>`: スクレイピング対象エリア（カンマ区切り）
- `--days <n>`: 何日先までスクレイピングするか
- `--dry-run`: DBに保存せずに結果を表示
- `--verbose`: 詳細ログを出力

#### FR-SCR-004: スクレイピングログ
- 実行日時、取得件数、エラー情報をログに記録する

---

### 3.2 cinema-mcp（MCPサーバー）

#### FR-MCP-001: get_showtimes ツール
映画館の上映スケジュールを取得する。

**パラメータ:**
| 名前 | 型 | 必須 | 説明 |
|------|-----|------|------|
| date | string | No | 日付（YYYY-MM-DD、省略時は今日） |
| area | string | No | エリア名（例: 新宿, 池袋） |
| theater | string | No | 映画館名 |
| movieTitle | string | No | 映画タイトル（部分一致） |

**レスポンス:**
```json
{
  "date": "2026-01-29",
  "area": "新宿",
  "results": [
    {
      "theater": "新宿バルト9",
      "movieTitle": "ズートピア2",
      "startTime": "11:00",
      "endTime": "12:48",
      "durationMinutes": 108,
      "format": null
    }
  ],
  "totalCount": 26
}
```

#### FR-MCP-002: optimize_schedule ツール
複数の映画を効率よく観るためのスケジュールを最適化する。

**パラメータ:**
| 名前 | 型 | 必須 | 説明 |
|------|-----|------|------|
| movieTitles | string[] | Yes | 観たい映画のタイトルリスト（優先順） |
| date | string | Yes | 日付（YYYY-MM-DD） |
| area | string | Yes | エリア名 |
| timeRange | object | No | 希望時間帯 {start: "HH:mm", end: "HH:mm"} |
| bufferMinutes | number | No | 映画間の休憩時間（分、デフォルト30） |
| preferPremium | boolean | No | IMAX/Dolby等を優先するか |

**レスポンス:**
```json
{
  "schedule": [
    {
      "order": 1,
      "movieTitle": "シャドウズ・エッジ",
      "theater": "新宿バルト9",
      "startTime": "12:40",
      "endTime": "15:01",
      "durationMinutes": 141,
      "format": null,
      "breakMinutesBefore": 0
    }
  ],
  "excluded": [
    { "title": "ズートピア2", "reason": "time_conflict" }
  ],
  "stats": {
    "totalMovies": 2,
    "totalWatchTimeMinutes": 257,
    "totalBreakTimeMinutes": 54,
    "premiumCount": 0
  }
}
```

#### FR-MCP-003: list_theaters ツール
指定エリアの映画館リストを取得する。

**パラメータ:**
| 名前 | 型 | 必須 | 説明 |
|------|-----|------|------|
| area | string | Yes | エリア名 |

**レスポンス:**
```json
{
  "area": "新宿",
  "theaters": [
    { "name": "新宿バルト9", "chain": "other" },
    { "name": "TOHOシネマズ 新宿", "chain": "toho" }
  ],
  "totalCount": 9
}
```

#### FR-MCP-004: list_movies ツール
現在上映中の映画リストを取得する。

**パラメータ:**
| 名前 | 型 | 必須 | 説明 |
|------|-----|------|------|
| area | string | No | エリア名（省略時は全エリア） |
| date | string | No | 日付（省略時は今日） |

**レスポンス:**
```json
{
  "date": "2026-01-29",
  "movies": [
    { "title": "ズートピア2", "theaterCount": 5 },
    { "title": "シャドウズ・エッジ", "theaterCount": 2 }
  ],
  "totalCount": 15
}
```

#### FR-MCP-005: get_data_status ツール
スクレイピングデータの状態を確認する。

**パラメータ:** なし

**レスポンス:**
```json
{
  "lastScrapedAt": "2026-01-29T05:00:00+09:00",
  "areaCount": 10,
  "theaterCount": 83,
  "showtimeCount": 5420,
  "dateRange": {
    "from": "2026-01-29",
    "to": "2026-02-05"
  }
}
```

---

### 3.3 cinema-inspector（デバッグWebUI）

#### FR-INS-001: ツール一覧表示
- 利用可能なMCPツールの一覧を表示する
- 各ツールのパラメータスキーマを表示する

#### FR-INS-002: ツール実行UI
- フォームでパラメータを入力してツールを実行する
- リクエスト/レスポンスをJSON形式で表示する

#### FR-INS-003: リクエスト履歴
- 過去のリクエスト/レスポンスを記録・表示する
- 再実行機能を提供する

#### FR-INS-004: データベース状態表示
- 最終スクレイピング日時を表示する
- エリア・映画館・上映データの件数を表示する

---

## 4. 非機能要件

### 4.1 パフォーマンス

#### NFR-001: MCPツール応答時間
- get_showtimes: 100ms以内
- optimize_schedule: 500ms以内
- list_theaters: 50ms以内
- list_movies: 100ms以内
- get_data_status: 50ms以内

#### NFR-002: スクレイピング実行時間
- 全エリア（10エリア）のスクレイピング: 10分以内

### 4.2 信頼性

#### NFR-003: データ整合性
- スクレイピング中にMCPサーバーがデータを読み取っても整合性を保つ
- SQLiteのWALモードを使用

#### NFR-004: 障害分離
- スクレイピング失敗時もMCPサーバーは動作を継続する（古いデータを使用）

### 4.3 運用性

#### NFR-005: 定期実行
- macOS: launchdで1日1回実行
- Linux: cronで1日1回実行

#### NFR-006: ログ出力
- スクレイピング結果をログファイルに記録
- エラー発生時は詳細情報を記録

### 4.4 セキュリティ

#### NFR-007: ローカル実行
- 全コンポーネントはローカルマシン上で実行
- 外部への通信はeiga.comへのスクレイピングのみ

---

## 5. データモデル

### 5.1 SQLiteスキーマ

```sql
-- 映画館マスタ
CREATE TABLE theaters (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  area TEXT NOT NULL,
  chain TEXT,  -- toho, aeon, united, other
  UNIQUE(name, area)
);

-- 映画マスタ
CREATE TABLE movies (
  id INTEGER PRIMARY KEY,
  title TEXT NOT NULL UNIQUE,
  runtime_minutes INTEGER
);

-- 上映スケジュール
CREATE TABLE showtimes (
  id INTEGER PRIMARY KEY,
  theater_id INTEGER NOT NULL,
  movie_id INTEGER NOT NULL,
  date TEXT NOT NULL,  -- YYYY-MM-DD
  start_time TEXT NOT NULL,  -- HH:mm
  end_time TEXT NOT NULL,  -- HH:mm
  format TEXT,  -- IMAX, DOLBY_CINEMA, etc.
  FOREIGN KEY (theater_id) REFERENCES theaters(id),
  FOREIGN KEY (movie_id) REFERENCES movies(id),
  UNIQUE(theater_id, movie_id, date, start_time)
);

-- スクレイピングログ
CREATE TABLE scrape_log (
  id INTEGER PRIMARY KEY,
  area TEXT NOT NULL,
  scraped_at TEXT NOT NULL,
  showtime_count INTEGER,
  error TEXT
);
```

### 5.2 データ保存場所

```
~/.cinema-scheduler/
├── data.db          # SQLiteデータベース
├── scraper.log      # スクレイピングログ
└── config.json      # 設定ファイル（オプション）
```

---

## 6. 制約事項

### 6.1 技術的制約
- Node.js 20以上が必要
- Claude Desktopがインストールされていること
- macOSまたはLinux環境（Windowsは未対応）

### 6.2 データソース制約
- eiga.comの構造変更に依存
- スクレイピング頻度の制限（1日1回）

### 6.3 対象エリア
- 初期リリースでは東京主要エリアのみ
- 将来的に関西・名古屋も対応予定
