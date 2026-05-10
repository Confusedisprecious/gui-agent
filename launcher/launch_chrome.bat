@echo off
echo Starting Chrome with remote debugging port 9222...
echo.
echo IMPORTANT: Close all existing Chrome windows first!
echo This ensures the debugging port is available.
echo.
pause

start "" "C:\Program Files\Google\Chrome\Application\chrome.exe" --remote-debugging-port=9222

echo.
echo Chrome started. Verify by visiting http://localhost:9222/json/version
pause
