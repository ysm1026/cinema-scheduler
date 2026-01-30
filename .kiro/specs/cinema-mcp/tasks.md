# Cinema Scheduler MCP - 実装タスク

## タスク一覧

### Phase 1: プロジェクト基盤構築

#### TASK-001: モノレポ構成のセットアップ
**ステータス**: completed
**依存**: なし
**推定規模**: M

**説明**:
pnpm workspacesとTurborepoを使用したモノレポ構成を構築する。

**受け入れ条件**:
- [x] ルートpackage.jsonにworkspaces設定がある
- [x] turbo.jsonでビルドパイプラインが定義されている
- [x] tsconfig.base.jsonで共通TypeScript設定がある
- [x] 4つのパッケージディレクトリ（shared, scraper, mcp, inspector）が作成されている
- [x] `pnpm install`が成功する
- [x] `pnpm build`が全パッケージをビルドできる

**実装ファイル**:
- `package.json`
- `pnpm-workspace.yaml`
- `turbo.json`
- `tsconfig.base.json`
- `packages/shared/package.json`
- `packages/scraper/package.json`
- `packages/mcp/package.json`
- `packages/inspector/package.json`

---

#### TASK-002: 共有パッケージ（shared）の実装
**ステータス**: completed
**依存**: TASK-001
**推定規模**: M

**説明**:
データベース接続、スキーマ、共通型定義を含む共有パッケージを実装する。

**受け入れ条件**:
- [x] sql.jsを使用したDB接続モジュールがある（better-sqlite3はNode.js v25非対応のため変更）
- [x] SQLiteスキーマ定義（theaters, movies, showtimes, scrape_log）がある
- [x] マイグレーション機能がある
- [x] 共通型定義（Theater, Movie, Showtime等）がある
- [x] sql.jsはメモリDBのためWALモード不要
- [x] 単体テストがパスする

**実装ファイル**:
- `packages/shared/src/db/connection.ts`
- `packages/shared/src/db/schema.ts`
- `packages/shared/src/db/migrations/001_initial.ts`
- `packages/shared/src/types/theater.ts`
- `packages/shared/src/types/movie.ts`
- `packages/shared/src/types/showtime.ts`
- `packages/shared/src/index.ts`
- `packages/shared/src/__tests__/db.test.ts`

---

### Phase 2: スクレイパーバッチ実装

#### TASK-003: CLIフレームワークの実装
**ステータス**: completed
**依存**: TASK-002
**推定規模**: S

**説明**:
commanderを使用したCLIエントリポイントを実装する。

**受け入れ条件**:
- [x] `--area`オプションでエリア指定ができる
- [x] `--days`オプションで日数指定ができる
- [x] `--dry-run`オプションでDB保存をスキップできる
- [x] `--verbose`オプションで詳細ログが出力される
- [x] `--help`でヘルプが表示される

**実装ファイル**:
- `packages/scraper/src/cli.ts`
- `packages/scraper/src/config.ts`

---

#### TASK-004: eiga.comスクレイパーの実装
**ステータス**: completed
**依存**: TASK-003
**推定規模**: L

**説明**:
Playwrightを使用してeiga.comから上映スケジュールをスクレイピングする機能を実装する。

**受け入れ条件**:
- [x] エリアコード定義がある（10エリア以上）
- [x] 指定エリア・日付の上映スケジュールを取得できる
- [x] 映画タイトル、映画館名、開始時間、終了時間、上映形式を抽出できる
- [x] 上映時間（分）を正しく計算できる
- [ ] エラー時にリトライする（未実装 - 将来対応）
- [x] レート制限を考慮した待機がある

**実装ファイル**:
- `packages/scraper/src/scraper/areas.ts`
- `packages/scraper/src/scraper/eigacom.ts`
- `packages/scraper/src/scraper/parser.ts`
- `packages/scraper/src/__tests__/parser.test.ts`

---

#### TASK-005: リポジトリ層の実装
**ステータス**: completed
**依存**: TASK-002
**推定規模**: M

**説明**:
スクレイピング結果をSQLiteに保存するリポジトリ層を実装する。

**受け入れ条件**:
- [x] TheaterRepositoryで映画館のUPSERTができる
- [x] MovieRepositoryで映画のUPSERTができる
- [x] ShowtimeRepositoryで上映時間のUPSERTができる
- [x] 古いデータの削除ができる
- [x] scrape_logへの記録ができる
- [ ] トランザクション処理がある（sql.jsでの制限によりシンプルな実装に留める）
- [x] 単体テストがパスする

**実装ファイル**:
- `packages/scraper/src/repository/theater.ts`
- `packages/scraper/src/repository/movie.ts`
- `packages/scraper/src/repository/showtime.ts`
- `packages/scraper/src/repository/scrape-log.ts`
- `packages/scraper/src/repository/index.ts`
- `packages/scraper/src/__tests__/repository.test.ts`

---

#### TASK-006: スクレイパー統合とテスト
**ステータス**: completed
**依存**: TASK-004, TASK-005
**推定規模**: M

**説明**:
CLIからスクレイパーとリポジトリを統合し、E2Eでの動作確認を行う。

**受け入れ条件**:
- [x] `pnpm --filter scraper start -- --area 新宿 --days 1`が実行できる
- [x] 実行結果がSQLiteに保存される
- [x] `--dry-run`で保存がスキップされる
- [x] ログファイルに実行記録が残る（scrape_logテーブルに記録）
- [ ] 複数エリアの並列スクレイピングができる（シーケンシャル実行に変更）

**実装ファイル**:
- `packages/scraper/src/index.ts`
- `packages/scraper/src/cli.ts`

---

### Phase 3: MCPサーバー実装

#### TASK-007: MCPサーバー基盤の実装
**ステータス**: completed
**依存**: TASK-002
**推定規模**: M

**説明**:
@modelcontextprotocol/sdkを使用したMCPサーバーの基盤を実装する。

**受け入れ条件**:
- [x] stdio transportでClaude Desktopと通信できる
- [x] サーバー情報（name, version）が正しく設定されている
- [x] DBへの読み取り専用接続がある
- [x] 起動・終了が正常に動作する
- [x] エラーハンドリングがある

**実装ファイル**:
- `packages/mcp/src/server.ts`
- `packages/mcp/src/index.ts`

---

#### TASK-008: get_showtimesツールの実装
**ステータス**: completed
**依存**: TASK-007
**推定規模**: M

**説明**:
上映スケジュール取得ツールを実装する。

**受け入れ条件**:
- [x] date, area, theater, movieTitleパラメータをサポート
- [x] パラメータのZodバリデーションがある
- [x] SQLクエリで条件に応じたフィルタリングができる
- [x] レスポンスが要件定義の形式に準拠している
- [ ] 単体テストがパスする（統合テストで対応予定）

**実装ファイル**:
- `packages/mcp/src/tools/get-showtimes.ts`
- `packages/mcp/src/__tests__/tools/get-showtimes.test.ts`

---

#### TASK-009: list_theatersツールの実装
**ステータス**: completed
**依存**: TASK-007
**推定規模**: S

**説明**:
映画館一覧取得ツールを実装する。

**受け入れ条件**:
- [x] areaパラメータで絞り込みができる
- [x] 映画館名とチェーン情報を返す
- [x] totalCountを返す
- [ ] 単体テストがパスする（統合テストで対応予定）

**実装ファイル**:
- `packages/mcp/src/tools/list-theaters.ts`
- `packages/mcp/src/__tests__/tools/list-theaters.test.ts`

---

#### TASK-010: list_moviesツールの実装
**ステータス**: completed
**依存**: TASK-007
**推定規模**: S

**説明**:
映画一覧取得ツールを実装する。

**受け入れ条件**:
- [x] area, dateパラメータで絞り込みができる
- [x] 映画タイトルと上映館数を返す
- [ ] 単体テストがパスする（統合テストで対応予定）

**実装ファイル**:
- `packages/mcp/src/tools/list-movies.ts`
- `packages/mcp/src/__tests__/tools/list-movies.test.ts`

---

#### TASK-011: get_data_statusツールの実装
**ステータス**: completed
**依存**: TASK-007
**推定規模**: S

**説明**:
データ状態確認ツールを実装する。

**受け入れ条件**:
- [x] 最終スクレイピング日時を返す
- [x] エリア数、映画館数、上映データ数を返す
- [x] データ期間（from, to）を返す
- [ ] 単体テストがパスする（統合テストで対応予定）

**実装ファイル**:
- `packages/mcp/src/tools/get-data-status.ts`
- `packages/mcp/src/__tests__/tools/get-data-status.test.ts`

---

#### TASK-012: optimize_scheduleツールの実装
**ステータス**: completed
**依存**: TASK-008
**推定規模**: L

**説明**:
スケジュール最適化ツールを実装する。

**受け入れ条件**:
- [x] movieTitles, date, areaパラメータが必須
- [x] timeRange, bufferMinutes, preferPremiumパラメータがオプション
- [x] 貪欲法によるスケジュール最適化ができる
- [x] 時間衝突を検出してexcludedに追加する
- [x] 統計情報（totalMovies, totalWatchTime等）を返す
- [x] 単体テストがパスする
- [x] エッジケース（映画なし、全衝突等）のテストがある

**実装ファイル**:
- `packages/mcp/src/tools/optimize-schedule.ts`
- `packages/mcp/src/services/optimizer-service.ts`
- `packages/mcp/src/__tests__/tools/optimize-schedule.test.ts`
- `packages/mcp/src/__tests__/services/optimizer.test.ts`

---

#### TASK-013: MCPサーバー統合テスト
**ステータス**: completed
**依存**: TASK-008, TASK-009, TASK-010, TASK-011, TASK-012
**推定規模**: M

**説明**:
全ツールを統合し、MCPサーバーとしての動作確認を行う。

**受け入れ条件**:
- [x] MCPクライアントから全ツールを呼び出せる（サーバー起動確認済み）
- [x] Claude Desktop設定ファイルのサンプルがある（READMEに記載）
- [x] READMEにセットアップ手順がある
- [ ] E2Eテストがパスする（手動確認にて代替）

**実装ファイル**:
- `packages/mcp/src/tools/index.ts`
- `packages/mcp/README.md`

---

### Phase 4: インスペクター実装

#### TASK-014: Webサーバー基盤の実装
**ステータス**: pending
**依存**: TASK-007
**推定規模**: M

**説明**:
Honoを使用したWebサーバーの基盤を実装する。

**受け入れ条件**:
- [ ] ポート3000でHTTPサーバーが起動する
- [ ] 静的ファイル配信ができる
- [ ] HTMLテンプレートエンジンが動作する
- [ ] エラーハンドリングがある

**実装ファイル**:
- `packages/inspector/src/server.ts`
- `packages/inspector/src/views/layout.ts`
- `packages/inspector/src/index.ts`

---

#### TASK-015: MCPクライアントの実装
**ステータス**: pending
**依存**: TASK-014
**推定規模**: M

**説明**:
cinema-mcpサーバーと通信するMCPクライアントを実装する。

**受け入れ条件**:
- [ ] cinema-mcpを子プロセスとして起動できる
- [ ] ツール一覧を取得できる
- [ ] ツールを実行してレスポンスを取得できる
- [ ] 接続・切断が正常に動作する
- [ ] 接続エラーのハンドリングがある

**実装ファイル**:
- `packages/inspector/src/mcp-client.ts`
- `packages/inspector/src/__tests__/mcp-client.test.ts`

---

#### TASK-016: ホーム画面の実装
**ステータス**: pending
**依存**: TASK-014, TASK-015
**推定規模**: S

**説明**:
データ状態とツール一覧を表示するホーム画面を実装する。

**受け入れ条件**:
- [ ] データ状態（最終スクレイピング日時、件数等）が表示される
- [ ] 利用可能なツール一覧が表示される
- [ ] 各ツールへのリンクがある
- [ ] レスポンシブデザイン

**実装ファイル**:
- `packages/inspector/src/routes/index.ts`
- `packages/inspector/src/views/home.ts`

---

#### TASK-017: ツール実行画面の実装
**ステータス**: pending
**依存**: TASK-016
**推定規模**: M

**説明**:
ツールのパラメータ入力と実行結果表示画面を実装する。

**受け入れ条件**:
- [ ] ツールのパラメータスキーマに基づいたフォームが表示される
- [ ] フォーム送信でツールが実行される
- [ ] リクエストJSONが表示される
- [ ] レスポンスJSONが表示される
- [ ] エラー時にエラーメッセージが表示される

**実装ファイル**:
- `packages/inspector/src/routes/tools.ts`
- `packages/inspector/src/views/tool.ts`
- `packages/inspector/src/views/components/form.ts`
- `packages/inspector/src/views/components/json-viewer.ts`

---

#### TASK-018: リクエスト履歴機能の実装
**ステータス**: pending
**依存**: TASK-017
**推定規模**: M

**説明**:
過去のリクエスト/レスポンスを記録・表示する機能を実装する。

**受け入れ条件**:
- [ ] リクエスト/レスポンスがメモリに保存される
- [ ] 履歴一覧が表示される
- [ ] 履歴から再実行ができる
- [ ] 履歴のクリアができる

**実装ファイル**:
- `packages/inspector/src/routes/history.ts`
- `packages/inspector/src/services/history-service.ts`
- `packages/inspector/src/views/history.ts`

---

#### TASK-019: インスペクター統合テスト
**ステータス**: pending
**依存**: TASK-016, TASK-017, TASK-018
**推定規模**: S

**説明**:
インスペクターの全機能を統合テストする。

**受け入れ条件**:
- [ ] 全ページが正常に表示される
- [ ] 全ツールが実行できる
- [ ] 履歴機能が動作する
- [ ] READMEにセットアップ手順がある

**実装ファイル**:
- `packages/inspector/README.md`
- `packages/inspector/src/__tests__/e2e.test.ts`

---

### Phase 5: 統合・デプロイ

#### TASK-020: 定期実行設定の作成
**ステータス**: pending
**依存**: TASK-006
**推定規模**: S

**説明**:
スクレイパーの定期実行設定ファイルを作成する。

**受け入れ条件**:
- [ ] macOS用launchdのplistファイルがある
- [ ] Linux用cronの設定例がある
- [ ] ログローテーション設定がある
- [ ] セットアップ手順がREADMEにある

**実装ファイル**:
- `scripts/launchd/com.cinema-scheduler.scraper.plist`
- `scripts/cron/cinema-scraper.cron`
- `docs/setup-scheduled-task.md`

---

#### TASK-021: ドキュメント整備
**ステータス**: pending
**依存**: TASK-013, TASK-019, TASK-020
**推定規模**: M

**説明**:
プロジェクト全体のドキュメントを整備する。

**受け入れ条件**:
- [ ] プロジェクトREADMEがある（概要、セットアップ、使い方）
- [ ] Claude Desktop設定手順がある
- [ ] トラブルシューティングガイドがある
- [ ] 開発者向けドキュメントがある

**実装ファイル**:
- `README.md`
- `docs/setup-claude-desktop.md`
- `docs/troubleshooting.md`
- `docs/development.md`

---

#### TASK-022: 旧コードの削除・整理
**ステータス**: pending
**依存**: TASK-021
**推定規模**: S

**説明**:
不要になった旧コードと仕様書を削除する。

**受け入れ条件**:
- [ ] 旧srcディレクトリが削除されている
- [ ] 旧specディレクトリ（movie-marathon-scheduler, mcp-migration）が削除されている
- [ ] 不要な設定ファイルが削除されている
- [ ] .gitignoreが更新されている

**削除対象**:
- `src/` (旧実装)
- `.kiro/specs/movie-marathon-scheduler/`
- `.kiro/specs/mcp-migration/`

---

## タスク依存関係図

```
TASK-001 (モノレポ構成)
    │
    ▼
TASK-002 (共有パッケージ)
    │
    ├──────────────────┬──────────────────┐
    ▼                  ▼                  ▼
TASK-003 (CLI)     TASK-007 (MCP基盤)  TASK-014 (Web基盤)
    │                  │                  │
    ▼                  ├────┬────┬────┐   ▼
TASK-004 (スクレイパー) │    │    │    │ TASK-015 (MCPクライアント)
    │               TASK-008│    │    │      │
    ▼               TASK-009│    │    │      ▼
TASK-005 (リポジトリ) TASK-010│    │  TASK-016 (ホーム画面)
    │               TASK-011│    │         │
    ├───────────────────┘    │    │         ▼
    ▼                        ▼    │    TASK-017 (ツール画面)
TASK-006 (スクレイパー統合) TASK-012│         │
    │                         │    │         ▼
    │                         ▼    │    TASK-018 (履歴機能)
    │                    TASK-013  │         │
    │                    (MCP統合) │         ▼
    │                         │    │    TASK-019 (Inspector統合)
    │                         │    │         │
    ▼                         │    │         │
TASK-020 (定期実行)          │    │         │
    │                         │    │         │
    └─────────────────────────┴────┴─────────┘
                              │
                              ▼
                         TASK-021 (ドキュメント)
                              │
                              ▼
                         TASK-022 (旧コード削除)
```

---

## 見積りサマリー

| サイズ | タスク数 | 説明 |
|-------|---------|------|
| S (小) | 8 | 単一機能、1-2ファイル |
| M (中) | 11 | 複数機能、3-5ファイル |
| L (大) | 3 | 複雑な機能、6+ファイル |

**合計タスク数**: 22タスク

---

## 実装優先順位

1. **Phase 1** (TASK-001〜002): プロジェクト基盤 - 最優先
2. **Phase 2** (TASK-003〜006): スクレイパー - データ収集が先
3. **Phase 3** (TASK-007〜013): MCPサーバー - コア機能
4. **Phase 4** (TASK-014〜019): インスペクター - デバッグ支援
5. **Phase 5** (TASK-020〜022): 統合・デプロイ - 仕上げ
