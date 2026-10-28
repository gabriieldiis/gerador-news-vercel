@echo off
title Gerador de News Kalunga
cd /d "%~dp0"
where node >nul 2>nul || (echo Node.js nao encontrado. Instale em https://nodejs.org e abra de novo. & pause & exit /b 1)
node server.js
pause
