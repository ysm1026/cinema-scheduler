# Product Overview

映画マラソンスケジューラー - 1日に複数の映画を効率的に鑑賞するための最適スケジュールを提案するMCPサーバー

## Core Capabilities

1. **MCPツール提供** - Claude Desktopと連携し、対話的に映画スケジュールを計画
2. **動的スクレイピング** - Playwrightを使用してeiga.com + チェーン公式サイト（TOHO、Cinema Sunshine）からリアルタイムの上映情報を取得
3. **最適化アルゴリズム** - 優先度・移動時間・プレミアム上映を考慮した複数候補のスケジュール生成
4. **曖昧検索対応** - タイトルの表記ゆれ（中黒・半角全角・カナ）を吸収した検索

## Target Use Cases

- **映画マラソン計画**: 1日で複数の新作映画を効率的に鑑賞したい映画ファン
- **プレミアム体験優先**: IMAX・Dolby Cinema等の特別上映を優先的に選択
- **エリア横断検索**: 複数の映画館エリア（新宿・池袋・渋谷等）を跨いだ最適ルートの計画
- **時間制約対応**: 限られた時間帯内での最大限の映画体験

## Deployment Architecture

| Component | Environment | Details |
|-----------|-------------|---------|
| MCP Server | GCE e2-micro (free tier) | HTTPS (Caddy + Let's Encrypt) + Express |
| Scraper | ローカル Windows | Task Scheduler で定期実行、GCS にアップロード |
| DB | GCS → sql.js | VM 起動時にダウンロード、インメモリ展開 |

- **MCP Service**: GCE VM 上の systemd サービス（`cinema-mcp.service`）、Caddy リバースプロキシ経由で HTTPS 公開
- **Scraper**: ローカル Windows で実行（eiga.com 全国 + チェーンスクレイパー）、結果を GCS にアップロード
- **HTTPS**: Caddy + DuckDNS (`cinema-scheduler.duckdns.org`) で自動証明書管理
- **インフラ**: Terraform で GCP リソースを管理（`infra/`）
- **CI/CD**: GitHub Actions + Workload Identity Federation で SSH デプロイ

## Value Proposition

- **MCP統合**: Claude Desktopのネイティブツールとして動作
- **パブリック HTTPS 公開**: GCE + Caddy 経由で任意の MCP クライアントからアクセス可能
- **動的データ取得**: JavaScriptで生成される映画館サイトに対応
- **複数候補提案**: 単一解ではなく複数のスケジュール候補を提示
- **曖昧検索**: ユーザーの入力揺れを吸収（「ランニングマン」→「ランニング・マン」）

## Data Sources

| Source | Coverage | Method |
|--------|----------|--------|
| eiga.com | 全国384エリア | エリアページスクレイピング |
| TOHO | 全国TOHOシネマズ | 公式サイト直接スクレイピング（マスターデータ駆動） |
| Cinema Sunshine | 全国シネマサンシャイン | 公式サイト直接スクレイピング（マスターデータ駆動） |

## MCP Tools

| Tool | Purpose |
|------|---------|
| `list_movies` | エリアの上映映画一覧を取得 |
| `list_theaters` | エリアの映画館一覧を取得 |
| `get_showtimes` | 映画/映画館の上映スケジュールを取得 |
| `optimize_schedule` | 複数映画の最適スケジュールを生成 |
| `get_data_status` | スクレイピングデータの状態を確認 |

## Supported Premium Formats

MCPツールは以下のプレミアム上映形式を検出・サポートします：

| Format | Description | 表記例 |
|--------|-------------|--------|
| `IMAX` | IMAXシアター（レーザー含む） | IMAX, IMAXレーザー |
| `DOLBY_CINEMA` | ドルビーシネマ | ドルビーシネマ, Dolby Cinema |
| `DOLBY_ATMOS` | ドルビーアトモス音響 | ドルビーアトモス, Dolby Atmos |
| `4DX` | 体感型4Dシアター | 4DX, MX4D |
| `SCREENX` | 3面スクリーン | SCREEN X, ScreenX |
| `GOOON` | 轟音シアター（没入型音響） | 轟音 |
| `TCX` | TOHOシネマズ大型スクリーン | TCX, TOHO CINEMAS eXtra |

**注記**: 上映形式がない場合は `null` が返されます（通常上映）。

## Audio Types

MCPツールは音声タイプ（字幕/吹替）を検出します：

| Type | Description |
|------|-------------|
| `subtitled` | 字幕版 |
| `dubbed` | 吹替版 |
| `null` | 不明または通常（表記なし） |

---
_Focus on patterns and purpose, not exhaustive feature lists_
_updated_at: 2026-02-25 — Cloud Run → GCE 移行、チェーンスクレイパー追加、HTTPS化を反映_
