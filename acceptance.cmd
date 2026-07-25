@echo off
setlocal
cd /d "%~dp0"
call npm run accept
if errorlevel 1 (
  echo.
  echo Acceptance failed. Review the error above.
  pause
)
