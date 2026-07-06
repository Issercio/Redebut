@echo off
cd /d "%~dp0"
where py >nul 2>nul
if %ERRORLEVEL% EQU 0 (
  py -3 -m http.server 8000
) else (
  python -m http.server 8000
)
