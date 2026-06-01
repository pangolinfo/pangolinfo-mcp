@echo off
setlocal

REM ============================================================
REM Pangolinfo MCP - 端到端发版 (Windows 入口 -> WSL -> release-mcp.sh)
REM
REM 用法:
REM   release-mcp.cmd 0.6.0
REM
REM 串起来跑: 版本校验 -> build -> 自检 -> 推镜像 -> (你手动 ACK) ->
REM           验证 /health -> 官方 registry 发布。
REM
REM 前置: 三处版本号 (package.json / src/version.ts / server.json) 先改齐到目标版本;
REM       DNS 私钥放在 scripts/window/.mcp-dns-key (已 gitignore)。
REM ============================================================

cd /d "%~dp0\..\.."

set "TAG=%~1"
if "%TAG%"=="" (
    echo ERROR: 需要版本号. 用法: release-mcp.cmd 0.6.0
    exit /b 1
)

wsl ./scripts/window/release-mcp.sh %TAG% || (
    echo.
    echo ERROR: 发版流程中断.
    pause
    exit /b 1
)

pause
