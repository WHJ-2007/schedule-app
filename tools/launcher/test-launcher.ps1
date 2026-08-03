# test-launcher.ps1 — GUI 加载测试（构建窗体但不进入消息循环）
$ErrorActionPreference = 'Stop'
$script:Pass = 0
$script:Fail = 0

function Assert-True([string]$name, [bool]$cond) {
    if ($cond) { $script:Pass++; Write-Host ("PASS  " + $name) -ForegroundColor Green }
    else { $script:Fail++; Write-Host ("FAIL  " + $name) -ForegroundColor Red }
}

function Test-Done {
    Write-Host ("--- " + $script:Pass + " passed, " + $script:Fail + " failed ---")
    if ($script:Fail -gt 0) { exit 1 }
    exit 0
}

$script:LauncherNoShow = $true
. "$PSScriptRoot\launcher.ps1"
$ErrorActionPreference = 'Stop'

$bytes = [System.IO.File]::ReadAllBytes((Join-Path $PSScriptRoot "launcher.ps1"))
Assert-True "launcher.ps1 为 UTF-8 BOM" ($bytes.Length -ge 3 -and $bytes[0] -eq 0xEF -and $bytes[1] -eq 0xBB -and $bytes[2] -eq 0xBF)

$f = Build-LauncherForm
Assert-True "窗口标题" ($f.Text -eq "日程系统启动器")
Assert-True "窗口宽度 420" ($f.ClientSize.Width -eq 420)
Assert-True "窗口高度 480" ($f.ClientSize.Height -eq 480)
Assert-True "状态初始文字" ($script:StatusLabel.Text -eq "○ 已停止")
Assert-True "开启按钮初始可用" ($script:BtnStart.Enabled -eq $true)
Assert-True "打开按钮初始禁用" ($script:BtnOpen.Enabled -eq $false)
Assert-True "关闭按钮初始禁用" ($script:BtnStop.Enabled -eq $false)
Assert-True "复制按钮存在" ($script:BtnCopy.Text -eq "📋 复制日志")
Assert-True "日志框只读" ($script:LogBox.ReadOnly -eq $true)
$f.Dispose()
Test-Done
