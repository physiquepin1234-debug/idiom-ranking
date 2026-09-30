@echo off
cd /d "%~dp0"
echo Uploading to GitHub... (a login window may appear the first time)
git push -u origin main
echo.
if errorlevel 1 (echo FAILED. Please tell Claude the message above.) else (echo DONE!)
pause
