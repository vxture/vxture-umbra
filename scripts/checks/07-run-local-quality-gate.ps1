param(
  [switch]$SkipPortalBuilds
)

$ErrorActionPreference = "Stop"
$RepoRoot = Resolve-Path (Join-Path $PSScriptRoot "..\..")
Set-Location $RepoRoot

Write-Host "==> git diff whitespace"
git diff --check

Write-Host "==> shell syntax"
$bash = "bash"
if (Test-Path "D:\Program Files\Git\bin\bash.exe") {
  $bash = "D:\Program Files\Git\bin\bash.exe"
}
Get-ChildItem deploy\worker-03 -Recurse -File -Include *.sh |
  ForEach-Object { & $bash -n $_.FullName }

Write-Host "==> python compile"
python -m compileall -q deploy scripts services

Write-Host "==> deploy contracts"
python scripts\checks\06-check-deploy-contracts.py

Write-Host "==> compose config"
docker compose --env-file .env.example config --quiet

if (-not $SkipPortalBuilds) {
  Write-Host "==> portal type checks"
  npm run type-check --prefix portals\website
  npm run type-check --prefix portals\console

  Write-Host "==> portal builds"
  npm run build --prefix portals\website
  npm run build --prefix portals\console
  npm run build --prefix portals\admin
}

Write-Host "==> local quality gate passed"
