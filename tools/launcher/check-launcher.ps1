# check-launcher.ps1 — 检查启动器窗口是否存在（端到端验证用）
$found = $false
Get-Process powershell -ErrorAction SilentlyContinue | ForEach-Object {
    if ($_.MainWindowTitle -eq "日程系统启动器") { $found = $true }
}
if ($found) {
    Write-Host "LAUNCHER_WINDOW_FOUND"
    exit 0
} else {
    Write-Host "LAUNCHER_WINDOW_NOT_FOUND"
    exit 1
}
