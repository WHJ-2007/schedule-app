# 生成应用图标源图（1024x1024 PNG）：蓝色日历 + 白色网格 + 黄色事件点
# 用法：powershell -NoProfile -ExecutionPolicy Bypass -File tools/icon-gen.ps1
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing

$size = 1024
$out = Join-Path $PSScriptRoot "..\src-tauri\app-icon.png"

$bmp = New-Object System.Drawing.Bitmap($size, $size)
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
$g.Clear([System.Drawing.Color]::Transparent)

$blue = [System.Drawing.Color]::FromArgb(37, 99, 235)
$lightBlue = [System.Drawing.Color]::FromArgb(59, 130, 246)
$white = [System.Drawing.Color]::White
$yellow = [System.Drawing.Color]::FromArgb(253, 224, 71)

$bg = [System.Drawing.SolidBrush]::new($blue)
$g.FillRectangle($bg, 32, 32, 960, 960)

$header = [System.Drawing.SolidBrush]::new($lightBlue)
$g.FillRectangle($header, 32, 32, 960, 240)

$pen = [System.Drawing.Pen]::new($white, 14)
for ($i = 1; $i -lt 4; $i++) {
    $y = [int](32 + 240 + $i * (720 / 4))
    $g.DrawLine($pen, 32, $y, 992, $y)
}
for ($i = 1; $i -lt 7; $i++) {
    $x = [int](32 + $i * (960 / 7))
    $g.DrawLine($pen, $x, 272, $x, 992)
}

$dot = [System.Drawing.SolidBrush]::new($yellow)
foreach ($c in @(@(200, 520), @(410, 660), @(620, 520), @(830, 800))) {
    $g.FillEllipse($dot, $c[0] - 34, $c[1] - 34, 68, 68)
}

$g.Dispose()
$bmp.Save($out, [System.Drawing.Imaging.ImageFormat]::Png)
$bmp.Dispose()
Write-Output ("icon saved: " + $out)
