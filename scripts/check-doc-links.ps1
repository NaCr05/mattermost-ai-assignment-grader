[CmdletBinding()]
param()

$ErrorActionPreference = "Stop"
$projectRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$rootPrefix = $projectRoot.TrimEnd([IO.Path]::DirectorySeparatorChar) + [IO.Path]::DirectorySeparatorChar
$markdownFiles = @(& git -C $projectRoot ls-files -- "*.md")
if ($LASTEXITCODE -ne 0) {
  throw "Could not list tracked Markdown files."
}

$failures = New-Object System.Collections.Generic.List[string]
$linkPattern = '!?' + '\[[^\]]*\]' + '\((?<target>[^)]+)\)'

foreach ($relativeMarkdown in $markdownFiles) {
  $markdownPath = Join-Path $projectRoot ($relativeMarkdown -replace '/', [IO.Path]::DirectorySeparatorChar)
  $content = Get-Content -Raw -Encoding UTF8 -LiteralPath $markdownPath
  foreach ($match in [regex]::Matches($content, $linkPattern)) {
    $target = $match.Groups["target"].Value.Trim()
    if ($target.StartsWith("<")) {
      $closingBracket = $target.IndexOf(">")
      if ($closingBracket -lt 1) { continue }
      $target = $target.Substring(1, $closingBracket - 1)
    }
    else {
      $target = ($target -split '\s+', 2)[0]
    }

    if (
      -not $target -or
      $target.StartsWith("#") -or
      $target -match '^(?i:https?|mailto|data):'
    ) {
      continue
    }

    $fragmentPosition = $target.IndexOfAny([char[]]@('#', '?'))
    if ($fragmentPosition -ge 0) {
      $target = $target.Substring(0, $fragmentPosition)
    }
    if (-not $target) { continue }

    try {
      $target = [Uri]::UnescapeDataString($target)
    }
    catch {
      $failures.Add("$relativeMarkdown -> invalid escaped path '$target'")
      continue
    }

    if ($target -match '^[A-Za-z]:[\\/]') {
      $failures.Add("$relativeMarkdown -> absolute local path '$target'")
      continue
    }

    if ($target.StartsWith("/")) {
      $candidate = Join-Path $projectRoot $target.TrimStart("/")
    }
    else {
      $candidate = Join-Path (Split-Path -Parent $markdownPath) $target
    }
    $absoluteCandidate = [IO.Path]::GetFullPath($candidate)
    if (
      $absoluteCandidate -ne $projectRoot -and
      -not $absoluteCandidate.StartsWith($rootPrefix, [StringComparison]::OrdinalIgnoreCase)
    ) {
      $failures.Add("$relativeMarkdown -> path leaves repository '$target'")
      continue
    }

    if (-not (Test-Path -LiteralPath $absoluteCandidate -PathType Leaf)) {
      $failures.Add("$relativeMarkdown -> missing file '$target'")
      continue
    }

    $relativeCandidate = $absoluteCandidate.Substring($rootPrefix.Length).Replace('\', '/')
    $trackedTarget = @(& git -C $projectRoot ls-files --cached -- $relativeCandidate)
    if ($LASTEXITCODE -ne 0 -or $trackedTarget.Count -eq 0) {
      $failures.Add("$relativeMarkdown -> untracked file '$target'")
    }
  }
}

if ($failures.Count -gt 0) {
  $details = ($failures | Sort-Object -Unique) -join [Environment]::NewLine
  throw "Tracked Markdown link validation failed:`n$details"
}

Write-Output "Tracked Markdown links passed for $($markdownFiles.Count) files."
