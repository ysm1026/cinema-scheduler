# @cinema-scheduler/cron

映画スケジュールの自動スクレイピングとGoogleスプレッドシート連携を行うcronジョブ。

## 機能

- **スクレイピング**: 映画.comから上映スケジュールを定期取得
- **エクスポート**: Googleスプレッドシートへの自動出力

## 設定ファイル

`config/cron.yaml` で設定を管理します:

```yaml
# スクレイピング設定
scrape:
  # 対象エリア（コメントアウトで全エリア）
  # areas:
  #   - 新宿
  #   - 池袋
  days: 3  # 何日先までスクレイピングするか

# Googleスプレッドシート連携設定
googleSheets:
  keyFilePath: ./config/service-account.json
  spreadsheetId: "your-spreadsheet-id"

# cronスケジュール設定（cron式）
schedule:
  scrape: "0 5 * * *"   # 毎日 05:00 (UTC)
  export: "0 7 * * *"   # 毎日 07:00 (UTC)
```

## 起動方法

### 開発モード（フォアグラウンド実行）

```bash
pnpm cron:dev
```

**注意**: ターミナルを閉じるとプロセスが終了します。

### 個別ジョブの手動実行

```bash
# スクレイピングのみ
pnpm cron:scrape

# スプレッドシートエクスポートのみ
pnpm cron:export
```

### 本番モード

```bash
pnpm --filter @cinema-scheduler/cron build
pnpm cron
```

## バックグラウンド実行（推奨）

cronは常駐プロセスのため、バックグラウンドで実行する必要があります。

### pm2を使う方法（推奨）

```bash
# pm2をインストール（初回のみ）
npm install -g pm2

# cronを起動
cd /path/to/cinema-scheduler
pm2 start pnpm --name "cinema-cron" -- cron:dev

# 状態確認
pm2 status

# ログ確認
pm2 logs cinema-cron

# 停止
pm2 stop cinema-cron

# 再起動
pm2 restart cinema-cron

# Mac再起動後も自動起動させる
pm2 save
pm2 startup
```

### nohupを使う方法（簡易）

```bash
cd /path/to/cinema-scheduler
nohup pnpm cron:dev > ~/cinema-cron.log 2>&1 &

# プロセス確認
ps aux | grep cron

# 停止
pkill -f "cron:dev"
```

## 比較表

| 方法 | メリット | デメリット |
|------|----------|------------|
| フォアグラウンド | デバッグしやすい | ターミナル閉じると終了 |
| pm2 | 自動再起動、ログ管理、Mac起動時に自動起動 | 別途インストールが必要 |
| nohup | 追加インストール不要 | 管理が手動、自動再起動なし |

## Googleスプレッドシート連携の設定

1. [Google Cloud Console](https://console.cloud.google.com/) でプロジェクトを作成
2. Google Sheets API を有効化
3. サービスアカウントを作成し、JSONキーをダウンロード
4. `config/service-account.json` として保存
5. スプレッドシートをサービスアカウントのメールアドレスと共有

## ログ

pm2使用時:
```bash
pm2 logs cinema-cron
```

nohup使用時:
```bash
tail -f ~/cinema-cron.log
```
