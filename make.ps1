# Windows wrapper that mirrors the Makefile targets one-for-one.
# Invoke through make.bat (`make build`, `make build-app-main`, etc.) or
# directly: `powershell -ExecutionPolicy Bypass -File make.ps1 <target>`.
#
# Pure ASCII on purpose: Windows PowerShell 5.1 reads BOM-less files as
# Windows-1252, so any non-ASCII char (em-dash, smart quote) corrupts on
# read. Don't introduce non-ASCII chars without also adding a UTF-8 BOM.
[CmdletBinding()]
param(
    [Parameter(Position = 0)]
    [string]$Target = 'help'
)

$ErrorActionPreference = 'Stop'
Set-Location $PSScriptRoot

# (name, dir, out) tuples - single source of truth for every build-app-* /
# build-wc-* target. Keep in sync with the Makefile when adding apps.
$apps = @(
    @{ name = 'main';             dir = 'frontend/applications/main';             out = 'static/app/main' }
    @{ name = 'iframe-demo';      dir = 'frontend/applications/iframe-demo';      out = 'static/app/iframe-demo' }
    @{ name = 'dam-gallery';      dir = 'frontend/applications/dam-gallery';      out = 'static/app/dam-gallery' }
    @{ name = 'dam-list';         dir = 'frontend/applications/dam-list';         out = 'static/app/dam-list' }
    @{ name = 'dam-detail';       dir = 'frontend/applications/dam-detail';       out = 'static/app/dam-detail' }
    @{ name = 'dam-settings';     dir = 'frontend/applications/dam-settings';     out = 'static/app/dam-settings' }
    @{ name = 'dam-side-history'; dir = 'frontend/applications/dam-side-history'; out = 'static/app/dam-side-history' }
)

$wcs = @(
    @{ name = 'reaction-bar';          dir = 'frontend/web-components/reaction-bar';          out = 'static/wc/reaction-bar' }
    @{ name = 'websocket-log';         dir = 'frontend/web-components/websocket-log';         out = 'static/wc/websocket-log' }
    @{ name = 'chart-circle';          dir = 'frontend/web-components/chart-circle';          out = 'static/wc/chart-circle' }
    @{ name = 'mermaid';               dir = 'frontend/web-components/mermaid';               out = 'static/wc/mermaid' }
    @{ name = 'markdown';              dir = 'frontend/web-components/markdown';              out = 'static/wc/markdown' }
    @{ name = 'model-gallery';         dir = 'frontend/web-components/model-gallery';         out = 'static/wc/model-gallery' }
    @{ name = 'counter-persist';       dir = 'frontend/web-components/counter-persist';       out = 'static/wc/counter-persist' }
    @{ name = 'dam-header';            dir = 'frontend/web-components/dam-header';            out = 'static/wc/dam-header' }
    @{ name = 'dam-subheader';         dir = 'frontend/web-components/dam-subheader';         out = 'static/wc/dam-subheader' }
    @{ name = 'dam-filterbar';         dir = 'frontend/web-components/dam-filterbar';         out = 'static/wc/dam-filterbar' }
    @{ name = 'dam-toolbar';           dir = 'frontend/web-components/dam-toolbar';           out = 'static/wc/dam-toolbar' }
    @{ name = 'dam-footer';            dir = 'frontend/web-components/dam-footer';            out = 'static/wc/dam-footer' }
    @{ name = 'dam-tools-flap';        dir = 'frontend/web-components/dam-tools-flap';        out = 'static/wc/dam-tools-flap' }
    @{ name = 'dam-details-flap';      dir = 'frontend/web-components/dam-details-flap';      out = 'static/wc/dam-details-flap' }
    @{ name = 'dam-coordinator';       dir = 'frontend/web-components/dam-coordinator';       out = 'static/wc/dam-coordinator' }
    @{ name = 'dam-upload-modal-body'; dir = 'frontend/web-components/dam-upload-modal-body'; out = 'static/wc/dam-upload-modal-body' }
)

# Subset that runs `npm run lint` - mirrors Makefile's `lint:` recipe.
$lintDirs = @(
    'frontend/applications/main'
    'frontend/web-components/reaction-bar'
    'frontend/web-components/websocket-log'
    'frontend/web-components/chart-circle'
    'frontend/web-components/mermaid'
    'frontend/web-components/markdown'
    'frontend/web-components/model-gallery'
    'frontend/web-components/counter-persist'
)

# Subset that participates in `clean-build` - mirrors Makefile's
# clean-build recipe (it only nukes the older subset, not the dam-* WCs).
$cleanBuildItems = @(
    @{ dir = 'frontend/applications/main';              out = 'static/app/main' }
    @{ dir = 'frontend/web-components/reaction-bar';    out = 'static/wc/reaction-bar' }
    @{ dir = 'frontend/web-components/websocket-log';   out = 'static/wc/websocket-log' }
    @{ dir = 'frontend/web-components/chart-circle';    out = 'static/wc/chart-circle' }
    @{ dir = 'frontend/web-components/mermaid';         out = 'static/wc/mermaid' }
    @{ dir = 'frontend/web-components/markdown';        out = 'static/wc/markdown' }
    @{ dir = 'frontend/web-components/model-gallery';   out = 'static/wc/model-gallery' }
    @{ dir = 'frontend/web-components/counter-persist'; out = 'static/wc/counter-persist' }
)

function Invoke-Recipe {
    param(
        [Parameter(Mandatory)][string]$Dir,
        [Parameter(Mandatory)][string]$Out,
        [switch]$Clean
    )
    Push-Location $Dir
    try {
        Write-Host "==> $Dir" -ForegroundColor Cyan
        if ($Clean -and (Test-Path 'node_modules')) {
            Remove-Item -Recurse -Force 'node_modules'
        }
        npm install
        if ($LASTEXITCODE -ne 0) { throw "npm install failed in $Dir (exit $LASTEXITCODE)" }
        npm run build -- --outDir "../../../$Out" --emptyOutDir
        if ($LASTEXITCODE -ne 0) { throw "npm run build failed in $Dir (exit $LASTEXITCODE)" }
    }
    finally {
        Pop-Location
    }
}

function Invoke-Lint {
    param([Parameter(Mandatory)][string]$Dir)
    Push-Location $Dir
    try {
        Write-Host "==> lint $Dir" -ForegroundColor Cyan
        npm run lint
        if ($LASTEXITCODE -ne 0) { throw "npm run lint failed in $Dir (exit $LASTEXITCODE)" }
    }
    finally {
        Pop-Location
    }
}

function Invoke-BuildAll {
    foreach ($i in $script:apps + $script:wcs) {
        Invoke-Recipe -Dir $i.dir -Out $i.out
    }
}

function Show-Help {
    Write-Host "make - Windows mirror of the Makefile (via make.bat -> make.ps1)`n"
    Write-Host "Targets:"
    Write-Host "  build              Build every app and web component"
    Write-Host "  build-app-<name>   Build a single app (e.g. build-app-main)"
    Write-Host "  build-wc-<name>    Build a single web component"
    Write-Host "  lint               npm run lint across the older subset"
    Write-Host "  clean-build        Wipe node_modules + reinstall + rebuild (older subset)"
    Write-Host "  dev                npm run dev in frontend/applications/main"
    Write-Host "  run                build, then ./wippy.exe run -c"
    Write-Host "  help               Show this message`n"
    Write-Host "Apps:           $($apps.name -join ', ')"
    Write-Host "Web components: $($wcs.name -join ', ')"
}

# Top-level dispatch wrapped in try/catch so a thrown error surfaces as a
# single clean red line + exit 1, instead of PowerShell's default 5-line
# stack trace. `finally` blocks inside the recipe helpers still run via
# normal exception unwinding before control reaches this catch.
try {
    switch -Regex ($Target) {
        '^help$|^-h$|^--help$' {
            Show-Help
            break
        }
        '^build$' {
            Invoke-BuildAll
            break
        }
        '^build-app-(.+)$' {
            $name = $Matches[1]
            $item = $apps | Where-Object { $_.name -eq $name }
            if (-not $item) { throw "Unknown app: $name. Run 'make help' for the list." }
            Invoke-Recipe -Dir $item.dir -Out $item.out
            break
        }
        '^build-wc-(.+)$' {
            $name = $Matches[1]
            $item = $wcs | Where-Object { $_.name -eq $name }
            if (-not $item) { throw "Unknown web component: $name. Run 'make help' for the list." }
            Invoke-Recipe -Dir $item.dir -Out $item.out
            break
        }
        '^lint$' {
            foreach ($d in $lintDirs) { Invoke-Lint -Dir $d }
            break
        }
        '^clean-build$' {
            foreach ($i in $cleanBuildItems) { Invoke-Recipe -Dir $i.dir -Out $i.out -Clean }
            break
        }
        '^dev$' {
            Push-Location 'frontend/applications/main'
            try {
                npm run dev
            }
            finally {
                Pop-Location
            }
            break
        }
        '^run$' {
            Invoke-BuildAll
            & "$PSScriptRoot/wippy.exe" run -c
            break
        }
        default {
            throw "Unknown target: $Target. Run 'make help' for the list."
        }
    }
}
catch {
    Write-Host $_.Exception.Message -ForegroundColor Red
    exit 1
}
