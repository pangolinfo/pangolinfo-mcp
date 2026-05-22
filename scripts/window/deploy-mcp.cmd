@echo off
setlocal

REM ============================================================
REM Pangolinfo MCP - build + push to Aliyun ACR
REM
REM Usage:
REM   deploy-mcp.cmd            (tag = latest)
REM   deploy-mcp.cmd 0.2.1      (tag = 0.2.1, recommended for prod)
REM
REM Mirrors ext-scrapeapi/scripts/window/deploy-scrapeapi.cmd:
REM   .cmd entry (Windows) -> wsl -> docker-mcp.sh -> docker build/push.
REM
REM Note: docker build is done inside WSL (the Dockerfile multistage
REM image runs npm ci + npm run build itself, so we do not need to
REM build locally on Windows -- this also avoids npm-on-Windows
REM quoting issues with esbuild flags).
REM ============================================================

cd /d "%~dp0\..\.."

set "TAG=%~1"
if "%TAG%"=="" set "TAG=latest"

echo === Building and pushing pangolinfo-mcp:%TAG% ===
echo (full build runs inside the Docker image, via WSL)
echo.

wsl ./scripts/window/docker-mcp.sh %TAG% || (
    echo.
    echo ERROR: docker build/push failed.
    pause
    exit /b 1
)

echo.
echo ============================================================
echo Done. Image pushed:
echo   registry-intl.ap-southeast-1.aliyuncs.com/pangolinfo-prod/pangolinfo-mcp:%TAG%
echo   registry-intl.ap-southeast-1.aliyuncs.com/pangolinfo-prod/pangolinfo-mcp:latest
echo.
echo Next step: trigger rolling update in ACK console
echo   crawler cluster -^> Workloads -^> Deployments -^> pangolinfo-mcp
echo   -^> Update -^> change image tag to %TAG% -^> Submit
echo   2 replicas roll one at a time, zero downtime.
echo ============================================================
pause
