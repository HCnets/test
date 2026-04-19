$ErrorActionPreference = 'Stop'

$port = 8000
$prefix = $null
$listener = $null
while ($true) {
  $prefix = "http://localhost:$port/"
  try {
    $listener = New-Object System.Net.HttpListener
    $listener.Prefixes.Add($prefix)
    $listener.Start()
    break
  } catch {
    try { if ($listener) { $listener.Stop(); $listener.Close() } } catch {}
    if ($port -ge 8010) { throw }
    $port += 1
  }
}
$root = (Get-Location).Path
Write-Host ("LISTENING " + $prefix + " ROOT " + $root)

try {
  while ($listener.IsListening) {
    $ctx = $listener.GetContext()
    try {
      $p = $ctx.Request.Url.AbsolutePath.TrimStart('/')
      if ([string]::IsNullOrWhiteSpace($p)) { $p = 'index.html' }
      $fp = Join-Path $root $p
      if (Test-Path $fp) {
        $bytes = [System.IO.File]::ReadAllBytes($fp)
        $ext = [System.IO.Path]::GetExtension($fp).ToLowerInvariant()
        $ct = if ($ext -eq '.html') { 'text/html; charset=utf-8' } elseif ($ext -eq '.js') { 'application/javascript; charset=utf-8' } elseif ($ext -eq '.css') { 'text/css; charset=utf-8' } else { 'application/octet-stream' }
        $ctx.Response.ContentType = $ct
        $ctx.Response.StatusCode = 200
        $ctx.Response.OutputStream.Write($bytes, 0, $bytes.Length)
      } else {
        $ctx.Response.StatusCode = 404
      }
    } catch {
      $ctx.Response.StatusCode = 500
    } finally {
      $ctx.Response.OutputStream.Close()
    }
  }
} finally {
  $listener.Stop()
  $listener.Close()
}

