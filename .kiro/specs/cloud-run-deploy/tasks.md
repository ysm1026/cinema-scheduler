# Implementation Plan

- [x] 1. MCP SDK のアップグレードと既存動作確認
  - @modelcontextprotocol/sdk を ^1.4.1 から ^1.12+ にアップグレードする
  - StreamableHTTPServerTransport がインポート可能であることを確認する
  - 既存の stdio トランスポートによる全ツール実行が引き続き正常動作することを検証する
  - アップグレードに伴う破壊的変更があれば既存コードを修正する
  - _Requirements: 1.4, 1.5_

- [x] 2. GCS ストレージサービスの実装
- [x] 2.1 GCS ファイル操作サービスの実装
  - Cloud Storage からのファイルダウンロード機能を Buffer 形式で実装する
  - Cloud Storage へのファイルアップロード機能を Buffer 形式で実装する
  - オブジェクトメタデータ（更新日時、generation）の取得機能を実装する
  - ADC（Application Default Credentials）による自動認証を使用し、Cloud Run 環境では追加設定不要とする
  - @google-cloud/storage パッケージを shared パッケージの依存関係に追加する
  - _Requirements: 2.2, 4.2, 9.1, 9.2, 9.3_
  - _Contracts: GcsStorageService_

- [x]* 2.2 GCS ストレージサービスのユニットテスト
  - ダウンロード・アップロード・メタデータ取得の各操作をモックでテストする
  - バケット不存在時やアクセス権不足時のエラーハンドリングをテストする
  - _Requirements: 2.2, 9.1_

- [x] 3. データベース接続の環境自動切り替え
- [x] 3.1 環境判定と GCS からの DB ロード機能の追加
  - CLOUD_STORAGE_BUCKET 環境変数の有無でローカル環境と Cloud Run 環境を自動判定する
  - Cloud Run 環境では GCS から data.db をダウンロードし、sql.js でメモリ上に展開する
  - ローカル環境では既存の openDatabase() と createAutoReloadProxy をそのまま使用する
  - コンテナ起動時に1回だけ GCS からダウンロードし、以降のリクエストではメモリ上の DB を使用する
  - 切り替えロジックを connection.ts 内に集約する
  - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 9.1_
  - _Contracts: DatabaseProvider Service_

- [x] 3.2 GCS メタデータによる定期キャッシュ更新の実装
  - 設定間隔（デフォルト5分）で GCS オブジェクトのメタデータをチェックする
  - generation の変化を検知した場合にのみ data.db を再ダウンロードして DB を更新する
  - リクエスト処理中はメモリ上の DB を使用し、リクエストごとのダウンロードは行わない
  - キャッシュチェック間隔を環境変数 DB_CACHE_CHECK_INTERVAL で設定可能にする
  - get_data_status ツールでデータの鮮度情報を返却できるようにする
  - _Requirements: 9.2, 9.3, 9.4_

- [x]* 3.3 DatabaseProvider のユニットテスト
  - ローカルモードと GCS モードの切り替えロジックをテストする
  - キャッシュ更新の判定ロジック（generation 比較）をテストする
  - _Requirements: 2.1, 2.3, 9.2_

- [x] 4. HTTP エントリーポイントとセキュリティミドルウェア
- [x] 4.1 Express サーバーと StreamableHTTPServerTransport による HTTP エントリーポイントの実装
  - Express HTTP サーバーを起動し、PORT 環境変数（デフォルト: 8080）でリッスンする
  - POST /mcp（MCP リクエスト）、GET /mcp（SSE）、DELETE /mcp（セッション終了）のルーティングを構成する
  - StreamableHTTPServerTransport をリクエストごとに生成し、セッション ID で管理する
  - 既存の registerTools() を使用してツールを登録する（ツールロジックは完全に共有）
  - SIGTERM ハンドラでグレースフルシャットダウンを実装する
  - Express パッケージを mcp パッケージの依存関係に追加する
  - _Requirements: 1.1, 1.2, 1.3, 1.5_
  - _Contracts: HttpEntryPoint Service_

- [x] 4.2 ヘルスチェックエンドポイントの実装
  - GET /health エンドポイントを追加する
  - DB ロード完了時に 200 OK（DB 状態情報を含む）を返し、未完了時に 503 Service Unavailable を返す
  - Cloud Run の Startup probe として機能させ、GCS からの DB ダウンロード完了前にリクエストが到達するのを防止する
  - _Requirements: 1.1_

- [x] 4.3 (P) API キー認証ミドルウェアの実装
  - Authorization: Bearer ヘッダーから API キーを抽出して検証する Express ミドルウェアを作成する
  - API キーの取得元として環境変数 API_KEYS（カンマ区切り）をサポートする
  - 無効な API キーのリクエストには 401 Unauthorized を返却する
  - ヘルスチェックパス（/health）は認証をバイパスする
  - CORS ヘッダーの設定を行い、許可オリジンを環境変数 CORS_ORIGINS で制御する
  - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5_
  - _Contracts: AuthMiddleware Service_

- [x] 4.4 (P) IP ベースレート制限ミドルウェアの実装
  - express-rate-limit を使用して IP アドレスごとのリクエスト数を制限する Express ミドルウェアを作成する
  - 時間窓（RATE_LIMIT_WINDOW_MS、デフォルト15分）と最大リクエスト数（RATE_LIMIT_MAX、デフォルト100）を環境変数で設定可能にする
  - 制限超過時に 429 Too Many Requests と Retry-After ヘッダーを返却する
  - express-rate-limit パッケージを mcp パッケージの依存関係に追加する
  - _Requirements: 7.1, 7.2, 7.3, 7.4_
  - _Contracts: RateLimitMiddleware Service_

- [x] 4.5 ミドルウェアチェーンの統合
  - CORS → Auth → RateLimit → MCP の順でミドルウェアチェーンを構成する
  - 認証とレート制限の有効化を設定で制御可能にする
  - stdio 環境ではセキュリティミドルウェアが適用されないことを確認する
  - _Requirements: 1.1, 6.4, 6.5, 7.4_

- [x] 5. スクレイパー Cloud Run Job ランナーの実装
- [x] 5.1 Cloud Run Job 用スクレイパーエントリーポイントの実装
  - 既存のスクレイパーロジックを呼び出し、eiga.com から上映情報をスクレイピングする
  - スクレイピング結果を sql.js で data.db に構築する
  - 完成した data.db を GCS バケットにアップロードする
  - スクレイピング対象エリアを環境変数 SCRAPE_AREAS で指定可能にする
  - CLOUD_STORAGE_BUCKET 環境変数を必須とし、未設定時はエラーで終了する
  - 同日の再実行では GCS 上の data.db を上書きする（冪等性の確保）
  - _Requirements: 4.1, 4.2, 4.5_
  - _Contracts: ScraperJobRunner Batch_

- [x]* 5.2 スクレイパー Job ランナーのユニットテスト
  - GCS アップロード処理をモックでテストする
  - エリア設定の読み込みと適用をテストする
  - _Requirements: 4.2, 4.5_

- [x] 6. コンテナイメージの作成
- [x] 6.1 (P) MCP サーバー用 Dockerfile の作成
  - マルチステージビルドを構成する（Stage 1: pnpm install + tsc ビルド、Stage 2: node:20-slim + dist のみ）
  - 最終イメージに devDependencies を含めない
  - PORT=8080 をデフォルト環境変数として設定し、非 root ユーザー（node）で実行する
  - ローカルでの Docker ビルドとコンテナ起動が成功することを検証する
  - _Requirements: 3.7, 8.1, 8.2_

- [x] 6.2 (P) スクレイパー用 Dockerfile の作成
  - node:20-bookworm をベースに Playwright と Chromium をインストールする
  - npx playwright install --with-deps chromium で Chromium のみをインストールする
  - 非 root ユーザーで実行する
  - ローカルでの Docker ビルドが成功することを検証する
  - _Requirements: 4.1, 8.1, 8.3_

- [x] 7. Terraform インフラ定義
- [x] 7.1 (P) Cloud Run Service/Job と関連 GCP リソースの Terraform 定義
  - infra/ ディレクトリに main.tf, variables.tf, outputs.tf, terraform.tfvars を作成する
  - Cloud Run v2 Service を定義する（max_instance_count=3、min_instance_count=0、max_instance_request_concurrency=80、timeout=30s、startup_cpu_boost=true、deletion_protection=true）
  - Startup probe として HTTP GET /health を設定する（initial_delay_seconds=2、period_seconds=3、failure_threshold=10）
  - Cloud Run v2 Job をスクレイパー用に定義する（max_retries=3）
  - Cloud Scheduler Job を定義する（毎日 06:00 JST、oauth_token でサービスアカウント認証）
  - GCS バケット、Artifact Registry リポジトリ、Secret Manager シークレットを定義する
  - IAM を設定する（Cloud Run SA → roles/storage.objectViewer + roles/secretmanager.secretAccessor、Scheduler SA → roles/run.invoker）
  - プロジェクト ID、リージョン等をパラメータ化する
  - terraform validate で構成の妥当性を確認する
  - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 4.3, 4.4, 4.5, 5.1, 5.2, 10.1, 10.2, 10.3_

- [x] 7.2 Budget Alert の Terraform 定義
  - google_billing_budget リソースを定義する（閾値デフォルト: ¥1,000、パラメータ化）
  - Pub/Sub トピックへの通知設定を行う（Phase 1: 通知のみ）
  - 閾値と通知先をパラメータとして外部化する
  - terraform validate で構成の妥当性を確認する
  - _Requirements: 5.3, 5.4, 5.5, 10.4_

- [x] 8. GitHub Actions CI/CD ワークフローの作成
  - .github/workflows/deploy.yml を作成する
  - deploy-mcp（MCP サーバー）と deploy-scraper（スクレイパー Job）の2つのジョブを定義する
  - google-github-actions/auth@v3 で Workload Identity Federation 認証を構成する（サービスアカウントキーを使用しない）
  - google-github-actions/deploy-cloudrun@v3 で Cloud Run にデプロイする
  - Docker イメージタグにコミット SHA（${{ github.sha }}）を使用する
  - main ブランチへの push をトリガーとする
  - permissions: id-token: write を設定する
  - _Requirements: 8.4, 8.5_

- [x] 9. 統合テストとエンドツーエンド検証
- [x] 9.1 HTTP エントリーポイントの統合テスト
  - Express サーバーを起動し、MCP リクエスト（POST /mcp）の処理が正常に行われることを検証する
  - 有効な API キーでのアクセス許可と無効な API キーでの 401 拒否をテストする
  - レート制限超過時の 429 レスポンスをテストする
  - ヘルスチェック（GET /health）の応答を検証する
  - _Requirements: 1.1, 1.3, 6.2, 7.3_

- [x] 9.2 ローカル版（stdio）のリグレッションテスト
  - SDK アップグレード後に stdio トランスポートが正常動作することを確認する
  - 認証ミドルウェアが stdio 環境では適用されないことを確認する
  - レート制限が stdio 環境では適用されないことを確認する
  - _Requirements: 1.4, 6.4, 7.4_

- [x] 9.3 Docker イメージビルドとインフラの検証
  - MCP サーバー用 Dockerfile のビルドとコンテナ起動を検証する
  - スクレイパー用 Dockerfile のビルドとコンテナ起動を検証する
  - Terraform validate + plan の実行結果を確認する
  - _Requirements: 8.1, 8.2, 8.3_
