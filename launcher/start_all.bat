@echo off
chcp 65001 >nul
title Medical Agent Launcher

set BACKEND_DIR=%~dp0..\backend

echo ============================================
echo   Medical Planning Agent - One-Click Start
echo ============================================
echo.

REM Kill existing Chrome so we can restart with CDP
taskkill /F /IM chrome.exe /T 2>nul
timeout /t 2 /nobreak >nul

REM Start Python backend in a new window
echo [1/3] Starting Python backend...
start "MedicalAgent-Backend" /D "%BACKEND_DIR%" "D:\Program Files\anaconda3\envs\ai_agent\python.exe" -m uvicorn main:app --host 127.0.0.1 --port 8765

REM Wait for backend to be ready
echo [2/3] Waiting for backend...
:wait_backend
timeout /t 1 /nobreak >nul
curl -s http://127.0.0.1:8765/health >nul 2>&1
if errorlevel 1 goto wait_backend
echo        Backend is ready.

REM Start Chrome with CDP port
echo [3/3] Starting Chrome with CDP...
start "" "C:\Program Files\Google\Chrome\Application\chrome.exe" --remote-debugging-port=9222

echo.
echo ============================================
echo   All services started!
echo   - Backend: http://127.0.0.1:8765
echo   - Chrome CDP: http://localhost:9222
echo.
echo   Now open your medical planning software
echo   and click the extension icon to start.
echo ============================================
echo.
pause
