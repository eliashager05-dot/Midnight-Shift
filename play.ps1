# ---------------------------------------------------------------------------
# MIDNIGHT SHIFT - zero-install launcher for Windows.
# Use this if Node.js / npm is not available. It serves the game folder on
# http://localhost:8080 with a tiny built-in web server and opens the browser.
#
#   Right-click > "Run with PowerShell"      or      powershell -ExecutionPolicy Bypass -File play.ps1
#
# (The game uses plain ES modules with no dependencies, so no build step is needed.)
# ---------------------------------------------------------------------------
param([int]$Port = 8080)

$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$mime = @{
  '.html' = 'text/html; charset=utf-8'; '.js' = 'text/javascript; charset=utf-8'; '.css' = 'text/css; charset=utf-8'
  '.json' = 'application/json'; '.svg' = 'image/svg+xml'; '.png' = 'image/png'; '.ico' = 'image/x-icon'; '.md' = 'text/plain; charset=utf-8'
}

$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add("http://localhost:$Port/")
try { $listener.Start() } catch {
  Write-Host "Could not start the server on port $Port ($($_.Exception.Message)). Try: play.ps1 -Port 8090" -ForegroundColor Red
  exit 1
}
$url = "http://localhost:$Port/"
Write-Host "MIDNIGHT SHIFT is running at $url  (press Ctrl+C to stop)" -ForegroundColor Green
Start-Process $url

try {
  while ($listener.IsListening) {
    $ctx = $listener.GetContext()
    $path = [Uri]::UnescapeDataString($ctx.Request.Url.AbsolutePath.TrimStart('/'))
    if ([string]::IsNullOrEmpty($path)) { $path = 'index.html' }
    $file = [System.IO.Path]::GetFullPath((Join-Path $root $path))
    $res = $ctx.Response
    # never serve anything outside the game folder
    if ($file.StartsWith($root, [StringComparison]::OrdinalIgnoreCase) -and (Test-Path $file -PathType Leaf)) {
      $bytes = [System.IO.File]::ReadAllBytes($file)
      $ext = [System.IO.Path]::GetExtension($file).ToLower()
      $res.ContentType = if ($mime.ContainsKey($ext)) { $mime[$ext] } else { 'application/octet-stream' }
      $res.Headers.Add('Cache-Control', 'no-cache')
      $res.ContentLength64 = $bytes.Length
      $res.OutputStream.Write($bytes, 0, $bytes.Length)
    } else {
      $res.StatusCode = 404
    }
    $res.Close()
  }
} finally {
  $listener.Stop()
}
