@echo off
title BPM4B Audiobook Converter v12.0.0
echo.
echo ╔═══════════════════════════════════════════════════════════════╗
echo ║          BPM4B Professional Converter v12.0.0                ║
echo ║  (Local Kokoro-82M Engine ^| Premium Audio Conversion)       ║
echo ║                                                               ║
echo ║  Starting server on http://localhost:3000                   ║
echo ║  Opening browser automatically...                             ║
echo ╚═══════════════════════════════════════════════════════════════╝
echo.
echo Keep this window open while using the app.
echo Press Ctrl+C to stop the server.
echo.

:: Get the directory where this batch file is located
set "BPM4B_DIR=%~dp0"

:: Start the server in the background using the local node.exe
start "BPM4B Server" /min "%BPM4B_DIR%bin\node.exe" "%BPM4B_DIR%app\bin\bpm4b.js" web -p 3000

:: Wait a few seconds for the server to start
timeout /t 3 /nobreak >nul

:: Open the browser automatically
start "" "http://localhost:3000"

echo Server started! Browser should open shortly.
echo.
echo If browser doesn't open automatically, visit: http://localhost:3000
echo.

:: Keep the window open
echo Press any key to stop the server and close this window...
pause >nul

:: Kill the node process when user presses a key
taskkill /F /IM node.exe >nul 2>&1
echo Server stopped. Goodbye!
