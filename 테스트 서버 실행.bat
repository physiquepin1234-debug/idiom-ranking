@echo off
start http://localhost:8080/
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0tools\serve.ps1"
