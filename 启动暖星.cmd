@echo off
rem 暖星 · 桌面宠物启动脚本
rem 清掉 ELECTRON_RUN_AS_NODE，否则 Electron 会以纯 Node 模式启动而报错
set "ELECTRON_RUN_AS_NODE="
cd /d "%~dp0"

if not exist "node_modules\electron\dist\electron.exe" (
  echo [暖星] 还没安装依赖，正在安装...
  call npm install --registry=https://registry.npmmirror.com
)

start "" "%~dp0node_modules\electron\dist\electron.exe" "%~dp0"
exit /b 0
