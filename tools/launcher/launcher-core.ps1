# launcher-core.ps1 — 启动器核心逻辑（纯函数，点源加载无副作用）
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$script:CoreDir = $PSScriptRoot
$script:Port = 3000

function Get-LauncherDir { return $script:CoreDir }

function Get-ProjectRoot {
    return (Split-Path (Split-Path $script:CoreDir -Parent) -Parent)
}

function Get-RuntimeDir { return (Join-Path $script:CoreDir ".runtime") }

function Get-LogsDir { return (Join-Path (Get-RuntimeDir) "logs") }

function Ensure-RuntimeDir {
    $dir = Get-RuntimeDir
    if (-not (Test-Path $dir)) { New-Item -ItemType Directory -Path $dir | Out-Null }
    $logs = Join-Path $dir "logs"
    if (-not (Test-Path $logs)) { New-Item -ItemType Directory -Path $logs | Out-Null }
    return $dir
}

function Get-PidFilePath { return (Join-Path (Get-RuntimeDir) "server.pid") }

function Get-DevOutPath { return (Join-Path (Get-RuntimeDir) "dev.out.log") }

function Get-DevErrPath { return (Join-Path (Get-RuntimeDir) "dev.err.log") }

function Save-PidFile([int]$pidValue) {
    Ensure-RuntimeDir | Out-Null
    $pidValue | Out-File -FilePath (Get-PidFilePath) -Encoding ascii
}

function Load-PidFile {
    $f = Get-PidFilePath
    if (-not (Test-Path $f)) { return $null }
    $raw = Get-Content $f -Raw
    if (-not $raw) { Remove-PidFile; return $null }
    $v = $raw.Trim()
    if ($v -match '^\d{1,8}$') { return [int]$v }
    Remove-PidFile
    return $null
}

function Remove-PidFile {
    $f = Get-PidFilePath
    if (Test-Path $f) { Remove-Item $f -Force }
}

function Is-ProcessAlive([int]$processId) {
    if ($processId -le 0) { return $false }
    return [bool](Get-Process -Id $processId -ErrorAction SilentlyContinue)
}

function Get-PortInUse([int]$port = $script:Port) {
    $conn = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue
    return [bool]$conn
}

function Get-ServerUrl { return ("http://localhost:" + $script:Port) }

function Start-DevServer {
    # 返回 $true 成功启动；$false 端口被占用
    if (Get-PortInUse) { return $false }
    $npm = Get-Command npm.cmd -ErrorAction SilentlyContinue
    if (-not $npm) { throw "找不到 npm.cmd，请确认已安装 Node.js" }
    Ensure-RuntimeDir | Out-Null
    $out = Get-DevOutPath
    $err = Get-DevErrPath
    $p = Start-Process -FilePath $npm.Source -ArgumentList @("run", "dev") `
        -WorkingDirectory (Get-ProjectRoot) `
        -RedirectStandardOutput $out -RedirectStandardError $err `
        -WindowStyle Hidden -PassThru
    Save-PidFile $p.Id
    return $true
}

function Stop-DevServer {
    $id = Load-PidFile
    if ($id) {
        taskkill /PID $id /T /F 2>&1 | Out-Null
    }
    Remove-PidFile
    return $true
}

function Get-DevServerStatus {
    # 返回 "stopped" | "starting" | "running"
    $id = Load-PidFile
    if (-not $id -or -not (Is-ProcessAlive $id)) {
        if ($id) { Remove-PidFile }
        return "stopped"
    }
    if (Get-PortInUse) { return "running" }
    return "starting"
}

function Wait-PortReady([int]$timeoutSeconds = 15) {
    for ($i = 0; $i -lt $timeoutSeconds; $i++) {
        if (Get-PortInUse) { return $true }
        Start-Sleep -Seconds 1
    }
    return (Get-PortInUse)
}
