@echo off
cd /d "%~dp0"
echo Starting DRANVI FAMILY server + public tunnel...
start "dranvi-family-tunnel" cloudflared tunnel run dranvi-family
node server\app.js
