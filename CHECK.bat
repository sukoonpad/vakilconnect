@echo off
title VakilConnect - Diagnostic
color 0E

echo.
echo   ============================================================
echo        VakilConnect - Diagnostic Check
echo   ============================================================
echo.
echo   Checking your system... (will NOT close automatically)
echo.

echo   [1/4] Windows version:
ver
echo.

echo   [2/4] Node.js in PATH?
where node 2>nul
if %ERRORLEVEL% EQU 0 (
    echo   Version:
    node --version
) else (
    echo   NOT in PATH.
    echo.
    echo   Checking common install locations:
    if exist "%ProgramFiles%\nodejs\node.exe" (
        echo     Found: %ProgramFiles%\nodejs\node.exe
        "%ProgramFiles%\nodejs\node.exe" --version
    ) else (
        echo     NOT at: %ProgramFiles%\nodejs\
    )
    if exist "%LOCALAPPDATA%\Programs\nodejs\node.exe" (
        echo     Found: %LOCALAPPDATA%\Programs\nodejs\node.exe
    ) else (
        echo     NOT at: %LOCALAPPDATA%\Programs\nodejs\
    )
)
echo.

echo   [3/4] Current folder:
echo     %~dp0
if exist "%~dp0local-dev\server.js" (
    echo     server.js: FOUND
) else (
    echo     server.js: MISSING!
)
if exist "%~dp0local-dev\node_modules" (
    echo     node_modules: INSTALLED
) else (
    echo     node_modules: NOT INSTALLED (normal before first run)
)
echo.

echo   [4/4] Port 4000 status:
netstat -ano | findstr :4000 | findstr LISTENING
if %ERRORLEVEL% EQU 0 (
    echo     Something is ALREADY listening on port 4000!
    echo     Either your server is running OR another app is using it.
) else (
    echo     Port 4000 free — server can start.
)
echo.

echo   ============================================================
echo     Diagnostic complete.
echo     Is window ka screenshot bhejo agar error hai.
echo   ============================================================
echo.
echo   Koi key dabao window band karne ke liye...
pause >nul
