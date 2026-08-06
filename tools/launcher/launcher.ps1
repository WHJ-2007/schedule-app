# launcher.ps1 — 启动器 GUI（点源加载不显示窗口；设置 $script:LauncherNoShow = $true 可跳过）
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing
. (Join-Path $PSScriptRoot "launcher-core.ps1")
Set-StrictMode -Off
$ErrorActionPreference = 'Continue'

$script:LastStatus = $null
$script:Exiting = $false
$script:StopRequested = $false
# 网站可访问性监控：LastReachable 记录上次探测结果（$null 未知/$true 可访问/$false 不可访问），
# ProbeCountdown 节流探测频率（每次 tick 递减，归零才真正发 HTTP 请求）
$script:LastReachable = $null
$script:ProbeCountdown = 0

function Append-Log([string]$text) {
    $line = (Get-Date -Format "[HH:mm:ss] ") + $text
    Append-SessionLog $line
    $box = $script:LogBox
    if ($box) {
        $box.AppendText($line + "`r`n")
        if ($box.Lines.Count -gt 2000) {
            $keep = $box.Lines[($box.Lines.Count - 2000)..($box.Lines.Count - 1)]
            $box.Lines = $keep
            $box.SelectionStart = $box.TextLength
            $box.ScrollToCaret()
        }
    }
}

function Update-Status {
    try {
        $s = Get-DevServerStatus
    } catch {
        return
    }
    if ($script:LastStatus -ne $s) {
        switch ($s) {
            "running"  { Append-Log ("服务已就绪：" + (Get-ServerUrl)) }
            "starting" { if ($script:LastStatus) { Append-Log "服务正在启动…" } }
            "stopped"  {
                if ($script:StopRequested) { $script:StopRequested = $false }
                elseif ($script:LastStatus -eq "starting") { Append-Log "服务启动失败或已退出" }
                elseif ($script:LastStatus -eq "running") { Append-Log "服务已意外退出" }
            }
        }
        $script:LastStatus = $s
        # 迁移到运行中立刻探测一次；离开运行中清空可访问性状态
        if ($s -eq "running") { $script:ProbeCountdown = 0 }
        else { $script:LastReachable = $null }
    }
    # 运行中：节流探测网站可访问性（每 5 秒一次），挂了/恢复都在日志体现，不重复刷屏
    if ($s -eq "running" -and $script:ProbeCountdown -le 0) {
        $script:ProbeCountdown = 5
        try {
            $reachable = Test-WebsiteOnline
        } catch {
            $reachable = $false
        }
        if (-not $reachable -and $script:LastReachable -ne $false) {
            Append-Log "⚠ 网站无响应（服务可能异常或已崩溃），请查看开发日志"
        } elseif ($reachable -and $script:LastReachable -eq $false) {
            Append-Log "网站响应恢复，服务正常"
        }
        $script:LastReachable = $reachable
    } elseif ($s -eq "running") {
        $script:ProbeCountdown--
    }
    switch ($s) {
        "running" {
            if ($script:LastReachable -eq $false) {
                $script:StatusLabel.Text = "⚠ 运行中（无响应）"
                $script:StatusLabel.ForeColor = [System.Drawing.Color]::FromArgb(220, 38, 38)
            } else {
                $script:StatusLabel.Text = "● 运行中"
                $script:StatusLabel.ForeColor = [System.Drawing.Color]::FromArgb(22, 163, 74)
            }
        }
        "starting" {
            $script:StatusLabel.Text = "◐ 启动中"
            $script:StatusLabel.ForeColor = [System.Drawing.Color]::FromArgb(234, 146, 0)
        }
        default {
            $script:StatusLabel.Text = "○ 已停止"
            $script:StatusLabel.ForeColor = [System.Drawing.Color]::FromArgb(115, 115, 115)
        }
    }
    $script:BtnStart.Enabled = ($s -eq "stopped")
    $script:BtnOpen.Enabled = ($s -eq "running")
    $script:BtnStop.Enabled = ($s -ne "stopped")
}

function Start-ServiceClick {
    $script:StopRequested = $false
    Append-Log "正在启动服务…"
    try {
        $ok = Start-DevServer
    } catch {
        Append-Log ("启动失败：" + $_.Exception.Message)
        [void][System.Windows.Forms.MessageBox]::Show($_.Exception.Message, "启动失败", [System.Windows.Forms.MessageBoxButtons]::OK, [System.Windows.Forms.MessageBoxIcon]::Error)
        return
    }
    if (-not $ok) {
        Append-Log "启动失败：端口 $script:Port 已被占用，请检查是否有其他服务在运行"
        [void][System.Windows.Forms.MessageBox]::Show("端口 $script:Port 已被占用。`n可能是其他服务或残留进程，请先关闭后重试。", "启动失败", [System.Windows.Forms.MessageBoxButtons]::OK, [System.Windows.Forms.MessageBoxIcon]::Warning)
        return
    }
    Append-Log "已发起启动，等待端口就绪…"
    Update-Status
}

function Stop-ServiceClick {
    Append-Log "正在关闭服务…"
    $script:StopRequested = $true
    Stop-DevServer | Out-Null
    Append-Log "服务已关闭"
    Update-Status
}

function Open-Website {
    if (-not (Wait-PortReady -timeoutSeconds 15)) {
        Append-Log "等待端口就绪超时（15 秒），请检查服务状态"
        [void][System.Windows.Forms.MessageBox]::Show("等待服务就绪超时，请稍后重试。", "打开网站", [System.Windows.Forms.MessageBoxButtons]::OK, [System.Windows.Forms.MessageBoxIcon]::Warning)
        return
    }
    Start-Process (Get-ServerUrl)
    Append-Log ("已打开网站 " + (Get-ServerUrl))
}

function Copy-SessionLogClick {
    $text = Get-SessionLogText
    if (-not $text) { $text = "(本次会话暂无日志)" }
    try {
        Set-Clipboard -Value $text -ErrorAction Stop
        $script:BtnCopy.Text = "已复制 ✓"
        $restore = New-Object System.Windows.Forms.Timer
        $restore.Interval = 1500
        $restore.Add_Tick({
            $script:BtnCopy.Text = "📋 复制日志"
            $restore.Stop()
            $restore.Dispose()
        })
        $restore.Start()
    } catch {
        Append-Log ("复制失败：" + $_.Exception.Message)
    }
}

function Open-LogFileClick {
    $path = $script:SessionLogPath
    if ($path -and (Test-Path $path)) {
        Start-Process explorer.exe -ArgumentList ('/select,"' + $path + '"')
        Append-Log "已在资源管理器中显示日志文件"
    } else {
        $dir = Get-LogsDir
        Ensure-RuntimeDir | Out-Null
        Start-Process explorer.exe -ArgumentList ('"' + $dir + '"')
        Append-Log "会话日志尚未生成，已打开日志目录"
    }
}

function Build-LauncherForm {
    $form = New-Object System.Windows.Forms.Form
    $form.Text = "日程系统启动器"
    $form.ClientSize = New-Object System.Drawing.Size(420, 480)
    $form.FormBorderStyle = [System.Windows.Forms.FormBorderStyle]::FixedSingle
    $form.MaximizeBox = $false
    $form.StartPosition = [System.Windows.Forms.FormStartPosition]::CenterScreen
    $form.Font = New-Object System.Drawing.Font("Microsoft YaHei UI", 9)

    $status = New-Object System.Windows.Forms.Label
    $status.Location = New-Object System.Drawing.Point(16, 18)
    $status.AutoSize = $true
    $status.Font = New-Object System.Drawing.Font("Microsoft YaHei UI", 11, [System.Drawing.FontStyle]::Bold)
    $script:StatusLabel = $status

    $addr = New-Object System.Windows.Forms.LinkLabel
    $addr.Location = New-Object System.Drawing.Point(16, 48)
    $addr.AutoSize = $true
    $addr.Text = Get-ServerUrl
    $addr.LinkColor = [System.Drawing.Color]::FromArgb(37, 99, 235)
    $addr.Add_Click({ Open-Website })
    $script:AddrLabel = $addr

    $btnStart = New-Object System.Windows.Forms.Button
    $btnStart.Text = "▶ 开启服务"
    $btnStart.Location = New-Object System.Drawing.Point(16, 80)
    $btnStart.Size = New-Object System.Drawing.Size(120, 36)
    $btnStart.Add_Click({ Start-ServiceClick })
    $script:BtnStart = $btnStart

    $btnOpen = New-Object System.Windows.Forms.Button
    $btnOpen.Text = "🌐 打开网站"
    $btnOpen.Location = New-Object System.Drawing.Point(146, 80)
    $btnOpen.Size = New-Object System.Drawing.Size(120, 36)
    $btnOpen.Add_Click({ Open-Website })
    $script:BtnOpen = $btnOpen

    $btnStop = New-Object System.Windows.Forms.Button
    $btnStop.Text = "⏹ 关闭服务"
    $btnStop.Location = New-Object System.Drawing.Point(276, 80)
    $btnStop.Size = New-Object System.Drawing.Size(120, 36)
    $btnStop.Add_Click({ Stop-ServiceClick })
    $script:BtnStop = $btnStop

    $openLog = New-Object System.Windows.Forms.Button
    $openLog.Text = "📂 打开日志文件"
    $openLog.Location = New-Object System.Drawing.Point(16, 122)
    $openLog.Size = New-Object System.Drawing.Size(140, 26)
    $openLog.Add_Click({ Open-LogFileClick })
    $script:BtnOpenLog = $openLog

    $copy = New-Object System.Windows.Forms.Button
    $copy.Text = "📋 复制日志"
    $copy.Location = New-Object System.Drawing.Point(164, 122)
    $copy.Size = New-Object System.Drawing.Size(96, 26)
    $copy.Add_Click({ Copy-SessionLogClick })
    $script:BtnCopy = $copy

    $box = New-Object System.Windows.Forms.TextBox
    $box.Multiline = $true
    $box.ReadOnly = $true
    $box.ScrollBars = [System.Windows.Forms.ScrollBars]::Vertical
    $box.Font = New-Object System.Drawing.Font("Consolas", 9)
    $box.Location = New-Object System.Drawing.Point(12, 156)
    $box.Size = New-Object System.Drawing.Size(396, 300)
    $script:LogBox = $box

    $form.Controls.Add($status)
    $form.Controls.Add($addr)
    $form.Controls.Add($btnStart)
    $form.Controls.Add($btnOpen)
    $form.Controls.Add($btnStop)
    $form.Controls.Add($openLog)
    $form.Controls.Add($copy)
    $form.Controls.Add($box)

    $timer = New-Object System.Windows.Forms.Timer
    $timer.Interval = 1000
    $timer.Add_Tick({ Update-Status })
    $timer.Start()
    $script:StatusTimer = $timer

    $notify = New-Object System.Windows.Forms.NotifyIcon
    $notify.Icon = [System.Drawing.SystemIcons]::Application
    $notify.Text = "日程系统启动器"
    $menu = New-Object System.Windows.Forms.ContextMenuStrip
    $miShow = $menu.Items.Add("显示窗口")
    $miShow.Add_Click({ Show-MainWindow })
    $miExit = $menu.Items.Add("退出")
    $miExit.Add_Click({ Exit-Launcher })
    $notify.ContextMenuStrip = $menu
    $notify.Add_MouseDoubleClick({
        param($sender, $e)
        if ($e.Button -eq [System.Windows.Forms.MouseButtons]::Left) { Show-MainWindow }
    })
    $notify.Visible = $true
    $script:NotifyIcon = $notify

    $form.Add_FormClosing({
        param($sender, $e)
        if (-not $script:Exiting) {
            $e.Cancel = $true
            $sender.Hide()
        }
    })

    Update-Status
    return $form
}

function Show-MainWindow {
    $form = $script:MainForm
    if ($form) {
        $form.Show()
        $form.WindowState = [System.Windows.Forms.FormWindowState]::Normal
        $form.Activate()
    }
}

function Exit-Launcher {
    if ((Get-DevServerStatus) -ne "stopped") {
        $r = [System.Windows.Forms.MessageBox]::Show(
            "服务仍在运行。`n是否先关闭服务再退出？",
            "确认退出",
            [System.Windows.Forms.MessageBoxButtons]::YesNoCancel,
            [System.Windows.Forms.MessageBoxIcon]::Question)
        if ($r -eq [System.Windows.Forms.DialogResult]::Cancel) { return }
        if ($r -eq [System.Windows.Forms.DialogResult]::Yes) {
            Append-Log "退出前正在关闭服务…"
            $script:StopRequested = $true
            Stop-DevServer | Out-Null
            Append-Log "服务已关闭，启动器退出"
        }
    }
    $script:Exiting = $true
    if ($script:StatusTimer) { $script:StatusTimer.Stop(); $script:StatusTimer.Dispose() }
    if ($script:NotifyIcon) { $script:NotifyIcon.Visible = $false; $script:NotifyIcon.Dispose() }
    $form = $script:MainForm
    if ($form) { $form.Dispose() }
    [Environment]::Exit(0)
}

function Show-LauncherWindow {
    $form = Build-LauncherForm
    $script:MainForm = $form
    [System.Windows.Forms.Application]::Run($form)
}

if (-not $script:LauncherNoShow) {
    Show-LauncherWindow
}
