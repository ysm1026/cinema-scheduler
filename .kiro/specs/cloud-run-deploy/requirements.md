# Requirements Document

## Introduction

Cinema Scheduler MCP サーバーを Google Cloud Run にデプロイし、パブリック公開可能にする。現在のローカル版（stdio トランスポート）は開発環境として維持し、Cloud Run 版（HTTP トランスポート）と共存させる。環境設定はデプロイ時に自動的に切り替わる。費用は max-instances 制限と Budget 自動停止で確実に制御する。

## Requirements

### Requirement 1: デュアルトランスポート対応

**Objective:** 開発者として、ローカル開発環境（stdio）とクラウド環境（HTTP）の両方で同じ MCP ツールを利用したい。コードの重複を避けつつ、両環境をサポートするため。

#### Acceptance Criteria

1. The MCP Server shall ローカル用エントリーポイント（`server.ts`、stdio トランスポート）と Cloud Run 用エントリーポイント（`handler.ts`、HTTP トランスポート）の2つを提供する
2. The MCP Server shall 両エントリーポイントから共通のツール登録ロジック（`tools/` ディレクトリ）を使用する
3. When Cloud Run 用エントリーポイントで起動した場合、the MCP Server shall 環境変数 `PORT`（デフォルト: 8080）で HTTP リクエストをリッスンする
4. When ローカル用エントリーポイントで起動した場合、the MCP Server shall 従来通り stdio トランスポートで動作する
5. The MCP Server shall MCP SDK の `StreamableHTTPServerTransport` を HTTP トランスポートとして使用する

### Requirement 2: 環境設定の自動切り替え

**Objective:** 開発者として、デプロイ先に応じて設定が自動的に切り替わってほしい。手動で設定を変更する手間とミスを排除するため。

#### Acceptance Criteria

1. The MCP Server shall 環境変数 `CLOUD_STORAGE_BUCKET` の有無でローカル環境と Cloud Run 環境を判定する
2. While `CLOUD_STORAGE_BUCKET` が設定されている場合、the MCP Server shall Cloud Storage から `data.db` をダウンロードしてメモリ上の sql.js で開く
3. While `CLOUD_STORAGE_BUCKET` が未設定の場合、the MCP Server shall ローカルファイル（`~/.cinema-scheduler/data.db`）から直接読み込む
4. The MCP Server shall データベースソースの切り替えロジックを `@cinema-scheduler/shared` パッケージの `connection.ts` に集約する
5. When Cloud Run 環境でデータベースを開く場合、the MCP Server shall コンテナ起動時に1回だけ Cloud Storage からダウンロードし、以降のリクエストではメモリ上のDBを使用する

### Requirement 3: Cloud Run Service デプロイ構成

**Objective:** 開発者として、MCP サーバーを Cloud Run Service としてデプロイしたい。サーバーレスでスケーラブルなパブリック公開を実現するため。

#### Acceptance Criteria

1. The Cloud Run Service shall `asia-northeast1`（東京）リージョンにデプロイされる
2. The Cloud Run Service shall 1 vCPU / 512 MiB メモリで構成される
3. The Cloud Run Service shall `min-instances: 0`（スケールtoゼロ）で構成される
4. The Cloud Run Service shall `max-instances: 3` で構成され、費用の物理的上限とする
5. The Cloud Run Service shall リクエストタイムアウトを 30 秒に設定する
6. The Cloud Run Service shall Startup CPU Boost を有効化してコールドスタートを軽減する
7. The Dockerfile shall Node.js 20 ベースのスリムイメージを使用し、MCP サーバーの実行に必要な最小限のファイルのみを含む

### Requirement 4: Cloud Run Job によるスクレイピング

**Objective:** 開発者として、スクレイパーを Cloud Run Job として定期実行したい。ローカルPCを起動していなくてもデータが更新されるようにするため。

#### Acceptance Criteria

1. The Cloud Run Job shall Playwright を含むコンテナイメージでスクレイパーを実行する
2. When スクレイピングが完了した場合、the Cloud Run Job shall 生成された `data.db` を Cloud Storage バケットにアップロードする
3. The Cloud Scheduler shall 毎日 06:00 JST に Cloud Run Job を起動する
4. If スクレイピングが失敗した場合、the Cloud Run Job shall 最大3回までリトライする
5. The Cloud Run Job shall スクレイピング対象エリアを環境変数または設定ファイルで指定可能とする

### Requirement 5: 費用制御

**Objective:** 運用者として、クラウドの月額費用に確実な上限を設けたい。予想外の高額請求を防ぐため。

#### Acceptance Criteria

1. The Cloud Run Service shall `max-instances: 3` により同時実行インスタンス数を物理的に制限する
2. The Cloud Run Service shall `max_instance_request_concurrency: 80`（Cloud Run デフォルト値）により1インスタンスあたりの同時リクエスト数を制限する
3. The GCP Budget Alert shall 月額の費用閾値（例: ¥1,000）を設定し、超過時に通知する
4. When Budget Alert の閾値を超過した場合、the Budget 通知機構 shall Pub/Sub 経由で管理者に通知する（Phase 1: 通知のみ。Phase 2 で Cloud Run function による自動停止を追加予定。費用の物理的上限は max-instances=3 で保証）
5. The Cloud Run Service shall リクエストベース課金モード（デフォルト）を使用し、アイドル時のCPU課金を回避する

### Requirement 6: 認証とアクセス制御

**Objective:** 運用者として、パブリック公開時に不正アクセスや悪用を防ぎたい。セキュリティを確保しつつ正当なユーザーにはアクセスを許可するため。

#### Acceptance Criteria

1. The MCP Server shall API キーによる認証ミドルウェアを提供する
2. When HTTP リクエストに有効な API キーが含まれない場合、the MCP Server shall `401 Unauthorized` を返却する
3. The MCP Server shall API キーを GCP Secret Manager から取得する
4. While ローカル環境（stdio）で動作中、the MCP Server shall 認証ミドルウェアをスキップする
5. The MCP Server shall CORS ヘッダーを設定し、許可するオリジンを制限可能とする

### Requirement 7: レート制限

**Objective:** 運用者として、特定のクライアントからの過剰なリクエストを抑制したい。サービスの安定性と費用を守るため。

#### Acceptance Criteria

1. The MCP Server shall IP アドレスあたりのリクエストレート制限を実装する
2. The MCP Server shall レート制限の設定値（リクエスト数/時間窓）を環境変数で指定可能とする
3. If レート制限を超過した場合、the MCP Server shall `429 Too Many Requests` を返却する
4. While ローカル環境（stdio）で動作中、the MCP Server shall レート制限を適用しない

### Requirement 8: コンテナイメージとCI/CD

**Objective:** 開発者として、コードの変更を自動的に Cloud Run にデプロイしたい。手動デプロイの手間とヒューマンエラーを排除するため。

#### Acceptance Criteria

1. The プロジェクト shall MCP サーバー用とスクレイパー用の2つの Dockerfile を提供する
2. The MCP サーバー用 Dockerfile shall マルチステージビルドで最終イメージサイズを最小化する
3. The スクレイパー用 Dockerfile shall Playwright と Chromium を含むイメージを生成する
4. When `main` ブランチに push した場合、the GitHub Actions ワークフロー shall コンテナイメージをビルドして Artifact Registry に push し、Cloud Run にデプロイする
5. The GitHub Actions shall Workload Identity Federation を使用して GCP に認証する（サービスアカウントキーを使用しない）

### Requirement 9: データベース更新とキャッシュ

**Objective:** 利用者として、常に最新のスクレイピングデータを参照したい。古いデータでスケジュールを立てるリスクを避けるため。

#### Acceptance Criteria

1. When Cloud Run のインスタンスが起動した場合、the MCP Server shall Cloud Storage から最新の `data.db` をダウンロードする
2. The MCP Server shall Cloud Storage 上の `data.db` のメタデータ（更新日時）をチェックし、ローカルキャッシュが古い場合にのみ再ダウンロードする
3. While インスタンスがリクエストを処理中、the MCP Server shall メモリ上のデータベースを使用し、リクエストごとのダウンロードは行わない
4. The MCP Server shall `get_data_status` ツールでデータの鮮度（最終スクレイピング日時、対象日数範囲）を返却する

### Requirement 10: インフラストラクチャ定義

**Objective:** 開発者として、GCP インフラをコードで管理したい。環境の再現性と変更履歴を確保するため。

#### Acceptance Criteria

1. The プロジェクト shall Cloud Run Service、Cloud Run Job、Cloud Storage、Cloud Scheduler、Artifact Registry、Budget Alert の構成を定義するインフラコードを提供する
2. The インフラコード shall Terraform または gcloud CLI スクリプトで記述する
3. The インフラコード shall 環境変数（プロジェクト ID、リージョン等）をパラメータ化する
4. The インフラコード shall Budget Alert の閾値をパラメータとして外部化する
