[CmdletBinding()]
param(
  [switch]$NoBuild,
  [ValidateRange(30, 600)]
  [int]$TimeoutSeconds = 180
)

$ErrorActionPreference = "Stop"

$scriptDirectory = Split-Path -Parent $MyInvocation.MyCommand.Path
$projectRoot = (Resolve-Path (Join-Path $scriptDirectory "..")).Path
$originalLocation = Get-Location

function Get-DotEnvValue {
  param(
    [Parameter(Mandatory = $true)]
    [string]$Name,
    [Parameter(Mandatory = $true)]
    [string]$DefaultValue
  )

  $line = Get-Content (Join-Path $projectRoot ".env") |
    Where-Object { $_ -match "^\s*$([regex]::Escape($Name))\s*=" } |
    Select-Object -First 1

  if (-not $line) {
    return $DefaultValue
  }

  $value = ($line -split "=", 2)[1].Trim()
  if (-not $value) {
    return $DefaultValue
  }

  return $value
}

function Set-DotEnvValue {
  param(
    [Parameter(Mandatory = $true)]
    [string]$Name,
    [Parameter(Mandatory = $true)]
    [string]$Value
  )

  $envPath = Join-Path $projectRoot ".env"
  $lines = Get-Content $envPath
  $pattern = "^\s*$([regex]::Escape($Name))\s*="
  $replacement = "$Name=$Value"
  $matched = $false
  $updated = $lines | ForEach-Object {
    if ($_ -match $pattern) {
      $matched = $true
      $replacement
    }
    else {
      $_
    }
  }
  if (-not $matched) {
    $updated += $replacement
  }
  Set-Content -Path $envPath -Value $updated -Encoding utf8
}

function New-RandomSecret {
  param(
    [ValidateRange(16, 128)]
    [int]$ByteCount = 32
  )

  $bytes = New-Object byte[] $ByteCount
  $generator = [System.Security.Cryptography.RandomNumberGenerator]::Create()
  try {
    $generator.GetBytes($bytes)
  }
  finally {
    $generator.Dispose()
  }
  return [Convert]::ToBase64String($bytes)
}

function Invoke-Docker {
  param(
    [Parameter(Mandatory = $true)]
    [string[]]$Arguments,
    [Parameter(Mandatory = $true)]
    [string]$Description
  )

  Write-Host "`n==> $Description" -ForegroundColor Cyan
  & docker @Arguments
  if ($LASTEXITCODE -ne 0) {
    throw "$Description failed with exit code $LASTEXITCODE."
  }
}

function Wait-HttpEndpoint {
  param(
    [Parameter(Mandatory = $true)]
    [string]$Name,
    [Parameter(Mandatory = $true)]
    [string]$Uri
  )

  $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
  do {
    try {
      $response = Invoke-WebRequest -UseBasicParsing -Uri $Uri -TimeoutSec 5
      if ($response.StatusCode -ge 200 -and $response.StatusCode -lt 400) {
        Write-Host "[OK] $Name -> $Uri" -ForegroundColor Green
        return
      }
    }
    catch {
      # The service may still be applying migrations or starting Vite.
    }

    Start-Sleep -Seconds 2
  } while ((Get-Date) -lt $deadline)

  throw "$Name did not become ready within $TimeoutSeconds seconds: $Uri"
}

function Wait-ContainerHealth {
  param(
    [Parameter(Mandatory = $true)]
    [string[]]$Services
  )

  $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
  do {
    $allHealthy = $true

    foreach ($service in $Services) {
      $containerId = & docker compose ps -q $service
      if (-not $containerId) {
        $allHealthy = $false
        break
      }

      $health = & docker inspect `
        --format "{{if .State.Health}}{{.State.Health.Status}}{{else}}missing{{end}}" `
        $containerId
      if ($health -ne "healthy") {
        $allHealthy = $false
        break
      }
    }

    if ($allHealthy) {
      Write-Host "[OK] All Compose services are healthy." -ForegroundColor Green
      return
    }

    Start-Sleep -Seconds 2
  } while ((Get-Date) -lt $deadline)

  throw "Compose services did not all become healthy within $TimeoutSeconds seconds."
}

try {
  Set-Location $projectRoot

  if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
    throw "Docker CLI was not found. Start Docker Desktop and reopen PowerShell."
  }

  Write-Host "Checking Docker Desktop..." -ForegroundColor Cyan
  & docker info --format "{{.ServerVersion}}" *> $null
  if ($LASTEXITCODE -ne 0) {
    throw "Docker Desktop is not running or the Docker engine is unavailable."
  }

  $envFile = Join-Path $projectRoot ".env"
  if (-not (Test-Path $envFile)) {
    Copy-Item (Join-Path $projectRoot ".env.example") $envFile
    Set-DotEnvValue -Name "POSTGRES_PASSWORD" -Value ([Guid]::NewGuid().ToString("N"))
    Set-DotEnvValue -Name "AUTH_SECRET" -Value (New-RandomSecret -ByteCount 32)
    Set-DotEnvValue -Name "BOOTSTRAP_TOKEN" -Value (New-RandomSecret -ByteCount 24)
    Write-Host "Created .env from .env.example." -ForegroundColor Yellow
    Write-Host "Generated local AUTH_SECRET and BOOTSTRAP_TOKEN in .env." -ForegroundColor Yellow
    Write-Warning "Configure MATTERMOST_SLASH_TOKEN before testing /ds commands."
  }

  $authSecret = Get-DotEnvValue -Name "AUTH_SECRET" -DefaultValue ""
  if ($authSecret.Length -lt 32 -or $authSecret -like "replace_with_*") {
    throw "AUTH_SECRET must be replaced with a random value of at least 32 characters in .env."
  }
  $databasePassword = Get-DotEnvValue -Name "POSTGRES_PASSWORD" -DefaultValue ""
  if (-not $databasePassword -or $databasePassword -like "replace_with_*") {
    throw "POSTGRES_PASSWORD must be replaced with a local password in .env."
  }

  Invoke-Docker -Arguments @("compose", "config", "--quiet") `
    -Description "Validating Docker Compose configuration"

  $composeArguments = @("compose", "up", "-d")
  if (-not $NoBuild) {
    $composeArguments += "--build"
  }

  try {
    Invoke-Docker -Arguments $composeArguments `
      -Description "Starting local development services and applying migrations"
  }
  catch {
    if ($NoBuild) {
      throw
    }

    Write-Warning "Image build failed, usually because Docker Hub is temporarily unreachable."
    Write-Host "Retrying with locally cached images..." -ForegroundColor Yellow
    Invoke-Docker -Arguments @("compose", "up", "-d", "--no-build") `
      -Description "Starting services from locally cached images"
  }

  $backendPort = Get-DotEnvValue -Name "BACKEND_PORT" -DefaultValue "3001"
  $frontendPort = Get-DotEnvValue -Name "FRONTEND_PORT" -DefaultValue "5173"
  $agentPort = Get-DotEnvValue -Name "AGENT_PORT" -DefaultValue "8000"

  Write-Host "`nWaiting for application health checks..." -ForegroundColor Cyan
  Wait-HttpEndpoint -Name "Backend" -Uri "http://localhost:$backendPort/health"
  Wait-HttpEndpoint -Name "Agent" -Uri "http://localhost:$agentPort/health"
  Wait-HttpEndpoint -Name "Frontend" -Uri "http://localhost:$frontendPort"
  Wait-ContainerHealth -Services @("db", "agent", "backend", "frontend")

  Invoke-Docker -Arguments @("compose", "ps") `
    -Description "Showing final container status"

  Write-Host "`nTIDE local development environment is ready." -ForegroundColor Green
  Write-Host "Frontend : http://localhost:$frontendPort"
  Write-Host "Backend  : http://localhost:$backendPort/health"
  Write-Host "Agent    : http://localhost:$agentPort/health"
  Write-Host ""
  Write-Host "Prisma migrations were applied automatically. Seed data was not loaded."
  Write-Host "Developers may load test data explicitly with: docker compose exec backend npm run prisma:seed"
}
finally {
  Set-Location $originalLocation
}
