# Research & Design Decisions

## Summary
- **Feature**: `cloud-run-deploy`
- **Discovery Scope**: Complex Integration（既存システムの Cloud Run 移行 + 新規インフラ構築）
- **Key Findings**:
  - MCP SDK の `StreamableHTTPServerTransport` は HTTP サーバーとの統合が必要で、Express 等の HTTP フレームワークと組み合わせて使用する
  - Terraform google provider v7.19+ で `google_cloud_run_v2_service` / `google_cloud_run_v2_job` が安定利用可能
  - `@google-cloud/storage` の `.download()` メソッドで GCS から Buffer へ直接ダウンロード可能。Cloud Run 内では ADC（Application Default Credentials）で自動認証

## Research Log

### MCP SDK StreamableHTTPServerTransport
- **Context**: 現在の stdio トランスポートから HTTP トランスポートへの移行方法を調査
- **Sources Consulted**: GitHub modelcontextprotocol/typescript-sdk、SDK ソースコード
- **Findings**:
  - `StreamableHTTPServerTransport` は `@modelcontextprotocol/sdk/server/streamableHttp.js` からインポート
  - Node.js の HTTP サーバー（Express 等）と組み合わせて使用する必要がある
  - セッション管理は `mcp-session-id` ヘッダーで行われる
  - `McpServer`（高レベル API）はトランスポートに依存しないため、`registerTools` の既存コードはそのまま利用可能
  - 現在のプロジェクトは SDK `^1.4.1` を使用しているが、StreamableHTTP は新しいバージョンで追加されたため**アップグレードが必要**
- **Implications**: `handler.ts` では Express を HTTP サーバーとして使用し、`StreamableHTTPServerTransport` をリクエストごとに生成して `McpServer` に接続する。ツール登録ロジックは完全に共有可能。

### Terraform Google Provider と Cloud Run v2
- **Context**: Cloud Run Service/Job を Terraform で管理するためのリソース定義を調査
- **Sources Consulted**: Terraform Registry、hashicorp/terraform-provider-google GitHub
- **Findings**:
  - 最新 provider version: **v7.19.0**（2025年2月時点）
  - `google_cloud_run_v2_service`: スケーリングは `template.scaling` ブロック内に `min_instance_count` / `max_instance_count`
  - `template.max_instance_request_concurrency`: 1インスタンスあたりの同時リクエスト数（デフォルト: CPU≥1 の場合 80）
  - `template.timeout`: リクエストタイムアウト（例: `"30s"`）
  - `template.service_account`: リビジョンの IAM サービスアカウント
  - `google_cloud_run_v2_job`: バッチジョブ用。`template.task_count`、`template.template.max_retries` で制御
  - `deletion_protection` がデフォルト有効（v6.0+ の破壊的変更）
- **Implications**: Terraform で全インフラを定義可能。`template.scaling` でコスト上限を物理的に制御。

### Google Cloud Storage Node.js クライアント
- **Context**: Cloud Run から GCS 上の data.db を読み書きする方法を調査
- **Sources Consulted**: Google Cloud 公式ドキュメント、googleapis/nodejs-storage サンプルコード
- **Findings**:
  - パッケージ: `@google-cloud/storage`
  - ダウンロード: `storage.bucket(name).file(name).download()` → Buffer を返す
  - アップロード: `storage.bucket(name).file(name).save(contents)`
  - メタデータ取得: `storage.bucket(name).file(name).getMetadata()` → `metadata.updated`（最終更新日時）
  - Cloud Run 内では ADC（Application Default Credentials）で自動認証される（追加設定不要）
  - `metadata.generation` でオブジェクトのバージョンを追跡可能
- **Implications**: `connection.ts` に GCS ダウンロードロジックを追加。`metadata.updated` でキャッシュの鮮度チェック。

### Playwright Docker イメージ
- **Context**: スクレイパーを Cloud Run Job で実行するためのコンテナイメージを調査
- **Sources Consulted**: playwright.dev/docs/docker、Microsoft Artifact Registry
- **Findings**:
  - 公式イメージ: `mcr.microsoft.com/playwright:v1.58.2-noble`（Ubuntu 24.04 LTS ベース）
  - Node.js 20 を含む
  - ブラウザと依存関係がプリインストール済み（ただし Playwright パッケージ自体は別途インストール必要）
  - スクレイピング（信頼できないサイト）の場合は非 root ユーザー + seccomp プロファイルを推奨
  - 代替: `FROM node:20-bookworm` + `RUN npx playwright install --with-deps` でも構築可能
- **Implications**: スクレイパー用 Dockerfile は `node:20-bookworm` ベースで Playwright を手動インストールする方式を採用（イメージサイズとバージョン管理の柔軟性）。

### GitHub Actions deploy-cloudrun
- **Context**: CI/CD パイプラインでの Cloud Run デプロイ方法を調査
- **Sources Consulted**: google-github-actions/deploy-cloudrun GitHub リポジトリ
- **Findings**:
  - 最新バージョン: **v3**
  - `service` と `job` の両方をサポート
  - Workload Identity Federation による認証: サービスアカウントキー不要
  - 入力パラメータ: `service`、`job`、`image`、`source`、`region`、`env_vars`、`secrets` 等
  - `google-github-actions/auth@v3` と組み合わせて認証
  - `permissions: id-token: write` が必要
- **Implications**: MCP サーバーとスクレイパーで別々のワークフロージョブを定義。Workload Identity Federation でセキュアな認証。

## Architecture Pattern Evaluation

| Option | Description | Strengths | Risks / Limitations | Notes |
|--------|-------------|-----------|---------------------|-------|
| デュアルエントリーポイント | server.ts（stdio）と handler.ts（HTTP）でトランスポートのみ分離 | 最小限の変更、ツールロジック完全共有 | エントリーポイントの保守が2箇所 | 採用 |
| アダプターパターン | 抽象トランスポート層を作成して切り替え | 高い拡張性 | 過度な抽象化、MCP SDK が既にトランスポート抽象化を提供 | 不採用 |
| 別パッケージ化 | Cloud Run 用に新パッケージを作成 | 完全な分離 | コード重複、保守コスト増大 | 不採用 |

## Design Decisions

### Decision: HTTP フレームワーク
- **Context**: StreamableHTTPServerTransport は Node.js HTTP サーバーとの統合が必要
- **Alternatives Considered**:
  1. Express — 最もポピュラー、ミドルウェアエコシステムが豊富
  2. Hono — 軽量、Edge 対応
  3. 素の Node.js http モジュール — 依存なし
- **Selected Approach**: Express
- **Rationale**: 認証・CORS・レート制限のミドルウェアが豊富。MCP SDK の公式サンプルでも Express が使用されている。
- **Trade-offs**: バンドルサイズが Hono より大きいが、Cloud Run ではイメージサイズの影響は軽微。

### Decision: DB キャッシュ戦略
- **Context**: Cloud Run インスタンスが GCS から data.db を効率的に取得する方法
- **Alternatives Considered**:
  1. リクエストごとに GCS からダウンロード — 最新だが遅い
  2. 起動時に1回ダウンロード + メタデータチェック — バランス型
  3. 起動時に1回ダウンロード、キャッシュ固定 — 最速だがデータが古くなる可能性
- **Selected Approach**: 起動時に1回ダウンロード + 定期的なメタデータチェック
- **Rationale**: data.db は1日1回更新されるため、インスタンスの起動時にダウンロードすれば十分。定期チェック（5分間隔）でスクレイパー実行後の更新も反映。
- **Trade-offs**: コールドスタートがダウンロード分だけ遅くなる（data.db が数 MB なら1秒以下）。

### Decision: レート制限の実装方式
- **Context**: パブリック公開時の過剰リクエスト防止
- **Alternatives Considered**:
  1. express-rate-limit — Express ミドルウェア、インメモリストア
  2. Cloud Armor — GCP ネイティブの WAF/DDoS 防御
  3. API Gateway — フル機能の API 管理
- **Selected Approach**: express-rate-limit（インメモリストア）
- **Rationale**: Cloud Run のインスタンスごとに独立したレート制限。max-instances=3 と組み合わせることで全体の上限も制御。Cloud Armor は追加コストが発生。
- **Trade-offs**: インスタンス間でレート制限状態を共有しないため、厳密なグローバルレート制限にはならない。ただし max-instances との組み合わせで実用上十分。

### Decision: Terraform モジュール構成
- **Context**: GCP インフラのコード管理方法
- **Alternatives Considered**:
  1. フラット構成 — 全リソースを1ディレクトリに配置
  2. モジュール分割 — サービスごとにモジュール化
- **Selected Approach**: フラット構成（`infra/` ディレクトリに集約）
- **Rationale**: リソース数が少なく（6-8リソース）、モジュール分割の恩恵が薄い。変数ファイル（`terraform.tfvars`）でパラメータを外部化。
- **Trade-offs**: リソースが増えた場合はモジュール化を検討。

## Risks & Mitigations
- **MCP SDK バージョンアップ** — ^1.4.1 からの破壊的変更の可能性 → アップグレード後にローカル版の動作確認テストを実施
- **Playwright コンテナサイズ** — Chromium を含むため1GB以上になる可能性 → Cloud Run Job は起動時間の制約が緩い（7日間）ため許容
- **コールドスタート + GCS ダウンロード** — 初回リクエストの遅延 → Startup CPU Boost で軽減、data.db のサイズを監視
- **Budget 自動停止の遅延** — Pub/Sub + Cloud Function の伝搬に数分かかる → max-instances が物理的な上限として機能

## References
- [MCP SDK TypeScript](https://github.com/modelcontextprotocol/typescript-sdk) — StreamableHTTPServerTransport の実装
- [Terraform google_cloud_run_v2_service](https://registry.terraform.io/providers/hashicorp/google/latest/docs/resources/cloud_run_v2_service) — Cloud Run Service リソース定義
- [Terraform google_cloud_run_v2_job](https://registry.terraform.io/providers/hashicorp/google/latest/docs/resources/cloud_run_v2_job) — Cloud Run Job リソース定義
- [GCS Node.js クライアント](https://github.com/googleapis/nodejs-storage) — ダウンロード/アップロード/メタデータ API
- [Playwright Docker ドキュメント](https://playwright.dev/docs/docker) — コンテナイメージの使用方法
- [deploy-cloudrun GitHub Action](https://github.com/google-github-actions/deploy-cloudrun) — CI/CD デプロイアクション
- [Cloud Run 料金](https://cloud.google.com/run/pricing) — 無料枠と従量課金
