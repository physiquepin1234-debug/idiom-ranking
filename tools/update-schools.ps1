# NEIS 교육정보 개방 포털에서 전국 초등학교 목록을 받아 js\schools-data.js 로 저장합니다.
# 인증키는 파일에 저장하지 않습니다. 실행할 때 입력하세요.
param(
  [string]$Key,
  [string]$Out = (Join-Path $PSScriptRoot '..\js\schools-data.js')
)
$ErrorActionPreference = 'Stop'
if (-not $Key) { $Key = Read-Host 'NEIS 인증키를 입력하세요' }

$regionShort = @{
  '서울특별시' = '서울'; '부산광역시' = '부산'; '대구광역시' = '대구'; '인천광역시' = '인천'; '광주광역시' = '광주'
  '대전광역시' = '대전'; '울산광역시' = '울산'; '세종특별자치시' = '세종'; '경기도' = '경기'
  '강원도' = '강원'; '강원특별자치도' = '강원'; '충청북도' = '충북'; '충청남도' = '충남'
  '전라북도' = '전북'; '전북특별자치도' = '전북'; '전라남도' = '전남'; '경상북도' = '경북'; '경상남도' = '경남'
  '제주특별자치도' = '제주'
}

function Get-Page([int]$page) {
  $kind = [Uri]::EscapeDataString('초등학교')
  $url = "https://open.neis.go.kr/hub/schoolInfo?KEY=$Key&Type=json&pIndex=$page&pSize=1000&SCHUL_KND_SC_NM=$kind"
  $res = Invoke-WebRequest -Uri $url -UseBasicParsing
  $ms = New-Object IO.MemoryStream
  $res.RawContentStream.CopyTo($ms)
  [Text.Encoding]::UTF8.GetString($ms.ToArray()) | ConvertFrom-Json
}

$schools = @()
$page = 1
while ($true) {
  $data = Get-Page $page
  if (-not $data.schoolInfo) {
    if ($page -eq 1) { throw "목록을 받지 못했습니다: $($data.RESULT.MESSAGE)" }
    break
  }
  $rows = $data.schoolInfo[1].row
  foreach ($r in $rows) {
    if (-not ([string]$r.SD_SCHUL_CODE).Trim()) { continue }   # 코드 없는 개교 예정(가칭) 학교 제외
    $tokens = ([string]$r.ORG_RDNMA).Split(' ', [StringSplitOptions]::RemoveEmptyEntries)
    $addr = ($tokens | Select-Object -First 2) -join ' '
    if ($tokens.Count -ge 3 -and $tokens[2].EndsWith('구')) { $addr += ' ' + $tokens[2] }
    $region = $regionShort[[string]$r.LCTN_SC_NM]
    if (-not $region) { $region = [string]$r.LCTN_SC_NM }
    if ($region -match '\((.+)\)$') { $region = $Matches[1] }   # 예: 전남광주통합특별시(전남) -> 전남
    $schools += , @([string]$r.SD_SCHUL_CODE, [string]$r.SCHUL_NM, $region, $addr)
  }
  Write-Host "page $page : $($rows.Count)"
  if ($rows.Count -lt 1000) { break }
  $page++
}

function Js([string]$s) { '"' + ($s -replace '\\', '\\' -replace '"', '\"') + '"' }
$sorted = $schools | Sort-Object { $_[1] }
$lines = @(
  "// 자동 생성 파일 (NEIS 학교기본정보, $(Get-Date -Format 'yyyy-MM-dd') 기준). 다시 받으려면 '학교목록 업데이트.bat' 실행",
  '// 형식: [학교코드, 학교명, 시도, 주소]',
  'window.SCHOOLS_SAMPLE = false;',
  'window.SCHOOLS = ['
)
foreach ($s in $sorted) { $lines += "[$(Js $s[0]),$(Js $s[1]),$(Js $s[2]),$(Js $s[3])]," }
$lines += '].map(([code, name, region, addr]) => ({ code, name, region, addr }));'
$outPath = Join-Path (Resolve-Path (Split-Path $Out)).Path (Split-Path $Out -Leaf)
[IO.File]::WriteAllText($outPath, ($lines -join "`n") + "`n", (New-Object Text.UTF8Encoding $false))
Write-Host "OK: $($schools.Count) schools -> $outPath"
