param(
  [Parameter(Mandatory = $true)]
  [string]$InputXlsx,
  [string]$OutputJson = "assets/rates/fy2026_master.json"
)

Add-Type -AssemblyName System.IO.Compression.FileSystem

function Get-EntryText($zip, $name) {
  $entry = $zip.Entries | Where-Object { $_.FullName -eq $name }
  if (-not $entry) { return $null }
  $sr = New-Object System.IO.StreamReader($entry.Open())
  $text = $sr.ReadToEnd()
  $sr.Close()
  return $text
}

function CellText($c, $sharedStrings) {
  $t = [string]$c.t
  $v = [string]$c.v
  if ($t -eq "s" -and $v -match "^\d+$") {
    return $sharedStrings[[int]$v]
  }
  return $v
}

$zip = [System.IO.Compression.ZipFile]::OpenRead((Resolve-Path $InputXlsx))
try {
  [xml]$sharedXml = Get-EntryText $zip "xl/sharedStrings.xml"
  [xml]$sheetXml = Get-EntryText $zip "xl/worksheets/sheet1.xml"
  if (-not $sheetXml) {
    throw "Unable to read worksheet XML from input workbook."
  }

  $sharedStrings = @()
  foreach ($si in $sharedXml.sst.si) {
    if ($si.t) {
      $sharedStrings += [string]$si.t
    } elseif ($si.r) {
      $full = ""
      foreach ($r in $si.r) { $full += [string]$r.t }
      $sharedStrings += $full
    } else {
      $sharedStrings += ""
    }
  }

  $rows = @()
  foreach ($r in $sheetXml.worksheet.sheetData.row) {
    $rIndex = [int]$r.r
    if ($rIndex -lt 4) { continue }

    $cells = @{}
    foreach ($c in $r.c) {
      $col = ($c.r -replace "\d", "")
      $cells[$col] = CellText $c $sharedStrings
    }

    $state = [string]$cells["B"]
    $destination = [string]$cells["C"]
    $county = [string]$cells["D"]
    $seasonBegin = [string]$cells["E"]
    $seasonEnd = [string]$cells["F"]
    $mieRaw = [string]$cells["H"]

    if ([string]::IsNullOrWhiteSpace($state) -or
        [string]::IsNullOrWhiteSpace($destination) -or
        [string]::IsNullOrWhiteSpace($county) -or
        [string]::IsNullOrWhiteSpace($mieRaw)) {
      continue
    }

    $mie = 0
    [void][int]::TryParse($mieRaw, [ref]$mie)

    $rows += [PSCustomObject]@{
      state = $state.Trim()
      destination = $destination.Trim()
      county = $county.Trim()
      seasonBegin = $seasonBegin.Trim()
      seasonEnd = $seasonEnd.Trim()
      mieRate = $mie
    }
  }

  $json = $rows | ConvertTo-Json -Depth 4
  $outputPath = Join-Path (Get-Location) $OutputJson
  $outputDir = Split-Path -Parent $outputPath
  if (-not (Test-Path $outputDir)) {
    New-Item -ItemType Directory -Force $outputDir | Out-Null
  }
  $enc = New-Object System.Text.UTF8Encoding($false)
  [System.IO.File]::WriteAllText($outputPath, $json, $enc)
  Write-Output "Wrote $($rows.Count) rows to $outputPath"
}
finally {
  $zip.Dispose()
}

