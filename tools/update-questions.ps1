# 문제 엑셀(data\questions.xlsx)을 앱이 읽는 js\idioms-data.js 로 변환합니다.
# 엑셀 형식: A열 앞부분 | B열 뒷부분 | C열 완성된 표현 | D열 의미 (첫 행부터 바로 문제)
param(
  [string]$Xlsx = (Join-Path $PSScriptRoot '..\data\questions.xlsx'),
  [string]$Out  = (Join-Path $PSScriptRoot '..\js\idioms-data.js')
)
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.IO.Compression.FileSystem

$zip = [IO.Compression.ZipFile]::OpenRead((Resolve-Path $Xlsx).Path)
function Read-Xml($name) {
  $entry = $zip.GetEntry($name)
  if (-not $entry) { return $null }
  $reader = New-Object IO.StreamReader($entry.Open(), [Text.Encoding]::UTF8)
  try { [xml]$reader.ReadToEnd() } finally { $reader.Close() }
}

try {
  $mainNs = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main'

  # 공유 문자열 (서식이 섞인 글자도 이어 붙이고, 윗주(rPh)는 제외)
  $shared = @()
  $sst = Read-Xml 'xl/sharedStrings.xml'
  if ($sst) {
    $ns = New-Object Xml.XmlNamespaceManager($sst.NameTable); $ns.AddNamespace('x', $mainNs)
    foreach ($si in $sst.SelectNodes('/x:sst/x:si', $ns)) {
      $shared += (($si.SelectNodes('./x:t | ./x:r/x:t', $ns) | ForEach-Object { $_.InnerText }) -join '')
    }
  }

  $sheet = Read-Xml 'xl/worksheets/sheet1.xml'
  $ns = New-Object Xml.XmlNamespaceManager($sheet.NameTable); $ns.AddNamespace('x', $mainNs)

  $items = @()
  foreach ($row in $sheet.SelectNodes('//x:sheetData/x:row', $ns)) {
    $cells = @{}
    foreach ($c in $row.SelectNodes('./x:c', $ns)) {
      $col = $c.GetAttribute('r') -replace '\d', ''
      $type = $c.GetAttribute('t')
      $v = $c.SelectSingleNode('./x:v', $ns)
      if ($type -eq 's') { $val = $shared[[int]$v.InnerText] }
      elseif ($type -eq 'inlineStr') { $val = $c.SelectSingleNode('./x:is', $ns).InnerText }
      elseif ($v) { $val = $v.InnerText }
      else { $val = '' }
      $cells[$col] = ([string]$val).Trim()
    }
    $a = $cells['A']; $b = $cells['B']
    if (-not $a -or -not $b) { continue }
    if ($a -in @('A', '앞', '앞부분', '앞말')) { continue }   # 제목 행이 있으면 건너뜀
    $full = if ($cells['C']) { $cells['C'] } else { "$a $b" }
    $items += [pscustomobject]@{ a = $a; b = $b; full = $full; meaning = [string]$cells['D'] }
  }
} finally { $zip.Dispose() }

function Js([string]$s) { '"' + ($s -replace '\\', '\\' -replace '"', '\"' -replace "`r?`n", '\n') + '"' }

$lines = @('// 자동 생성 파일입니다. 직접 고치지 말고 data\questions.xlsx 를 수정한 뒤', '// "문제 업데이트.bat" 를 실행하세요.', 'window.IDIOMS = [')
$i = 0
foreach ($it in $items) {
  $i++
  $lines += "  { id: $i, a: $(Js $it.a), b: $(Js $it.b), full: $(Js $it.full), meaning: $(Js $it.meaning) },"
}
$lines += '];'
[IO.File]::WriteAllText((Join-Path (Resolve-Path (Split-Path $Out)).Path (Split-Path $Out -Leaf)), ($lines -join "`n") + "`n", (New-Object Text.UTF8Encoding $false))
Write-Host "OK: $i questions -> $Out"
