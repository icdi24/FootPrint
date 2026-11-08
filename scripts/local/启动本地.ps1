# 脚印本地启动脚本
$ErrorActionPreference = 'Stop'

# 本脚本位于 <项目根>\scripts\local\，项目根需上溯两级
$root = Split-Path -Parent (Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path))
$pgBin = 'C:\Users\lhh\ego\pgsql17\pgsql\bin'
$pgData = 'C:\Users\lhh\ego\footprint-pgdata'
$runtime = Join-Path $root 'runtime'
$pgLog = Join-Path $runtime 'postgres.log'
$appOut = Join-Path $runtime 'app.out.log'
$appErr = Join-Path $runtime 'app.err.log'

New-Item -ItemType Directory -Force -Path $runtime | Out-Null

# 1) 启动 PostgreSQL（如果 5432 没有监听）
$pgListening = Get-NetTCPConnection -State Listen -LocalPort 5432 -ErrorAction SilentlyContinue
if (-not $pgListening) {
  Write-Host '启动 PostgreSQL...'
  & "$pgBin\pg_ctl.exe" -D $pgData -l $pgLog -o "-p 5432" -w start
} else {
  Write-Host 'PostgreSQL 已在运行。'
}

# 2) 启动 Node 应用（如果 3000 没有监听）
$appListening = Get-NetTCPConnection -State Listen -LocalPort 3000 -ErrorAction SilentlyContinue
if (-not $appListening) {
  Write-Host '启动脚印应用...'
  $env:DATABASE_URL = 'postgres://postgres:footprint_dev_pw@127.0.0.1:5432/footprint'
  $env:DATA_DIR = Join-Path $root 'runtime\data'
  $env:PORT = '3000'
  $env:LOCAL_NO_LOGIN = '1'
  $env:LOCAL_LOGIN_USER = '栗子'
  $appCmd = 'cd /d "' + (Join-Path $root 'app') + '" && start "" /b node src/index.js 1>"' + $appOut + '" 2>"' + $appErr + '"'
  cmd.exe /c $appCmd
  Start-Sleep -Seconds 2
} else {
  Write-Host '脚印应用已在运行。'
}

Write-Host '打开 http://127.0.0.1:3000'
cmd.exe /c 'start "" "http://127.0.0.1:3000"'
