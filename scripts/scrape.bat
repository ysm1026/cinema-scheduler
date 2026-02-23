@echo off
REM Cinema Scheduler - Local Scraper + Sheets Export for Windows
REM 1. Scrapes showtimes to local data.db (GCS upload if CLOUD_STORAGE_BUCKET is set)
REM 2. Exports today's data to Google Spreadsheet
REM
REM Prerequisites:
REM   1. Node.js + pnpm installed
REM   2. Project built: pnpm build
REM   3. config/service-account.json for Sheets API
REM   4. (Optional) gcloud CLI + auth for GCS upload

setlocal

set SCRAPE_AREAS=新宿,池袋,有楽町,渋谷,日本橋,上野,六本木,品川,銀座
set SCRAPE_DAYS=3
set SCRAPE_CONCURRENCY=3

cd /d "%~dp0.."
echo === Cinema Scheduler Scraper ===
echo Areas: %SCRAPE_AREAS%
echo Days: %SCRAPE_DAYS%

node packages\cron\dist\jobs\scrape-cloud.js

if %ERRORLEVEL% neq 0 (
    echo [ERROR] Scraper failed with exit code %ERRORLEVEL%
    exit /b %ERRORLEVEL%
)

echo === Scrape complete ===
echo.
echo === Exporting to Google Sheets ===

node packages\cron\dist\jobs\export-sheets.js

if %ERRORLEVEL% neq 0 (
    echo [WARN] Sheets export failed with exit code %ERRORLEVEL%
    REM Export failure is non-fatal - scraping already succeeded
)

echo === All done ===
