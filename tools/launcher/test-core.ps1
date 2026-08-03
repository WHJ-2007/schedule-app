# test-core.ps1 — launcher-core 冒烟测试
$ErrorActionPreference = 'Stop'
$script:Pass = 0
$script:Fail = 0

function Assert-True([string]$name, [bool]$cond) {
    if ($cond) { $script:Pass++; Write-Host ("PASS  " + $name) -ForegroundColor Green }
    else { $script:Fail++; Write-Host ("FAIL  " + $name) -ForegroundColor Red }
}

function Assert-False([string]$name, [bool]$cond) { Assert-True $name (-not $cond) }

function Test-Done {
    Write-Host ("--- " + $script:Pass + " passed, " + $script:Fail + " failed ---")
    if ($script:Fail -gt 0) { exit 1 }
    exit 0
}

. "$PSScriptRoot\launcher-core.ps1"

# BOM 编码
$bytes = [System.IO.File]::ReadAllBytes((Join-Path $PSScriptRoot "launcher-core.ps1"))
Assert-True "launcher-core.ps1 为 UTF-8 BOM" ($bytes.Length -ge 3 -and $bytes[0] -eq 0xEF -and $bytes[1] -eq 0xBB -and $bytes[2] -eq 0xBF)

# 路径推导
$expectRoot = Split-Path (Split-Path $PSScriptRoot -Parent) -Parent
Assert-True "项目根目录推导" ((Get-ProjectRoot) -eq $expectRoot)
Assert-True "服务器地址" ((Get-ServerUrl) -eq "http://localhost:3000")

# 运行时目录
$rt = Get-RuntimeDir
if (Test-Path $rt) { Remove-Item $rt -Recurse -Force }
Ensure-RuntimeDir | Out-Null
Assert-True "运行时目录创建" (Test-Path $rt)
Assert-True "logs 目录创建" (Test-Path (Join-Path $rt "logs"))

# PID 文件往返
Save-PidFile 12345
Assert-True "PID 保存后可读回" ((Load-PidFile) -eq 12345)
Remove-PidFile
Assert-True "删除后 PID 为空" ((Load-PidFile) -eq $null)
Save-PidFile 999
[System.IO.File]::WriteAllText((Get-PidFilePath), "abc", [System.Text.Encoding]::ASCII)
Assert-True "非法 PID 内容被清理" ((Load-PidFile) -eq $null)

# 进程检测
Assert-True "当前进程存活检测" (Is-ProcessAlive $PID)
Assert-False "不存在进程检测" (Is-ProcessAlive 99999999)
Assert-False "PID 0 检测" (Is-ProcessAlive 0)

# 端口检测（测试前提：3000 空闲）
Assert-False "端口 3000 空闲" (Get-PortInUse)

Test-Done
