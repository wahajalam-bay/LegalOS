@echo off
title LegalOS
cd /d "%~dp0"
set PORT=4700
echo.
echo   Starting LegalOS...
echo   Open http://localhost:4700 in your browser.
echo   (Keep this window open. Press Ctrl+C to stop.)
echo.
node server.js
pause
