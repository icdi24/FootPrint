# 脚印本地停止脚本
# 本脚本位于 <项目根>\scripts\local\，项目根需上溯两级
$root = Split-Path -Parent (Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path))
$pgBin = 'C:\Users\lhh\ego\pgsql17\pgsql\bin'
$pgData = 'C:\Users\lhh\ego\footprint-pgdata'

# 停止 3000 端口上的应用
$conn = Get-NetTCPConnection -State Listen -LocalPort 3000 -ErrorAction SilentlyContinue
if ($conn) {
  foreach ($c in $conn) {
    if ($c.OwningProcess -and $c.OwningProcess -ne 0) {
      Write-Host "停止应用进程 $($c.OwningProcess)..."
      Stop-Process -Id $c.OwningProcess -Force -ErrorAction SilentlyContinue
    }
  }
} else {
  Write-Host '应用没有在运行。'
}

# 停止 PostgreSQL
$pgListening = Get-NetTCPConnection -State Listen -LocalPort 5432 -ErrorAction SilentlyContinue
if ($pgListening) {
  Write-Host '停止 PostgreSQL...'
  & "$pgBin\pg_ctl.exe" -D $pgData -m fast stop
} else {
  Write-Host 'PostgreSQL 没有在运行。'
}
