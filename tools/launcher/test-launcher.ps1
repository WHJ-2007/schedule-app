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
Assert-True "打开日志文件按钮存在" ($script:BtnOpenLog.Text -eq "📂 打开日志文件")
Assert-True "打开日志文件按钮在复制按钮左侧" ($script:BtnOpenLog.Location.X -lt $script:BtnCopy.Location.X)
Assert-True "日志框只读" ($script:LogBox.ReadOnly -eq $true)

$script:CapturedSessionLine = $null
function Append-SessionLog([string]$text) { $script:CapturedSessionLine = $text }
Append-Log "测试消息"
Assert-True "Append-Log 生成带时间戳行" ($script:CapturedSessionLine -match "^\[\d\d:\d\d:\d\d\] 测试消息$")
Assert-True "Append-Log 追加到日志框" ($script:LogBox.Text -match "测试消息")
Assert-True "日志框行数不超过上限" ($script:LogBox.Lines.Count -le 2000)

# —— Update-Status 状态迁移日志 ——
function Get-DevServerStatus { return $script:MockStatus }

$script:LastStatus = $null
$script:MockStatus = "running"
Update-Status
Assert-True "迁移日志：运行中状态被记录" ($script:LastStatus -eq "running")

$len = $script:LogBox.TextLength
$script:MockStatus = "stopped"
Update-Status
Assert-True "迁移日志：非主动停止时记录意外退出" (($script:LogBox.Text.Substring($len)) -match "服务已意外退出")

$script:StopRequested = $true
$script:MockStatus = "running"
Update-Status
$len = $script:LogBox.TextLength
$script:MockStatus = "stopped"
Update-Status
Assert-True "迁移日志：主动停止不记录意外退出" (-not (($script:LogBox.Text.Substring($len)) -match "服务已意外退出"))
Assert-True "迁移日志：主动停止后标志复位" ($script:StopRequested -eq $false)

$script:StopRequested = $true
$script:LastStatus = "starting"
$len = $script:LogBox.TextLength
$script:MockStatus = "stopped"
Update-Status
Assert-True "迁移日志：启动中主动停止不记录启动失败" (-not (($script:LogBox.Text.Substring($len)) -match "服务启动失败或已退出"))

# —— 网站可访问性探测日志（覆盖 core 的 Test-WebsiteOnline 为可控 mock）——
function Test-WebsiteOnline { return $script:MockReachable }

$script:LastStatus = $null
$script:LastReachable = $null
$script:ProbeCountdown = 0
$script:MockStatus = "running"
$script:MockReachable = $false
$len = $script:LogBox.TextLength
Update-Status
Assert-True "探测：不可访问记录日志" (($script:LogBox.Text.Substring($len)) -match "网站无响应")
Assert-True "探测：状态标签标记无响应" ($script:StatusLabel.Text -match "无响应")

# 节流：倒计时未归零不重复探测，同结果不重复记录
$script:ProbeCountdown = 3
$len = $script:LogBox.TextLength
Update-Status
Assert-True "探测：节流期间不重复记录" (-not (($script:LogBox.Text.Substring($len)) -match "网站无响应"))
$script:ProbeCountdown = 0
$script:MockReachable = $true
$len = $script:LogBox.TextLength
Update-Status
Assert-True "探测：恢复记录日志" (($script:LogBox.Text.Substring($len)) -match "网站响应恢复")
Assert-True "探测：恢复后标签正常" (-not ($script:StatusLabel.Text -match "无响应"))

# 离开运行中清空可访问性状态：再次运行会重新记录无响应
$script:MockStatus = "stopped"
$script:StopRequested = $true
Update-Status
Assert-True "探测：停止后可访问性状态清空" ($script:LastReachable -eq $null)
$script:MockStatus = "running"
$script:MockReachable = $false
$script:LastStatus = "stopped"
$len = $script:LogBox.TextLength
Update-Status
Assert-True "探测：重新运行后再次记录无响应" (($script:LogBox.Text.Substring($len)) -match "网站无响应")

$f.Dispose()
Test-Done
