@echo off
title LegalOS
cd /d "%~dp0"
set PORT=4700
echo.
echo   Starting LegalOS...
echo.
echo   LegalOS (legal team)      http://localhost:4700
echo   Requester Portal          http://localhost:4700/portal/
echo.
echo   Both are served by this one process. Open them in two tabs to see
echo   them talk to each other.
echo   (Keep this window open. Press Ctrl+C to stop.)
echo.
node server.js
pause
