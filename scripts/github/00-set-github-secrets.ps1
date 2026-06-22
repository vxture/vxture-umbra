param(
  [string]$Repo = "vxture/umbra",
  [string]$EnvFile = "private/github-actions.local.env",
  [string]$EnvironmentName = "production",
  [switch]$DryRun
)

$ErrorActionPreference = "Stop"

function Read-LocalEnvFile {
  param([string]$Path)

  if (-not (Test-Path -LiteralPath $Path)) {
    throw "Env file not found: $Path"
  }

  $values = @{}
  foreach ($line in Get-Content -LiteralPath $Path) {
    $trimmed = $line.Trim()
    if ($trimmed.Length -eq 0 -or $trimmed.StartsWith("#")) {
      continue
    }

    $parts = $trimmed.Split("=", 2)
    if ($parts.Count -ne 2) {
      throw "Invalid env line: $line"
    }

    $key = $parts[0].Trim()
    $value = $parts[1]
    if ($value.Length -ge 2) {
      $first = $value[0]
      $last = $value[$value.Length - 1]
      if (($first -eq '"' -and $last -eq '"') -or ($first -eq "'" -and $last -eq "'")) {
        $value = $value.Substring(1, $value.Length - 2)
      }
    }
    $values[$key] = $value
  }
  return $values
}

function Require-Command {
  param([string]$Name)
  if (-not (Get-Command $Name -ErrorAction SilentlyContinue)) {
    throw "Required command not found: $Name"
  }
}

function Require-Value {
  param(
    [hashtable]$Values,
    [string]$Name
  )
  if (-not $Values.ContainsKey($Name) -or [string]::IsNullOrWhiteSpace($Values[$Name])) {
    throw "Required value missing in env file: $Name"
  }
}

function Set-RepoSecret {
  param(
    [string]$Name,
    [string]$Value
  )
  if ([string]::IsNullOrWhiteSpace($Value)) {
    Write-Host "[skip] repo secret $Name is empty"
    return
  }
  if ($DryRun) {
    Write-Host "[dry-run] repo secret $Name"
    return
  }

  $Value | gh secret set $Name --repo $Repo
  Write-Host "[ok] repo secret $Name"
}

function Ensure-GitHubEnvironment {
  if ($DryRun) {
    Write-Host "[dry-run] ensure environment $EnvironmentName"
    return
  }

  gh api --method PUT "repos/$Repo/environments/$EnvironmentName" | Out-Null
  Write-Host "[ok] environment $EnvironmentName"
}

function Set-EnvironmentSecret {
  param(
    [string]$Name,
    [string]$Value
  )
  if ([string]::IsNullOrWhiteSpace($Value)) {
    Write-Host "[skip] environment secret $Name is empty"
    return
  }
  if ($DryRun) {
    Write-Host "[dry-run] environment secret $Name"
    return
  }

  $Value | gh secret set $Name --repo $Repo --env $EnvironmentName
  Write-Host "[ok] environment secret $Name"
}

function Read-SecretFile {
  param(
    [hashtable]$Values,
    [string]$Name,
    [switch]$Required
  )

  # Supported file variables: DEPLOY_SSH_KEY_FILE, DEPLOY_KNOWN_HOSTS_FILE.
  $fileVar = "${Name}_FILE"
  if (-not $Values.ContainsKey($fileVar) -or [string]::IsNullOrWhiteSpace($Values[$fileVar])) {
    if ($Required) {
      throw "Required file path missing in env file: $fileVar"
    }
    return ""
  }

  $path = $Values[$fileVar]
  if (-not (Test-Path -LiteralPath $path)) {
    if ($Required) {
      throw "Required secret file not found: $path"
    }
    Write-Host "[skip] secret file not found for $Name`: $path"
    return ""
  }
  return (Get-Content -LiteralPath $path -Raw)
}

Require-Command gh
gh auth status | Out-Host

$values = Read-LocalEnvFile -Path $EnvFile

$required = @(
  "NODE_AUTH_TOKEN",
  "ALIYUN_ACR_REGISTRY",
  "ALIYUN_ACR_NAMESPACE",
  "ALIYUN_ACR_USERNAME",
  "ALIYUN_ACR_PASSWORD",
  "PROMOTION_TOKEN",
  "DEPLOY_HOST",
  "DEPLOY_USER"
)

foreach ($name in $required) {
  Require-Value -Values $values -Name $name
}

$deployKey = Read-SecretFile -Values $values -Name "DEPLOY_SSH_KEY" -Required
$knownHosts = Read-SecretFile -Values $values -Name "DEPLOY_KNOWN_HOSTS"

Ensure-GitHubEnvironment

$repoSecrets = @(
  "NODE_AUTH_TOKEN",
  "ALIYUN_ACR_REGISTRY",
  "ALIYUN_ACR_NAMESPACE",
  "ALIYUN_ACR_USERNAME",
  "ALIYUN_ACR_PASSWORD",
  "PROMOTION_TOKEN"
)

foreach ($name in $repoSecrets) {
  $value = if ($values.ContainsKey($name)) { $values[$name] } else { "" }
  Set-RepoSecret -Name $name -Value $value
}

$environmentSecrets = @{
  DEPLOY_HOST = $values["DEPLOY_HOST"]
  DEPLOY_USER = $values["DEPLOY_USER"]
  DEPLOY_PORT = if ($values.ContainsKey("DEPLOY_PORT")) { $values["DEPLOY_PORT"] } else { "" }
  DEPLOY_REPO_DIR = if ($values.ContainsKey("DEPLOY_REPO_DIR")) { $values["DEPLOY_REPO_DIR"] } else { "" }
  DEPLOY_SSH_KEY = $deployKey
  DEPLOY_KNOWN_HOSTS = $knownHosts
  ALIYUN_ACR_REGISTRY = $values["ALIYUN_ACR_REGISTRY"]
  ALIYUN_ACR_NAMESPACE = $values["ALIYUN_ACR_NAMESPACE"]
  ALIYUN_ACR_USERNAME = $values["ALIYUN_ACR_USERNAME"]
  ALIYUN_ACR_PASSWORD = $values["ALIYUN_ACR_PASSWORD"]
}

foreach ($name in $environmentSecrets.Keys) {
  Set-EnvironmentSecret -Name $name -Value $environmentSecrets[$name]
}

Write-Host "[done] GitHub secrets update completed for $Repo"
