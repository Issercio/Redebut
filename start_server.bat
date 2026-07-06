@echo off
cd /d "%~dp0"
set PORT=8000

echo Lancement du serveur sur http://localhost:%PORT%/

echo.
where py >nul 2>nul
if not errorlevel 1 (
  py -3 -m http.server %PORT%
  goto :eof
)

where python >nul 2>nul
if not errorlevel 1 (
  python -m http.server %PORT%
  goto :eof
)

echo Python n'a pas ete trouve.
echo Installe Python 3 depuis https://www.python.org/downloads/
echo puis relance ce fichier.
pause
