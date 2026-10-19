@echo off
setlocal
cd /d "%~dp0"
echo =====================================================
echo   DSH Restart Key - install desktop shell patch
echo =====================================================
echo.
echo The title-bar "Restart" button UI comes from the
echo DSH UI Beautify v0.8.0+ plugin. This script only patches
echo app.asar (IPC + preload bridge) so the button can
echo actually restart the app and the Host.
echo.
echo If DSH is running you will be asked to quit it from the
echo system tray; a detached background process then patches
echo app.asar with double SHA verification and restarts DSH.
echo.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\install-restart-key.ps1" %*
set "EC=%ERRORLEVEL%"
echo.
if not "%EC%"=="0" echo [FAILED] exit code %EC% - see messages above and the logs folder.
echo.
pause
exit /b %EC%
