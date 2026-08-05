[CmdletBinding()]
param(
  [switch]$NoBuild,
  [switch]$SkipProduction,
  [switch]$KeepContainers,
  [ValidateRange(60, 1800)]
  [int]$TimeoutSeconds = 600
)

$ErrorActionPreference = "Stop"

$scriptDirectory = Split-Path -Parent $MyInvocation.MyCommand.Path
$projectRoot = (Resolve-Path (Join-Path $scriptDirectory "..")).Path
$originalLocation = Get-Location
$suffix = [Guid]::NewGuid().ToString("N").Substring(0, 10)
$devProject = "tide-grader-verify-dev-$suffix"
$prodProject = "tide-grader-verify-prod-$suffix"
$devStarted = $false
$prodStarted = $false

$environmentValues = [ordered]@{
  POSTGRES_USER = "tide_verify"
  POSTGRES_PASSWORD = "verify_database_password_$suffix"
  POSTGRES_DB = "tide_verify"
  POSTGRES_PORT = [string](Get-Random -Minimum 41000 -Maximum 44999)
  BACKEND_PORT = [string](Get-Random -Minimum 45000 -Maximum 47999)
  FRONTEND_PORT = [string](Get-Random -Minimum 48000 -Maximum 50999)
  AGENT_PORT = [string](Get-Random -Minimum 51000 -Maximum 53999)
  HTTP_PORT = [string](Get-Random -Minimum 54000 -Maximum 56999)
  AUTH_SECRET = "verify-auth-secret-$suffix-0123456789abcdef"
  BOOTSTRAP_TOKEN = "verify-bootstrap-token-$suffix"
  AUTH_COOKIE_SECURE = "false"
  AGENT_MODE = "mock"
  ENABLE_PASCAL_EXECUTION = "false"
  DEEPSEEK_API_KEY = ""
  DEEPSEEK_INPUT_COST_PER_MILLION_USD = "0"
  DEEPSEEK_OUTPUT_COST_PER_MILLION_USD = "0"
  MATTERMOST_SLASH_TOKEN = "verify-slash-token-$suffix"
  MATTERMOST_TEACHER_USERNAME = ""
  MATTERMOST_ACTION_URL = ""
  LOG_HEALTH_REQUESTS = "false"
  LOG_ERROR_DETAILS = "false"
}
$environmentValues.FRONTEND_ORIGIN = "http://127.0.0.1:$($environmentValues.FRONTEND_PORT)"
$environmentValues.PUBLIC_ORIGIN = "http://127.0.0.1:$($environmentValues.HTTP_PORT)"

$originalEnvironment = @{}
foreach ($name in $environmentValues.Keys) {
  $originalEnvironment[$name] = [Environment]::GetEnvironmentVariable($name, "Process")
}

function Invoke-External {
  param(
    [Parameter(Mandatory = $true)]
    [string]$Description,
    [Parameter(Mandatory = $true)]
    [string]$FilePath,
    [Parameter(Mandatory = $true)]
    [string[]]$Arguments
  )

  Write-Host "`n==> $Description" -ForegroundColor Cyan
  & $FilePath @Arguments
  if ($LASTEXITCODE -ne 0) {
    throw "$Description failed with exit code $LASTEXITCODE."
  }
}

function Invoke-ComposeExec {
  param(
    [Parameter(Mandatory = $true)]
    [string[]]$ComposeArguments,
    [Parameter(Mandatory = $true)]
    [string]$Service,
    [Parameter(Mandatory = $true)]
    [string[]]$Command,
    [Parameter(Mandatory = $true)]
    [string]$Description
  )

  Invoke-External -Description $Description -FilePath "docker" `
    -Arguments ($ComposeArguments + @("exec", "-T", $Service) + $Command)
}

function Remove-VerificationStack {
  param(
    [Parameter(Mandatory = $true)]
    [string]$Project,
    [Parameter(Mandatory = $true)]
    [string[]]$ComposeFiles
  )

  $arguments = @("compose", "-p", $Project)
  foreach ($composeFile in $ComposeFiles) {
    $arguments += @("-f", $composeFile)
  }
  $arguments += @("down", "--volumes", "--remove-orphans")

  $previousErrorActionPreference = $ErrorActionPreference
  $ErrorActionPreference = "SilentlyContinue"
  & docker @arguments *> $null
  $cleanupExitCode = $LASTEXITCODE
  $ErrorActionPreference = $previousErrorActionPreference
  if ($cleanupExitCode -ne 0) {
    Write-Warning "Could not fully clean verification resources: $Project"
  }
}

function Get-DatabaseValue {
  param(
    [Parameter(Mandatory = $true)]
    [string[]]$ComposeArguments,
    [Parameter(Mandatory = $true)]
    [string]$Sql
  )

  $value = $Sql | & docker @($ComposeArguments + @(
      "exec", "-T", "db", "psql", "-U", $environmentValues.POSTGRES_USER,
      "-d", $environmentValues.POSTGRES_DB, "-At"
    ))
  if ($LASTEXITCODE -ne 0) {
    throw "Database verification query failed."
  }
  return ($value | Out-String).Trim()
}

function Assert-EmptyMigratedDatabase {
  param(
    [Parameter(Mandatory = $true)]
    [string[]]$ComposeArguments,
    [Parameter(Mandatory = $true)]
    [string]$Mode
  )

  $migrationCount = Get-DatabaseValue -ComposeArguments $ComposeArguments `
    -Sql 'SELECT COUNT(*) FROM "_prisma_migrations";'
  if ($migrationCount -ne "5") {
    throw "$Mode expected 5 migrations, observed $migrationCount."
  }

  $businessCounts = Get-DatabaseValue -ComposeArguments $ComposeArguments -Sql @'
SELECT (SELECT COUNT(*) FROM "User"),
       (SELECT COUNT(*) FROM "Assignment"),
       (SELECT COUNT(*) FROM "Submission"),
       (SELECT COUNT(*) FROM "Evaluation");
'@
  if ($businessCounts -ne "0|0|0|0") {
    throw "$Mode startup or tests left unexpected business data: $businessCounts."
  }
}

try {
  Set-Location $projectRoot
  if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
    throw "Docker CLI was not found."
  }
  & docker info --format "{{.ServerVersion}}" *> $null
  if ($LASTEXITCODE -ne 0) {
    throw "Docker engine is unavailable."
  }

  foreach ($entry in $environmentValues.GetEnumerator()) {
    Set-Item -Path "Env:$($entry.Key)" -Value $entry.Value
  }

  $devCompose = @(
    "compose", "-p", $devProject,
    "-f", "compose.base.yml", "-f", "docker-compose.yml"
  )
  $prodCompose = @(
    "compose", "-p", $prodProject,
    "-f", "compose.base.yml", "-f", "docker-compose.prod.yml"
  )

  Invoke-External -Description "Validating development Compose" -FilePath "docker" `
    -Arguments ($devCompose + @("config", "--quiet"))
  Invoke-External -Description "Validating production Compose" -FilePath "docker" `
    -Arguments ($prodCompose + @("config", "--quiet"))

  $devUp = $devCompose + @("up", "-d", "--wait", "--wait-timeout", [string]$TimeoutSeconds)
  if (-not $NoBuild) { $devUp += "--build" }
  Invoke-External -Description "Starting isolated development verification stack" `
    -FilePath "docker" -Arguments $devUp
  $devStarted = $true

  Invoke-ComposeExec -ComposeArguments $devCompose -Service "backend" `
    -Command @("npm", "run", "typecheck") -Description "Backend type check"
  Invoke-ComposeExec -ComposeArguments $devCompose -Service "backend" `
    -Command @("npm", "run", "test:unit") -Description "Backend unit tests"
  Invoke-ComposeExec -ComposeArguments $devCompose -Service "backend" `
    -Command @("npm", "run", "test:api") -Description "Backend PostgreSQL and Agent integration tests"
  Invoke-ComposeExec -ComposeArguments $devCompose -Service "backend" `
    -Command @("npm", "run", "build") -Description "Backend production bundle"
  Invoke-ComposeExec -ComposeArguments $devCompose -Service "backend" `
    -Command @("npm", "audit") -Description "Backend dependency audit"

  Invoke-ComposeExec -ComposeArguments $devCompose -Service "frontend" `
    -Command @("npm", "run", "lint") -Description "Frontend lint"
  Invoke-ComposeExec -ComposeArguments $devCompose -Service "frontend" `
    -Command @("npm", "test") -Description "Frontend tests"
  Invoke-ComposeExec -ComposeArguments $devCompose -Service "frontend" `
    -Command @("npm", "run", "build") -Description "Frontend static build"
  Invoke-ComposeExec -ComposeArguments $devCompose -Service "frontend" `
    -Command @("npm", "audit") -Description "Frontend dependency audit"

  Invoke-ComposeExec -ComposeArguments $devCompose -Service "agent" `
    -Command @("python", "-m", "unittest", "discover", "-v", "-p", "test_*.py") `
    -Description "Agent module tests"
  Invoke-ComposeExec -ComposeArguments $devCompose -Service "agent" `
    -Command @("python", "-m", "ruff", "check", ".") -Description "Agent lint"
  Invoke-ComposeExec -ComposeArguments $devCompose -Service "agent" `
    -Command @(
      "python", "-m", "pip_audit", "--cache-dir", "/tmp/pip-audit-cache",
      "-r", "requirements.txt"
    ) `
    -Description "Agent dependency audit"

  $acceptanceTestsMount = (Join-Path $projectRoot "tests") + ":/tests:ro"
  Invoke-External -Description "Synthetic end-to-end acceptance tests" -FilePath "docker" `
    -Arguments @(
      "run", "--rm", "--network", "${devProject}_default",
      "-e", "AGENT_URL=http://agent:8000",
      "-v", $acceptanceTestsMount,
      "node:24-alpine", "node", "/tests/run_acceptance_tests.mjs"
    )

  Assert-EmptyMigratedDatabase -ComposeArguments $devCompose -Mode "Development"

  if (-not $SkipProduction) {
    $prodUp = $prodCompose + @("up", "-d", "--wait", "--wait-timeout", [string]$TimeoutSeconds)
    if (-not $NoBuild) { $prodUp += "--build" }
    Invoke-External -Description "Starting isolated production verification stack" `
      -FilePath "docker" -Arguments $prodUp
    $prodStarted = $true

    foreach ($service in @("db", "backend", "agent", "frontend")) {
      $uid = & docker @($prodCompose + @("exec", "-T", $service, "id", "-u"))
      if ($LASTEXITCODE -ne 0 -or ($uid | Out-String).Trim() -eq "0") {
        throw "Production service $service is running as root or could not be inspected."
      }
    }

    $productionPorts = @{
      db = "5432/tcp"
      backend = "3000/tcp"
      agent = "8000/tcp"
      frontend = "8080/tcp"
    }
    foreach ($service in $productionPorts.Keys) {
      $containerId = & docker @($prodCompose + @("ps", "-q", $service))
      if ($LASTEXITCODE -ne 0 -or -not ($containerId | Out-String).Trim()) {
        throw "Production service $service could not be inspected."
      }
      $containerInspection = (& docker inspect ($containerId | Out-String).Trim() | Out-String) |
        ConvertFrom-Json
      $portProperty = $containerInspection[0].NetworkSettings.Ports.PSObject.Properties[
        $productionPorts[$service]
      ]
      $isPublished = $null -ne $portProperty -and $null -ne $portProperty.Value
      if ($service -eq "frontend" -and -not $isPublished) {
        throw "Production frontend host port was not published."
      }
      if ($service -ne "frontend" -and $isPublished) {
        throw "Production service $service unexpectedly publishes a host port."
      }
    }

    $pascalExecution = & docker @($prodCompose + @(
        "exec", "-T", "agent", "printenv", "ENABLE_PASCAL_EXECUTION"
      ))
    if (($pascalExecution | Out-String).Trim().ToLowerInvariant() -ne "false") {
      throw "Pascal execution is not disabled in production verification."
    }

    $staticHealth = Invoke-WebRequest -UseBasicParsing `
      -Uri "http://127.0.0.1:$($environmentValues.HTTP_PORT)/healthz" `
      -TimeoutSec 10
    $apiHealth = Invoke-WebRequest -UseBasicParsing `
      -Uri "http://127.0.0.1:$($environmentValues.HTTP_PORT)/api/health" `
      -TimeoutSec 10
    if ($staticHealth.StatusCode -ne 200 -or $apiHealth.StatusCode -ne 200) {
      throw "Production HTTP health checks failed."
    }

    Assert-EmptyMigratedDatabase -ComposeArguments $prodCompose -Mode "Production"
    $backendLogs = & docker @($prodCompose + @("logs", "backend")) 2>&1 | Out-String
    if ($backendLogs -match "prisma:seed|seed\.ts") {
      throw "Production startup attempted to run Seed."
    }
  }

  Write-Host "`nAll TIDE verification gates passed." -ForegroundColor Green
}
finally {
  if (-not $KeepContainers) {
    if ($prodStarted) {
      Remove-VerificationStack -Project $prodProject `
        -ComposeFiles @("compose.base.yml", "docker-compose.prod.yml")
    }
    if ($devStarted) {
      Remove-VerificationStack -Project $devProject `
        -ComposeFiles @("compose.base.yml", "docker-compose.yml")
    }
  }

  foreach ($name in $environmentValues.Keys) {
    $previous = $originalEnvironment[$name]
    if ($null -eq $previous) {
      Remove-Item -Path "Env:$name" -ErrorAction SilentlyContinue
    }
    else {
      Set-Item -Path "Env:$name" -Value $previous
    }
  }
  Set-Location $originalLocation
}
