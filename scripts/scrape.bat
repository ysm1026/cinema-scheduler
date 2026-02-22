@echo off
REM Cinema Scheduler - Local Scraper for Windows
REM Runs scrape-cloud.js locally and uploads data.db to GCS
REM
REM Prerequisites:
REM   1. gcloud CLI installed and authenticated:
REM      gcloud auth application-default login
REM   2. Node.js + pnpm installed
REM   3. Project built: pnpm build

setlocal

set CLOUD_STORAGE_BUCKET=cinema-scheduler-cinema-scheduler-2026
set SCRAPE_AREAS=新宿,池袋,有楽町,渋谷,日本橋,上野,六本木,品川,銀座
set SCRAPE_DAYS=3
set SCRAPE_CONCURRENCY=3

cd /d "%~dp0.."
echo === Cinema Scheduler Scraper ===
echo Bucket: %CLOUD_STORAGE_BUCKET%
echo Areas: %SCRAPE_AREAS%
echo Days: %SCRAPE_DAYS%

node packages\cron\dist\jobs\scrape-cloud.js

if %ERRORLEVEL% neq 0 (
    echo [ERROR] Scraper failed with exit code %ERRORLEVEL%
    exit /b %ERRORLEVEL%
)

echo === Scrape complete ===
