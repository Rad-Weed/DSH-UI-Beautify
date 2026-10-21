@echo off
setlocal
cd /d "%~dp0"
echo =====================================================
echo   DSH Restart Key - restore app.asar
echo =====================================================
echo.
echo This restores the original app.asar (double SHA check)
echo and removes the backup. The title-bar button UI is
echo provided by the DSH UI Beautify plugin and is NOT
echo removed by this script.
echo.
echo If DSH is running you will be asked to quit it from the
echo system tray; a detached background process finishes the
echo restore and restarts DSH.
echo.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\uninstall-restart-key.ps1" -SkipPlugin %*
set "EC=%ERRORLEVEL%"
echo.
if not "%EC%"=="0" echo [FAILED] exit code %EC% - see messages above and the logs folder.
echo.
pause
exit /b %EC%
