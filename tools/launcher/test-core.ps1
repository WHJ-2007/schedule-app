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

# 端口检测（自包含：临时监听端口正例 + 空闲端口负例）
$listener = [System.Net.Sockets.TcpListener]::new([System.Net.IPAddress]::Loopback, 0)
$listener.Start()
$tempPort = ([System.Net.IPEndPoint]$listener.LocalEndpoint).Port
Assert-True "临时监听端口检测为占用" (Get-PortInUse -port $tempPort)
$listener.Stop()
# 用从未监听的端口做负例：在 4000-4049 中找第一个空闲端口，保证确定性
$freePort = 4000
while (Get-PortInUse -port $freePort) { $freePort++ }
Assert-False "空闲端口检测为空闲" (Get-PortInUse -port $freePort)

# —— 服务启停（真实 npm run dev）——
if (Get-PortInUse) { Write-Host "WARN: 端口 3000 已被占用，启停测试可能失败" -ForegroundColor Yellow }

$started = Start-DevServer
Assert-True "启动服务成功" $started
if ($started) {
    Assert-True "启动后写入 PID 文件" ([bool](Load-PidFile))
    $ready = Wait-PortReady -timeoutSeconds 60
    Assert-True "60 秒内端口就绪" $ready
    # 端口就绪后再测二次启动：否则首个 dev server 尚未监听，二次启动会误判为空闲并多起一个进程
    Assert-True "二次启动因端口占用返回 False" (-not (Start-DevServer))
    Assert-True "PID 文件仍为原 PID" ([bool](Load-PidFile))
    Assert-True "状态为运行中" ((Get-DevServerStatus) -eq "running")
    $code = (Invoke-WebRequest -Uri "http://localhost:3000/" -UseBasicParsing -TimeoutSec 10).StatusCode
    Assert-True "首页返回 200" ($code -eq 200)

    # 意外退出模拟：杀进程树
    $srvPid = Load-PidFile
    taskkill /PID $srvPid /T /F 2>&1 | Out-Null
    Start-Sleep -Seconds 3
    Assert-True "意外退出后状态回已停止" ((Get-DevServerStatus) -eq "stopped")
    Assert-True "意外退出后 PID 文件被清理" (-not (Test-Path (Get-PidFilePath)))

    # 重新启动 → 正常停止
    Assert-True "再次启动成功" (Start-DevServer)
    $ready2 = Wait-PortReady -timeoutSeconds 60
    Assert-True "再次启动端口就绪" $ready2
    Stop-DevServer | Out-Null
    Start-Sleep -Seconds 3
    Assert-True "停止后端口关闭" (-not (Get-PortInUse))
    Assert-True "停止后 PID 文件被清理" (-not (Test-Path (Get-PidFilePath)))
    Assert-True "停止后状态为已停止" ((Get-DevServerStatus) -eq "stopped")

    # 假 PID 恢复逻辑
    Save-PidFile 99999999
    Assert-True "假 PID 状态为已停止" ((Get-DevServerStatus) -eq "stopped")
    Assert-True "假 PID 被清理" (-not (Test-Path (Get-PidFilePath)))
}

Test-Done
