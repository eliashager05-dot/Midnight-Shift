@echo off
rem Double-click to play MIDNIGHT SHIFT without Node.js (starts a local server on http://localhost:8080).
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0play.ps1" %*
