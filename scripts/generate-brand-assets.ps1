$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
$productAssets = Join-Path $root "product\assets"
$extensionMedia = Join-Path $root "extensions\nexus-ai\media"

Add-Type -AssemblyName System.Drawing
Add-Type @"
using System;
using System.Runtime.InteropServices;
public static class NexusIconHandle {
    [DllImport("user32.dll", CharSet = CharSet.Auto)]
    public static extern bool DestroyIcon(IntPtr handle);
}
"@

New-Item -ItemType Directory -Force -Path $productAssets, $extensionMedia | Out-Null

function New-NexusBitmap([int]$Size) {
    $bitmap = [System.Drawing.Bitmap]::new($Size, $Size, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
    $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
    try {
        $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
        $graphics.Clear([System.Drawing.Color]::FromArgb(255, 15, 22, 29))

        $border = [System.Drawing.Pen]::new([System.Drawing.Color]::FromArgb(255, 48, 74, 88), [Math]::Max(2, $Size * 0.025))
        $border.Alignment = [System.Drawing.Drawing2D.PenAlignment]::Inset
        $graphics.DrawRectangle($border, 1, 1, $Size - 2, $Size - 2)
        $border.Dispose()

        $stroke = [System.Drawing.Pen]::new([System.Drawing.Color]::FromArgb(255, 54, 183, 215), $Size * 0.13)
        $stroke.StartCap = [System.Drawing.Drawing2D.LineCap]::Round
        $stroke.EndCap = [System.Drawing.Drawing2D.LineCap]::Round
        $stroke.LineJoin = [System.Drawing.Drawing2D.LineJoin]::Round
        $graphics.DrawLines($stroke, @(
            [System.Drawing.PointF]::new($Size * 0.25, $Size * 0.74),
            [System.Drawing.PointF]::new($Size * 0.25, $Size * 0.26),
            [System.Drawing.PointF]::new($Size * 0.75, $Size * 0.74),
            [System.Drawing.PointF]::new($Size * 0.75, $Size * 0.26)
        ))
        $stroke.Dispose()

        $highlight = [System.Drawing.Pen]::new([System.Drawing.Color]::FromArgb(235, 236, 244, 247), $Size * 0.035)
        $highlight.StartCap = [System.Drawing.Drawing2D.LineCap]::Round
        $highlight.EndCap = [System.Drawing.Drawing2D.LineCap]::Round
        $graphics.DrawLine($highlight, $Size * 0.34, $Size * 0.35, $Size * 0.66, $Size * 0.65)
        $highlight.Dispose()
    } finally {
        $graphics.Dispose()
    }
    return $bitmap
}

$sizes = @{
    "nexuside-512.png" = 512
    "code_70x70.png" = 70
    "code_150x150.png" = 150
}

foreach ($asset in $sizes.GetEnumerator()) {
    $bitmap = New-NexusBitmap $asset.Value
    try {
        $bitmap.Save((Join-Path $productAssets $asset.Key), [System.Drawing.Imaging.ImageFormat]::Png)
    } finally {
        $bitmap.Dispose()
    }
}

$iconBitmap = New-NexusBitmap 256
$iconHandle = $iconBitmap.GetHicon()
try {
    $icon = [System.Drawing.Icon]::FromHandle($iconHandle)
    $stream = [System.IO.File]::Create((Join-Path $productAssets "code.ico"))
    try {
        $icon.Save($stream)
    } finally {
        $stream.Dispose()
        $icon.Dispose()
    }
    $iconBitmap.Save((Join-Path $extensionMedia "nexuside.png"), [System.Drawing.Imaging.ImageFormat]::Png)
} finally {
    [NexusIconHandle]::DestroyIcon($iconHandle) | Out-Null
    $iconBitmap.Dispose()
}

Write-Host "NexusIDE brand assets generated."