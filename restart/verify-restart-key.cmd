@echo off
setlocal
cd /d "%~dp0"
echo =====================================================
echo   DSH Restart Key - health check
echo =====================================================
echo.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\verify-restart-key.ps1" %*
set "EC=%ERRORLEVEL%"
echo.
if not "%EC%"=="0" echo [FAILED] exit code %EC% - see messages above and the logs folder.
echo.
pause
exit /b %EC%
