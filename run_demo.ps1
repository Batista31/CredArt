<#
  run_demo.ps1 - one-command launcher for the CredArt demo.

  Starts each service in its own PowerShell window (so you can watch logs and
  Ctrl-C them individually), in the order the demo needs:

    1. bank MCP server        :8000   (bank data flows over MCP, not in-process)
    2. mock hotel storefront  :8002   (live "assisted" hotel booking target)
    3. backend API            :8001   (started AFTER 1 and 2 so it connects to both)
    4. frontend (Vite)        :5173

  Usage (from the repo root):
    .\run_demo.ps1                     # start all four services
    .\run_demo.ps1 -Reset              # reset both demo personas first
    .\run_demo.ps1 -Reset -Preflight   # reset, launch, then run preflight checks
    .\run_demo.ps1 -NoFrontend         # backend stack only (no Vite)

  Then open http://localhost:5173  ->  Bank  ->  Production  ->  Riya.
#>
param(
    [switch]$Reset,      # run db\run_reset.py before launching
    [switch]$Preflight,  # run demo_preflight.py after launching
    [switch]$NoFrontend  # skip the Vite dev server
)

$ErrorActionPreference = 'Stop'
$root = $PSScriptRoot
$py   = Join-Path $root 'backend\.venv\Scripts\python.exe'

if (-not (Test-Path $py)) {
    throw "venv python not found at $py - create the backend venv first (see backend\README.md)."
}

function Start-Server($title, $workdir, $cmd) {
    Write-Host "  -> launching $title" -ForegroundColor Cyan
    Start-Process powershell -ArgumentList @(
        '-NoExit', '-Command',
        "`$host.UI.RawUI.WindowTitle = '$title'; Set-Location '$workdir'; $cmd"
    )
}

$backend  = Join-Path $root 'backend'
$frontend = Join-Path $root 'frontend'

if ($Reset) {
    Write-Host 'Resetting both demo personas (points, expiry, CMR) ...' -ForegroundColor Yellow
    & $py (Join-Path $root 'db\run_reset.py')
}

Write-Host 'Starting CredArt services ...' -ForegroundColor Green
Start-Server 'CredArt MCP :8000'        $backend "& '$py' -m mcp_server"
Start-Server 'CredArt Storefront :8002' $backend "& '$py' -m uvicorn storefront.app:app --port 8002"

# Give the MCP server + storefront a moment to bind before the backend connects,
# otherwise the backend falls back to in-process bank data (bank_data_source != mcp).
Start-Sleep -Seconds 4

Start-Server 'CredArt Backend :8001'    $backend "& '$py' -m uvicorn api.main:app --port 8001"

if (-not $NoFrontend) {
    Start-Server 'CredArt Frontend :5173' $frontend 'npm run dev'
}

if ($Preflight) {
    Write-Host 'Waiting for the backend to warm up before preflight ...' -ForegroundColor Yellow
    Start-Sleep -Seconds 8
    & $py (Join-Path $backend 'demo_preflight.py')
}

Write-Host ''
Write-Host 'All services launched in separate windows.' -ForegroundColor Green
Write-Host 'Open http://localhost:5173  ->  Bank  ->  Production  ->  Riya' -ForegroundColor Green
