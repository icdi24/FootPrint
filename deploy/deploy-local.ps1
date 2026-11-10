# 脚印 · 本机一键部署到服务器
#
# 用法（在本仓库根目录执行）：
#   .\deploy\deploy-local.ps1 -Server <服务器IP> -DryRun   # 只预览，不连服务器
#   .\deploy\deploy-local.ps1 -Server <服务器IP>            # 真部署
#   $env:FP_SERVER='<服务器IP>'; .\deploy\deploy-local.ps1  # 设一次环境变量，之后免写
#   .\deploy\deploy-local.ps1 -SkipDirtyCheck              # 允许带着未提交改动部署（会用已提交内容）
#
# 服务器 IP 不写进本文件（仓库是公开的），见《部署交接清单-给协作者.md》。
# 流程：检查 → git archive 打包 → scp 上传 → 远程执行 remote-deploy.sh --tarball

[CmdletBinding()]
param(
  # 服务器地址不写死（仓库是公开的）：优先 -Server，其次环境变量 FP_SERVER
  [string]$Server = $env:FP_SERVER,
  [string]$User = $(if ($env:FP_USER) { $env:FP_USER } else { 'ubuntu' }),
  [int]$Port = 22,
  [string]$KeyPath = "$env:USERPROFILE\.ssh\id_ed25519",
  [string]$AppDir = '/opt/footprint',
  [switch]$DryRun,
  [switch]$SkipDirtyCheck
)

$ErrorActionPreference = 'Stop'
$repoRoot = Split-Path -Parent $PSScriptRoot
Set-Location $repoRoot

if (-not $Server) {
  Write-Host @"
  没指定服务器地址。二选一：
    .\deploy\deploy-local.ps1 -Server <服务器IP>
    `$env:FP_SERVER='<服务器IP>'   # 设一次，之后直接跑 .\deploy\deploy-local.ps1
  真实地址在《部署交接清单-给协作者.md》（私密文件，不进 git）。
"@ -ForegroundColor Yellow
  exit 1
}

function Step($msg) { Write-Host "`n==> $msg" -ForegroundColor Cyan }
function Warn($msg) { Write-Host "  ! $msg" -ForegroundColor Yellow }
function Die($msg) { Write-Host "  X $msg" -ForegroundColor Red; exit 1 }

Step "检查环境"
if (-not (Get-Command git -ErrorAction SilentlyContinue)) { Die 'git 不可用' }
if (-not (Get-Command ssh -ErrorAction SilentlyContinue)) { Die 'ssh 不可用（Windows 可选功能 OpenSSH 客户端）' }
if (-not (Get-Command scp -ErrorAction SilentlyContinue)) { Die 'scp 不可用' }

$head = (git rev-parse --short HEAD).Trim()
$branch = (git rev-parse --abbrev-ref HEAD).Trim()
Write-Host "  仓库: $repoRoot"
Write-Host "  分支: $branch   提交: $head"

# 未提交改动
$dirty = git status --porcelain --untracked-files=no
if ($dirty -and -not $SkipDirtyCheck) {
  Warn '有未提交的已跟踪改动，git archive 不会包含它们：'
  $dirty | ForEach-Object { Write-Host "      $_" }
  Die '先 commit 再部署（或加 -SkipDirtyCheck 明确接受"用旧内容部署"）'
}

# 领先远端多少个提交
$ahead = (git rev-list --count "origin/$branch..HEAD" 2>$null)
if ($ahead -and [int]$ahead -gt 0) {
  Warn "本地比 origin/$branch 领先 $ahead 个提交——服务器若从 GitHub 拉代码就取不到这些提交（本脚本用打包上传，不受影响）"
}

if (-not (Test-Path $KeyPath)) {
  Warn "找不到私钥 $KeyPath"
  Warn '会退回 ssh-agent / 默认密钥；如果认证失败，用 -KeyPath 指定'
}

Step "打包（git archive 只打已提交内容）"
$stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$tarball = Join-Path $env:TEMP "footprint-deploy-$stamp.tar.gz"
git archive --format=tar.gz --prefix='' -o $tarball HEAD
if (-not (Test-Path $tarball)) { Die '打包失败' }
$sizeMB = [math]::Round((Get-Item $tarball).Length / 1MB, 2)
Write-Host "  包: $tarball ($sizeMB MB)"

Step "预检：服务器 Web 是否活着"
$healthUrl = "http://$Server`:3201/healthz"
try {
  $h = Invoke-RestMethod -Uri $healthUrl -TimeoutSec 8 -ErrorAction Stop
  Write-Host "  $healthUrl -> $($h | ConvertTo-Json -Compress)"
} catch {
  Warn "$healthUrl 不通（$($_.Exception.Message)）——部署会继续进行，最后健康检查会再验一次"
}

Step "预检：SSH 端口"
$tcp = Test-NetConnection -ComputerName $Server -Port $Port -InformationLevel Quiet -WarningAction SilentlyContinue
if (-not $tcp) {
  Warn "$Server`:$Port 不可达"
  Write-Host @"
  SSH 不通就没法推送部署。三条可选通道：
    A. 腾讯云控制台网页终端（不需要 22 对外开放，最快）
    B. 安全组入站规则放行 TCP:$Port，来源填你的出口 IP
    C. 用 Tailscale 内网地址：.\deploy\deploy-local.ps1 -Server <Tailscale-IP>
  详见 deploy\部署操作手册.md 第 1 节。
"@
  if (-not $DryRun) { Die 'SSH 不可达，终止（加 -DryRun 可只看打包结果）' }
}

if ($DryRun) {
  Write-Host "`n[DryRun] 到此为止。包在: $tarball" -ForegroundColor Green
  Write-Host "[DryRun] 去掉 -DryRun 就会：scp 上传 → 远程备份数据库 → 覆盖代码 → 重建容器 → 健康检查"
  exit 0
}

Step "上传到服务器"
$remoteTarball = "/tmp/footprint-deploy-$stamp.tar.gz"
$remoteScript = "/tmp/footprint-remote-deploy.sh"
$scpBase = @('-P', $Port)
if (Test-Path $KeyPath) { $scpBase += @('-i', $KeyPath) }
$scpBase += @('-o', 'StrictHostKeyChecking=accept-new')

& scp @scpBase $tarball "${User}@${Server}:$remoteTarball"
if ($LASTEXITCODE -ne 0) { Die 'scp 上传代码包失败' }

# 部署脚本单独上传：git archive 只含已跟踪文件，deploy/ 可能还没提交
$localScript = Join-Path $PSScriptRoot 'remote-deploy.sh'
if (-not (Test-Path $localScript)) { Die "找不到 $localScript" }
& scp @scpBase $localScript "${User}@${Server}:$remoteScript"
if ($LASTEXITCODE -ne 0) { Die 'scp 上传部署脚本失败' }
Write-Host "  已上传: $remoteTarball 和 $remoteScript"

Step "远程执行部署脚本"
$sshArgs = @('-p', $Port)
if (Test-Path $KeyPath) { $sshArgs += @('-i', $KeyPath) }
$sshArgs += @('-o', 'StrictHostKeyChecking=accept-new', "${User}@${Server}")

$remoteCmd = "sudo bash $remoteScript --tarball $remoteTarball"

& ssh @sshArgs $remoteCmd
$code = $LASTEXITCODE

Step "清理本地临时包"
Remove-Item $tarball -Force -ErrorAction SilentlyContinue

if ($code -ne 0) { Die "远程部署失败（exit $code），看上面的日志" }

Write-Host "`n部署成功：$branch@$head" -ForegroundColor Green
Write-Host "  打开 http://$Server`:3201  验证桌面端与手机端"
Write-Host "  回滚说明见 deploy\部署操作手册.md 第 6 节"
