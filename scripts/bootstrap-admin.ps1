[CmdletBinding()]
param(
  [string]$EnvironmentFile = ".env",
  [string]$BackendUrl = "",
  [string]$FrontendUrl = "",
  [string]$Username = "",
  [string]$DisplayName = "",
  [System.Security.SecureString]$Password,
  [System.Security.SecureString]$ConfirmPassword
)

$ErrorActionPreference = "Stop"

$scriptDirectory = Split-Path -Parent $MyInvocation.MyCommand.Path
$projectRoot = (Resolve-Path (Join-Path $scriptDirectory "..")).Path

function Resolve-EnvironmentFile {
  if ([string]::IsNullOrWhiteSpace($EnvironmentFile)) {
    return $null
  }

  $candidate = if ([IO.Path]::IsPathRooted($EnvironmentFile)) {
    $EnvironmentFile
  }
  else {
    Join-Path $projectRoot $EnvironmentFile
  }

  if (-not (Test-Path -LiteralPath $candidate -PathType Leaf)) {
    throw "Environment file was not found: $candidate. Run scripts/start-demo.ps1 first or provide -EnvironmentFile."
  }

  return (Resolve-Path -LiteralPath $candidate).Path
}

function Get-ConfigurationValue {
  param(
    [Parameter(Mandatory = $true)]
    [string]$Name,
    [string]$DefaultValue = ""
  )

  if ($environmentPath) {
    $line = Get-Content -LiteralPath $environmentPath |
      Where-Object { $_ -match "^\s*$([regex]::Escape($Name))\s*=" } |
      Select-Object -First 1
    if ($line) {
      $value = ($line -split "=", 2)[1].Trim()
      if (
        $value.Length -ge 2 -and
        (($value.StartsWith('"') -and $value.EndsWith('"')) -or
          ($value.StartsWith("'") -and $value.EndsWith("'")))
      ) {
        $value = $value.Substring(1, $value.Length - 2)
      }
      if (-not [string]::IsNullOrWhiteSpace($value)) {
        return $value
      }
    }
  }

  $processValue = [Environment]::GetEnvironmentVariable($Name, "Process")
  if (-not [string]::IsNullOrWhiteSpace($processValue)) {
    return $processValue
  }

  return $DefaultValue
}

function Convert-SecureValueToPlainText {
  param(
    [Parameter(Mandatory = $true)]
    [System.Security.SecureString]$Value
  )

  $pointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($Value)
  try {
    return [Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer)
  }
  finally {
    [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer)
  }
}

function Get-ErrorResponse {
  param(
    [Parameter(Mandatory = $true)]
    [System.Management.Automation.ErrorRecord]$ErrorRecord
  )

  $statusCode = 0
  if ($ErrorRecord.Exception.Response) {
    try {
      $statusCode = [int]$ErrorRecord.Exception.Response.StatusCode
    }
    catch {
      $statusCode = 0
    }
  }

  $message = ""
  if ($ErrorRecord.ErrorDetails.Message) {
    try {
      $parsed = $ErrorRecord.ErrorDetails.Message | ConvertFrom-Json
      if ($parsed.message) {
        $message = [string]$parsed.message
      }
    }
    catch {
      $message = ""
    }
  }

  return [pscustomobject]@{
    StatusCode = $statusCode
    Message = $message
  }
}

$environmentPath = Resolve-EnvironmentFile
$bootstrapToken = Get-ConfigurationValue -Name "BOOTSTRAP_TOKEN"
if (
  [string]::IsNullOrWhiteSpace($bootstrapToken) -or
  $bootstrapToken -like "replace_with_*"
) {
  throw "BOOTSTRAP_TOKEN is not configured. Run scripts/start-demo.ps1 or set a one-time token in the selected environment file."
}

$backendPort = Get-ConfigurationValue -Name "BACKEND_PORT" -DefaultValue "3001"
$frontendPort = Get-ConfigurationValue -Name "FRONTEND_PORT" -DefaultValue "5173"
$resolvedBackendUrl = if ([string]::IsNullOrWhiteSpace($BackendUrl)) {
  "http://127.0.0.1:$backendPort"
}
else {
  $BackendUrl.TrimEnd("/")
}
$resolvedFrontendUrl = if ([string]::IsNullOrWhiteSpace($FrontendUrl)) {
  "http://127.0.0.1:$frontendPort"
}
else {
  $FrontendUrl.TrimEnd("/")
}

try {
  $healthResponse = Invoke-WebRequest -UseBasicParsing -Uri "$resolvedBackendUrl/health" -TimeoutSec 10
  if ($healthResponse.StatusCode -ne 200) {
    throw "Unexpected health status $($healthResponse.StatusCode)."
  }
}
catch {
  throw "Backend is not reachable at $resolvedBackendUrl. Start the platform and confirm its health endpoint before creating the administrator."
}

if ([string]::IsNullOrWhiteSpace($Username)) {
  $Username = Read-Host "Administrator username"
}
if ([string]::IsNullOrWhiteSpace($DisplayName)) {
  $DisplayName = Read-Host "Administrator display name"
}
$Username = $Username.Trim()
$DisplayName = $DisplayName.Trim()
if (-not $Username -or -not $DisplayName) {
  throw "Administrator username and display name are required."
}

if ($null -eq $Password) {
  $Password = Read-Host "Administrator password (at least 12 characters)" -AsSecureString
}
if ($null -eq $ConfirmPassword) {
  $ConfirmPassword = Read-Host "Confirm administrator password" -AsSecureString
}

$passwordText = $null
$confirmationText = $null
$requestBody = $null
try {
  $passwordText = Convert-SecureValueToPlainText -Value $Password
  $confirmationText = Convert-SecureValueToPlainText -Value $ConfirmPassword

  if ($passwordText.Length -lt 12) {
    throw "Administrator password must contain at least 12 characters."
  }
  if ($passwordText -cne $confirmationText) {
    throw "Administrator password confirmation does not match."
  }

  $requestBody = @{
    username = $Username
    displayName = $DisplayName
    password = $passwordText
  } | ConvertTo-Json -Compress

  try {
    $createdUser = Invoke-RestMethod -Method Post -Uri "$resolvedBackendUrl/auth/bootstrap" `
      -Headers @{ "x-bootstrap-token" = $bootstrapToken } `
      -ContentType "application/json" -Body $requestBody -TimeoutSec 30
  }
  catch {
    $response = Get-ErrorResponse -ErrorRecord $_
    switch ($response.StatusCode) {
      403 {
        throw "Bootstrap was rejected. Confirm the selected environment file matches the running Backend, then recreate Backend if its token changed."
      }
      409 {
        throw "The platform is already initialized. Sign in with an existing teacher account or ask another teacher to reset the password."
      }
      429 {
        throw "Bootstrap is temporarily rate limited. Wait for the configured window before retrying."
      }
      default {
        $detail = if ($response.Message) { ": $($response.Message)" } else { "" }
        throw "Administrator creation failed with HTTP $($response.StatusCode)$detail"
      }
    }
  }

  Write-Host "Platform administrator created: $($createdUser.displayName) (@$($createdUser.username))." -ForegroundColor Green
  Write-Host "Open $resolvedFrontendUrl and sign in with the password you just entered."
  Write-Host "No Bootstrap Token or password was printed. Rotate the Bootstrap Token before a public deployment."
}
finally {
  $passwordText = $null
  $confirmationText = $null
  $requestBody = $null
  $bootstrapToken = $null
}
