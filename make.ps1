# Windows PowerShell equivalent of the Makefile in this directory.
# Use `pwsh ./make.ps1 build` (or another target) to invoke; targets mirror
# `make build` / `make build-app-main` / etc. Defaults to `build` if no
# target is supplied.

[CmdletBinding()]
param(
  [Parameter(Position = 0)]
  [string]$Target = 'build'
)

$ErrorActionPreference = 'Stop'

# Each module's source root + the relative outDir the Wippy server expects.
# Mirrors the rules in Makefile — single source of truth, edit both when
# adding a new FE module.
$modules = @(
  @{ Name = 'app-main';            Path = 'frontend/applications/main';                  OutDir = 'static/app/main' }
  @{ Name = 'app-iframe-demo';     Path = 'frontend/applications/iframe-demo';            OutDir = 'static/app/iframe-demo' }
  @{ Name = 'wc-reaction-bar';     Path = 'frontend/web-components/reaction-bar';         OutDir = 'static/wc/reaction-bar' }
  @{ Name = 'wc-websocket-log';    Path = 'frontend/web-components/websocket-log';        OutDir = 'static/wc/websocket-log' }
  @{ Name = 'wc-chart-circle';     Path = 'frontend/web-components/chart-circle';         OutDir = 'static/wc/chart-circle' }
  @{ Name = 'wc-mermaid';          Path = 'frontend/web-components/mermaid';              OutDir = 'static/wc/mermaid' }
  @{ Name = 'wc-markdown';         Path = 'frontend/web-components/markdown';             OutDir = 'static/wc/markdown' }
  @{ Name = 'wc-model-gallery';    Path = 'frontend/web-components/model-gallery';        OutDir = 'static/wc/model-gallery' }
  @{ Name = 'wc-counter-persist';  Path = 'frontend/web-components/counter-persist';      OutDir = 'static/wc/counter-persist' }
)

function Build-Module {
  param([hashtable]$M, [switch]$Clean)
  $repoRoot = $PSScriptRoot
  $outAbs = Join-Path $repoRoot $M.OutDir
  Push-Location (Join-Path $repoRoot $M.Path)
  try {
    if ($Clean) {
      if (Test-Path 'node_modules') {
        Write-Host "[$($M.Name)] cleaning node_modules"
        Remove-Item -Recurse -Force node_modules
      }
      if (Test-Path 'package-lock.json') {
        # Without removing the lockfile, npm install keeps any old pins
        # (e.g. @wippy-fe/pinia-persist@0.0.26) that conflict with bumped
        # package.json ranges. Forcing a fresh resolve is the whole point
        # of `clean-build`.
        Write-Host "[$($M.Name)] cleaning package-lock.json"
        Remove-Item -Force package-lock.json
      }
    }
    Write-Host "[$($M.Name)] npm install"
    npm install
    if ($LASTEXITCODE -ne 0) { throw "npm install failed for $($M.Name)" }
    Write-Host "[$($M.Name)] npm run build -> $($M.OutDir)"
    npm run build -- --outDir $outAbs --emptyOutDir
    if ($LASTEXITCODE -ne 0) { throw "npm run build failed for $($M.Name)" }
  }
  finally { Pop-Location }
}

function Lint-Module {
  param([hashtable]$M)
  $repoRoot = $PSScriptRoot
  Push-Location (Join-Path $repoRoot $M.Path)
  try {
    Write-Host "[$($M.Name)] npm run lint"
    npm run lint
    if ($LASTEXITCODE -ne 0) { throw "npm run lint failed for $($M.Name)" }
  }
  finally { Pop-Location }
}

switch ($Target) {
  'build' {
    foreach ($m in $modules) { Build-Module -M $m }
  }
  'clean-build' {
    foreach ($m in $modules) { Build-Module -M $m -Clean }
  }
  'lint' {
    foreach ($m in $modules) { Lint-Module -M $m }
  }
  default {
    # Per-module targets: build-app-main, build-wc-mermaid, etc.
    $name = $Target -replace '^build-', ''
    $m = $modules | Where-Object { $_.Name -eq $name } | Select-Object -First 1
    if ($null -eq $m) {
      Write-Error "Unknown target '$Target'. Available: build, clean-build, lint, or build-<module-name> where <module-name> in $($modules.Name -join ', ')"
      exit 1
    }
    Build-Module -M $m
  }
}
