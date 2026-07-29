# =============================================================================
#  scripts/build-installer.ps1
#  编排: shared -> web -> agent(bun --compile) -> staging -> makensis
#  产物: dist/DealPilot-Setup.exe
#
#  用法:
#    pwsh ./scripts/build-installer.ps1            # 完整构建
#    pwsh ./scripts/build-installer.ps1 -SkipBuild # 跳过 pnpm build，仅重新 staging+打包
# =============================================================================

[CmdletBinding()]
param(
  [string]$AppVersion = "0.1.0",
  [switch]$SkipBuild
)

# 注意：用 Continue 而非 Stop —— pnpm/vite/makensis 会往 stderr 输出进度，
# PS 5.1 会把原生命令的 stderr 包成 NativeCommandError 并在 Stop 下抛出终止脚本。
# 本脚本统一用 $LASTEXITCODE 判定成败。
$ErrorActionPreference = "Continue"
$root = (Resolve-Path "$PSScriptRoot/..").Path
$staging = Join-Path $root "dist/installer-staging"
$outDir = Join-Path $root "dist"

function Step($m) { Write-Host "==> $m" -ForegroundColor Cyan }
function Die($m)  { Write-Host "X $m" -ForegroundColor Red; exit 1 }

# ------------------------------------------------------------------ 工具链
Step "检查工具链"
$bun = Get-Command bun -ErrorAction SilentlyContinue
if (-not $bun) { Die "bun 未安装" }
$makensisExe = $null
$_mk = Get-Command makensis -ErrorAction SilentlyContinue
if ($_mk) { $makensisExe = $_mk.Source }
elseif (Test-Path "C:\Program Files (x86)\NSIS\makensis.exe") { $makensisExe = "C:\Program Files (x86)\NSIS\makensis.exe" }
if (-not $makensisExe) {
  Write-Warning "makensis 未安装，将仅完成 staging，不产出 Setup.exe。"
  Write-Warning "安装 NSIS: choco install nsis -y  或 winget install NSIS.NSIS"
}

# ------------------------------------------------------------------ 构建
if (-not $SkipBuild) {
  Step "构建 @dealpilot/shared"
  pnpm --filter @dealpilot/shared build
  if ($LASTEXITCODE -ne 0) { Die "shared 构建失败 (exit $LASTEXITCODE)" }

  Step "构建 @dealpilot/web"
  pnpm --filter @dealpilot/web build
  if ($LASTEXITCODE -ne 0) { Die "web 构建失败 (exit $LASTEXITCODE)" }

  Step "构建 @dealpilot/agent (bun build --compile)"
  pnpm --filter @dealpilot/agent build
  if ($LASTEXITCODE -ne 0) { Die "agent 构建失败 (exit $LASTEXITCODE)" }
}

# ------------------------------------------------------------------ staging
Step "组装 staging: $staging"
if (Test-Path $staging) { Remove-Item -Recurse -Force $staging }
$appDir = Join-Path $staging "app"
$webOut = Join-Path $appDir "web"
New-Item -ItemType Directory -Force -Path $appDir | Out-Null
New-Item -ItemType Directory -Force -Path $webOut | Out-Null

$agentExe = Join-Path $root "apps/agent/dist/dealpilot-agent.exe"
if (-not (Test-Path $agentExe)) { Die "未找到 agent exe: $agentExe (先跑构建)" }
Copy-Item $agentExe $appDir -Force
Copy-Item (Join-Path $root "scripts/installer/nm-host-template.json") $appDir -Force

$webDist = Join-Path $root "apps/web/dist"
if (-not (Test-Path $webDist)) { Die "未找到 web 构建产物: $webDist" }
Copy-Item (Join-Path $webDist "*") $webOut -Recurse -Force

# migrations 目录（编译 exe 运行时从 exe 同级 migrations/ 读取，建表必需）
$migSrc = Join-Path $root "apps/agent/migrations"
if (Test-Path $migSrc) {
  Copy-Item $migSrc $appDir -Recurse -Force
} else {
  Write-Warning "未找到 migrations 目录: $migSrc（编译 exe 将无法建表）"
}

# ------------------------------------------------------------------ makensis
if ($makensisExe) {
  Step "调用 makensis 生成 Setup.exe ($makensisExe)"
  if (-not (Test-Path $outDir)) { New-Item -ItemType Directory -Force -Path $outDir | Out-Null }
  & $makensisExe `
    "-DAPP_VERSION=$AppVersion" `
    "-DSTAGING_DIR=$staging" `
    "-DOUTPUT_DIR=$outDir" `
    (Join-Path $root "scripts/installer/installer.nsi")
  if ($LASTEXITCODE -ne 0) { Die "makensis 失败 (exit $LASTEXITCODE)" }

  $setup = Join-Path $outDir "DealPilot-Setup.exe"
  $sizeMB = [math]::Round((Get-Item $setup).Length / 1MB, 1)
  Step "完成: $setup  ($sizeMB MB)"
  if ($sizeMB -gt 50) {
    Write-Warning "包体 $sizeMB MB 超过 S1 目标 50MB（Bun 编译 exe 含运行时；可用 --minify/--bytecode 优化）"
  }
} else {
  Step "跳过 makensis（未安装）。staging 就绪: $staging"
}
