@echo off
setlocal EnableDelayedExpansion
title SimpleMDG Automation App Setup
color 0F

echo.
echo  ============================================================
echo   SimpleMDG Automation Dashboard - First-time Setup
echo  ============================================================
echo.

:: ── Step 0: Check Node.js ──────────────────────────────────────
echo  [0/4] Checking Node.js...
node --version >nul 2>&1
if %errorlevel% neq 0 (
    echo  [ERROR] Node.js not found. Install from https://nodejs.org
    pause & exit /b 1
)
for /f "tokens=*" %%v in ('node --version') do set NODE_VER=%%v
echo         Found Node.js %NODE_VER%
echo.

:: ── Step 1: Install root project dependencies ──────────────────
echo  [1/4] Installing project dependencies...
echo         (playwright, typescript, dotenv, etc.)
echo.
call npm install
if %errorlevel% neq 0 (
    echo  [ERROR] npm install failed.
    pause & exit /b 1
)
echo         Done.
echo.

:: ── Step 2: Install Playwright browsers ────────────────────────
echo  [2/4] Installing Playwright Chromium browser...
call npx playwright install chromium
if %errorlevel% neq 0 (
    echo  [WARNING] Chromium install failed. Retry: npx playwright install chromium
)
echo         Done.
echo.

:: ── Step 3: Setup dashboard folder and install server deps ─────
echo  [3/4] Setting up dashboard and installing server dependencies...
if not exist "dashboard" mkdir dashboard
if not exist "dashboard\public" mkdir dashboard\public
if not exist "dashboard\data" mkdir dashboard\data
if not exist "dashboard\data\runs" mkdir dashboard\data\runs
if not exist "dashboard\reports" mkdir dashboard\reports

:: Always install express and glob directly — no dependency on package.json contents
call npm install express glob --prefix dashboard
if %errorlevel% neq 0 (
    echo  [ERROR] Failed to install dashboard dependencies.
    pause & exit /b 1
)
echo         Done.
echo.

:: ── Step 4: Verify express is accessible ───────────────────────
echo  [4/4] Verifying dashboard dependencies...
node -e "require('express'); console.log('         express OK');" 2>nul || (
    node -e "require('./dashboard/node_modules/express'); console.log('         express OK');" 2>nul || (
        echo  [WARNING] express may not be accessible. Try running install.bat again.
    )
)
echo         Done.
echo.

:: ── Done ───────────────────────────────────────────────────────
echo  ============================================================
echo   Setup complete!
echo.
echo     Node.js     : %NODE_VER%
echo     Playwright  : Chromium installed
echo     Dashboard   : express + glob installed
echo.
echo   Run automation.bat to start the dashboard.
echo  ============================================================
echo.
pause
