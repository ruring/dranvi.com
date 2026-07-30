@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo ============================================
echo  DRANVI FAMILY - Publish to dranvi.com
echo ============================================
echo.
echo [1/3] Exporting family data...
node server\export-family-data.js
if errorlevel 1 goto :error
echo.
echo [2/3] Committing changes...
git add family-data.js dra
git commit -m "Update family archive"
echo.
echo [3/3] Pushing to dranvi.com...
git push origin main
if errorlevel 1 goto :error
echo.
echo ============================================
echo  Done! dranvi.com/family/ updates in 1-10 min.
echo  (If you don't see it: Ctrl+Shift+R)
echo ============================================
pause
exit /b 0

:error
echo.
echo *** Something failed - check the message above. ***
pause
exit /b 1
