# Local Development Environment

Local AI tools such as Roo Code, Claude Code, and Codex depend on both network
routing and editor extension runtime details. Keep these notes separate from
server deployment docs because they describe operator workstation state.

## Clash / Mihomo TUN Scope

Use TUN when CLI tools or VS Code extensions do not reliably inherit proxy
environment variables. The subscription template keeps TUN bounded by routing
rules:

```yaml
- GEOIP,CN,DIRECT
- MATCH,PROXY
```

Must-direct domains (Microsoft, Vultr, Umbra services, domestic AI) and China
GEOIP traffic route `DIRECT`. Everything else, including explicitly listed
domains such as Anthropic, OpenAI, GitHub, npm, Google, and Cloudflare, falls
through to `PROXY`.

DeepSeek is intentionally direct:

```yaml
- DOMAIN-SUFFIX,deepseek.com,DIRECT
- DOMAIN-SUFFIX,deepseek.ai,DIRECT
- DOMAIN-SUFFIX,api.deepseek.com,DIRECT
```

DeepSeek domains are also in `fake-ip-filter`, so local tools receive real DNS
answers instead of `198.18.0.0/16` synthetic addresses.

Quick checks:

```powershell
Resolve-DnsName api.deepseek.com
curl.exe https://api.deepseek.com
```

Expected:

- DNS returns real public IPs.
- `curl.exe https://api.deepseek.com` returns an authentication error, proving
  the API host is reachable.

## DeepSeek API Check

Do not paste API keys into chat or logs. If a key is exposed, revoke it and
generate a new one before continuing.

PowerShell JSON is safer with `Invoke-RestMethod` than with `curl.exe -d`:

```powershell
$env:DEEPSEEK_API_KEY="sk-..."

$body = @{
  model = "deepseek-v4-flash"
  messages = @(
    @{
      role = "user"
      content = "ping"
    }
  )
  stream = $false
} | ConvertTo-Json -Depth 10 -Compress

$headers = @{
  Authorization = "Bearer $env:DEEPSEEK_API_KEY"
  "Content-Type" = "application/json"
}

Invoke-RestMethod `
  -Uri "https://api.deepseek.com/chat/completions" `
  -Method Post `
  -Headers $headers `
  -Body $body `
  -TimeoutSec 30
```

Model list check:

```powershell
Invoke-RestMethod `
  -Uri "https://api.deepseek.com/models" `
  -Method Get `
  -Headers @{ Authorization = "Bearer $env:DEEPSEEK_API_KEY" } `
  -TimeoutSec 20
```

Expected models:

```text
deepseek-v4-flash
deepseek-v4-pro
```

## Roo Code: API Request Stuck

Observed environment:

- VS Code: `1.122.1`
- Roo Code extension: `rooveterinaryinc.roo-cline-3.54.0`
- Symptom: Roo Code stays on `API Request...` even though direct DeepSeek API
  requests succeed.

Root cause found in VS Code extension host logs:

```text
Error: Could not find ripgrep binary
at initializeFilePaths
at recursivelyMakeClineRequests
at startTask
```

Roo Code 3.54 expects ripgrep under the old VS Code path:

```text
resources/app/node_modules/@vscode/ripgrep/bin/rg.exe
```

VS Code 1.122.1 ships ripgrep under:

```text
resources/app/node_modules/@vscode/ripgrep-universal/bin/win32-x64/rg.exe
```

Roo fails during workspace file initialization before the model request really
completes, but the UI can still show `API Request...`.

### Workaround

Copy VS Code's bundled `rg.exe` into the path Roo expects:

```powershell
$app = "C:\Users\Stone Smoker\AppData\Local\Programs\Microsoft VS Code\8761a5560c\resources\app"
$src = Join-Path $app "node_modules\@vscode\ripgrep-universal\bin\win32-x64\rg.exe"
$dstDir = Join-Path $app "node_modules\@vscode\ripgrep\bin"
$dst = Join-Path $dstDir "rg.exe"

if (!(Test-Path -LiteralPath $src)) {
  throw "source rg.exe not found: $src"
}

New-Item -ItemType Directory -Force -Path $dstDir | Out-Null
Copy-Item -LiteralPath $src -Destination $dst -Force
```

Verify:

```powershell
& "C:\Users\Stone Smoker\AppData\Local\Programs\Microsoft VS Code\8761a5560c\resources\app\node_modules\@vscode\ripgrep\bin\rg.exe" --version
```

Expected:

```text
ripgrep 15.0.0
```

Then reload VS Code:

```text
Command Palette -> Developer: Reload Window
```

or restart VS Code.

This workaround may need to be repeated after VS Code updates, because the
installation hash directory can change. Prefer removing this workaround once
Roo Code supports VS Code's `@vscode/ripgrep-universal` layout directly.

### Roo Code DeepSeek Settings

Known-good API settings:

```text
Provider: DeepSeek
Model: deepseek-v4-flash
```

Fallback if the native DeepSeek provider is still problematic:

```text
Provider: OpenAI Compatible
Base URL: https://api.deepseek.com
Model: deepseek-v4-flash
```

Do not set the base URL to `/chat/completions`; Roo should append the endpoint.
