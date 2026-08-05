[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)]
  [string]$BackupPath,
  [Parameter(Mandatory = $true)]
  [string]$TargetDatabase,
  [string]$EnvironmentFile = ".env.production",
  [string]$ProjectName = "tide-final-grading"
)

$ErrorActionPreference = "Stop"
if ($TargetDatabase -notmatch '^[A-Za-z][A-Za-z0-9_]{2,62}$') {
  throw "TargetDatabase must be a 3-63 character PostgreSQL identifier."
}

$projectRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$absoluteBackup = (Resolve-Path -LiteralPath $BackupPath).Path
$composeFile = Join-Path $projectRoot "docker-compose.prod.yml"
$composeArguments = @("compose", "-p", $ProjectName, "-f", $composeFile)
if ($EnvironmentFile) {
  $resolvedEnvironment = [IO.Path]::GetFullPath((Join-Path $projectRoot $EnvironmentFile))
  if (-not (Test-Path -LiteralPath $resolvedEnvironment -PathType Leaf)) {
    throw "Production environment file was not found: $resolvedEnvironment"
  }
  $composeArguments = @("compose", "--env-file", $resolvedEnvironment, "-p", $ProjectName, "-f", $composeFile)
}

$containerId = (& docker @($composeArguments + @("ps", "-q", "db")) | Out-String).Trim()
if ($LASTEXITCODE -ne 0 -or -not $containerId) {
  throw "The production PostgreSQL container is not running for project $ProjectName."
}
$sourceDatabase = (& docker exec $containerId printenv POSTGRES_DB | Out-String).Trim()
if (-not $sourceDatabase) { throw "POSTGRES_DB is not configured in the database container." }
$databaseUser = (& docker exec $containerId printenv POSTGRES_USER | Out-String).Trim()
if (-not $databaseUser) { throw "POSTGRES_USER is not configured in the database container." }
if ($TargetDatabase -eq $sourceDatabase) {
  throw "Restore must target a new database, never the active production database."
}

$databaseExists = (& docker exec $containerId psql --username $databaseUser --dbname $sourceDatabase --tuples-only --no-align --command "SELECT 1 FROM pg_database WHERE datname = '$TargetDatabase';" | Out-String).Trim()
if ($LASTEXITCODE -ne 0) { throw "Could not inspect the target database." }
if ($databaseExists -eq "1") { throw "Target database already exists: $TargetDatabase" }

$containerBackup = "/var/lib/postgresql/data/.tide-grader-restore-$([Guid]::NewGuid().ToString('N')).dump"
$createdDatabase = $false
try {
  & docker cp $absoluteBackup "${containerId}:$containerBackup"
  if ($LASTEXITCODE -ne 0) { throw "Copying the backup into PostgreSQL failed." }
  & docker exec $containerId createdb --username $databaseUser $TargetDatabase
  if ($LASTEXITCODE -ne 0) { throw "Creating the restore target database failed." }
  $createdDatabase = $true
  & docker exec $containerId pg_restore --username $databaseUser --dbname $TargetDatabase --exit-on-error --no-owner --no-privileges $containerBackup
  if ($LASTEXITCODE -ne 0) { throw "pg_restore failed." }
}
catch {
  if ($createdDatabase) {
    & docker exec $containerId dropdb --username $databaseUser --if-exists $TargetDatabase *> $null
  }
  throw
}
finally {
  & docker exec $containerId rm -f -- $containerBackup *> $null
}

Write-Output "Restored backup into fresh database '$TargetDatabase'."
Write-Output "Validate it before changing POSTGRES_DB and restarting the Backend."
