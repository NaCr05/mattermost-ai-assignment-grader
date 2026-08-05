[CmdletBinding()]
param(
  [string]$EnvironmentFile = ".env.production",
  [string]$ProjectName = "tide-final-grading",
  [string]$OutputPath,
  [switch]$Force
)

$ErrorActionPreference = "Stop"
$projectRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$composeFile = Join-Path $projectRoot "docker-compose.prod.yml"
$composeArguments = @("compose", "-p", $ProjectName, "-f", $composeFile)
if ($EnvironmentFile) {
  $resolvedEnvironment = [IO.Path]::GetFullPath((Join-Path $projectRoot $EnvironmentFile))
  if (-not (Test-Path -LiteralPath $resolvedEnvironment -PathType Leaf)) {
    throw "Production environment file was not found: $resolvedEnvironment"
  }
  $composeArguments = @("compose", "--env-file", $resolvedEnvironment, "-p", $ProjectName, "-f", $composeFile)
}

if (-not $OutputPath) {
  $timestamp = (Get-Date).ToUniversalTime().ToString("yyyyMMdd-HHmmss")
  $OutputPath = Join-Path $projectRoot "backups/tide-grader-$timestamp.dump"
}
$absoluteOutput = [IO.Path]::GetFullPath($OutputPath)
$outputDirectory = Split-Path -Parent $absoluteOutput
if (Test-Path -LiteralPath $absoluteOutput) {
  if (-not $Force) { throw "Backup already exists: $absoluteOutput" }
  Remove-Item -LiteralPath $absoluteOutput -Force
}
New-Item -ItemType Directory -Path $outputDirectory -Force | Out-Null

$containerId = (& docker @($composeArguments + @("ps", "-q", "db")) | Out-String).Trim()
if ($LASTEXITCODE -ne 0 -or -not $containerId) {
  throw "The production PostgreSQL container is not running for project $ProjectName."
}

$containerBackup = "/tmp/tide-grader-$([Guid]::NewGuid().ToString('N')).dump"
try {
  & docker exec $containerId sh -c 'pg_dump --username="$POSTGRES_USER" --dbname="$POSTGRES_DB" --format=custom --no-owner --no-privileges --file="$1"' -- $containerBackup
  if ($LASTEXITCODE -ne 0) { throw "pg_dump failed." }
  & docker cp "${containerId}:$containerBackup" $absoluteOutput
  if ($LASTEXITCODE -ne 0) { throw "Copying the backup from PostgreSQL failed." }
}
finally {
  & docker exec $containerId rm -f -- $containerBackup *> $null
}

$backup = Get-Item -LiteralPath $absoluteOutput
if ($backup.Length -le 0) { throw "The generated backup is empty." }
Write-Output $backup.FullName
