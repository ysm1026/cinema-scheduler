@echo off
REM Cinema Scheduler - Windows Task Scheduler セットアップ
REM 管理者権限で実行してください（右クリック→管理者として実行）
REM
REM 毎日 06:00 (JST) にスクレイパーを自動実行するタスクを登録します
REM 削除: schtasks /delete /tn "CinemaSchedulerScraper" /f

setlocal

REM --- 設定 ---
set TASK_NAME=CinemaSchedulerScraper
set SCRIPT_PATH=%~dp0scrape.bat
set LOG_DIR=%~dp0..\logs
set SCHEDULE_TIME=06:00

REM --- 管理者権限チェック ---
net session >nul 2>&1
if %ERRORLEVEL% neq 0 (
    echo [ERROR] 管理者権限が必要です。右クリック→「管理者として実行」してください。
    pause
    exit /b 1
)

REM --- ログディレクトリ作成 ---
if not exist "%LOG_DIR%" mkdir "%LOG_DIR%"

REM --- 既存タスク削除 ---
schtasks /query /tn "%TASK_NAME%" >nul 2>&1
if %ERRORLEVEL% equ 0 (
    echo 既存タスク "%TASK_NAME%" を削除中...
    schtasks /delete /tn "%TASK_NAME%" /f
)

REM --- タスク登録 ---
echo タスク "%TASK_NAME%" を登録中...
echo   スクリプト: %SCRIPT_PATH%
echo   実行時刻: 毎日 %SCHEDULE_TIME%

schtasks /create ^
  /tn "%TASK_NAME%" ^
  /tr "\"%SCRIPT_PATH%\" > \"%LOG_DIR%\scrape-%%date:~0,4%%%%date:~5,2%%%%date:~8,2%%.log\" 2>&1" ^
  /sc daily ^
  /st %SCHEDULE_TIME% ^
  /rl highest ^
  /f

if %ERRORLEVEL% neq 0 (
    echo [ERROR] タスクの登録に失敗しました
    pause
    exit /b 1
)

echo.
echo === セットアップ完了 ===
echo タスク名: %TASK_NAME%
echo 実行時刻: 毎日 %SCHEDULE_TIME%
echo ログ出力: %LOG_DIR%\
echo.
echo 確認: schtasks /query /tn "%TASK_NAME%" /v
echo 手動実行: schtasks /run /tn "%TASK_NAME%"
echo 削除: schtasks /delete /tn "%TASK_NAME%" /f
pause
