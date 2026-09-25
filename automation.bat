@echo off
title SimpleMDG Automation Dashboard
echo.
echo  Starting SimpleMDG Automation Dashboard...
echo  Open browser at: http://localhost:3000
echo.
start /b cmd /c "timeout /t 2 /nobreak >nul && start http://localhost:3000"
node dashboard/server.js
