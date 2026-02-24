@echo off
REM Cinema Scheduler - Local Scraper + Sheets Export for Windows
REM 1. Scrapes showtimes to local data.db (GCS upload if CLOUD_STORAGE_BUCKET is set)
REM 2. Exports today's data to Google Spreadsheet
REM
REM Prerequisites:
REM   1. Node.js + pnpm installed
REM   2. Project built: pnpm build
REM   3. config/service-account.json for Sheets API
REM   4. gcloud auth application-default login for GCS upload

setlocal

REM SCRAPE_AREAS を未設定にすると全国エリア（areas.yaml の全エリア）を対象とする
set SCRAPE_DAYS=3
set SCRAPE_CONCURRENCY=3
set CLOUD_STORAGE_BUCKET=cinema-scheduler-cinema-scheduler-2026

cd /d "%~dp0.."
echo === Cinema Scheduler Scraper ===
echo Areas: All (areas.yaml)
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
