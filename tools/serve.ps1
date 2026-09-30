# 이 폴더를 http://localhost:8080 으로 열어 주는 간단한 테스트용 서버
param([int]$Port = 8080)
$root = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$types = @{ '.html' = 'text/html; charset=utf-8'; '.js' = 'text/javascript; charset=utf-8'; '.css' = 'text/css; charset=utf-8';
  '.json' = 'application/json; charset=utf-8'; '.png' = 'image/png'; '.jpg' = 'image/jpeg'; '.svg' = 'image/svg+xml';
  '.mp3' = 'audio/mpeg'; '.wav' = 'audio/wav'; '.ico' = 'image/x-icon' }

$listener = New-Object Net.HttpListener
$listener.Prefixes.Add("http://localhost:$Port/")
$listener.Start()
Write-Host "서버 실행 중: http://localhost:$Port/  (끄려면 이 창을 닫으세요)"

while ($listener.IsListening) {
  $ctx = $listener.GetContext()
  $path = [Uri]::UnescapeDataString($ctx.Request.Url.AbsolutePath.TrimStart('/'))
  if (-not $path) { $path = 'index.html' }
  $file = [IO.Path]::GetFullPath((Join-Path $root $path))
  $res = $ctx.Response
  if ($file.StartsWith($root) -and (Test-Path $file -PathType Leaf)) {
    $bytes = [IO.File]::ReadAllBytes($file)
    $ext = [IO.Path]::GetExtension($file).ToLower()
    $res.ContentType = if ($types[$ext]) { $types[$ext] } else { 'application/octet-stream' }
    $res.Headers.Add('Cache-Control', 'no-store')
    $res.OutputStream.Write($bytes, 0, $bytes.Length)
  } else {
    $res.StatusCode = 404
  }
  $res.Close()
}
