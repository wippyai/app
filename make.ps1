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
    [string]$Target = 'help',
    [switch]$SkipInstall,
    # Source of the tile helper (see tile-helper): a wippy/dashboards .wapp, or
    # a checkout of the module. Default to $env:DASHBOARDS_WAPP and
    # $env:DASHBOARDS_DIR, then to the replacement in .wippy.workspace.yaml,
    # then to the installed module at the locked version.
    [string]$DashboardsWapp = '',
    [string]$DashboardsDir = '',
    [Parameter(ValueFromRemainingArguments = $true)]
    [string[]]$RuntimeArguments = @()
)

$ErrorActionPreference = 'Stop'
Set-Location $PSScriptRoot

# (name, dir, out) tuples - single source of truth for every build-app-* /
# build-wc-* target. Keep in sync with the Makefile when adding apps.
$apps = @(
    @{ name = 'main';               dir = 'frontend/applications/main';               out = 'static/app/main' }
    @{ name = 'iframe-demo';        dir = 'frontend/applications/iframe-demo';        out = 'static/app/iframe-demo' }
    @{ name = 'session-forms-demo'; dir = 'frontend/applications/session-forms-demo'; out = 'static/app/session-forms-demo' }
)

$wcs = @(
    @{ name = 'reaction-bar';    dir = 'frontend/web-components/reaction-bar';    out = 'static/wc/reaction-bar' }
    @{ name = 'websocket-log';   dir = 'frontend/web-components/websocket-log';   out = 'static/wc/websocket-log' }
    @{ name = 'chart-circle';    dir = 'frontend/web-components/chart-circle';    out = 'static/wc/chart-circle' }
    @{ name = 'mermaid';         dir = 'frontend/web-components/mermaid';         out = 'static/wc/mermaid' }
    @{ name = 'markdown';        dir = 'frontend/web-components/markdown';        out = 'static/wc/markdown' }
    @{ name = 'model-gallery';   dir = 'frontend/web-components/model-gallery';   out = 'static/wc/model-gallery' }
    @{ name = 'counter-persist'; dir = 'frontend/web-components/counter-persist'; out = 'static/wc/counter-persist' }
    @{ name = 'run-timeline'; dir = 'frontend/web-components/run-timeline'; out = 'static/wc/run-timeline'; tileHelper = $true }
    @{ name = 'user-status'; dir = 'frontend/web-components/user-status'; out = 'static/wc/user-status'; tileHelper = $true }
)

# Headless TypeScript packages with a test-pkg-<name> target (install,
# typecheck, unit tests). Mirrors the Makefile's test-pkg-* recipes.
$pkgs = @(
    @{ name = 'app-nav'; dir = 'frontend/packages/app-nav' }
)

# Subset that runs `npm run lint` - mirrors Makefile's `lint:` recipe.
$lintDirs = @(
    'frontend/applications/main'
    'frontend/applications/session-forms-demo'
    'frontend/packages/app-nav'
    'frontend/web-components/reaction-bar'
    'frontend/web-components/websocket-log'
    'frontend/web-components/chart-circle'
    'frontend/web-components/mermaid'
    'frontend/web-components/markdown'
    'frontend/web-components/model-gallery'
    'frontend/web-components/counter-persist'
    'frontend/web-components/run-timeline'
    'frontend/web-components/user-status'
)

# Mirrors the Makefile's tile-helper: materializes @wippy/dashboards-tile-helper
# (artifact wippy.dashboards:tile_helper_fs) into each demo tile's .wippy/npm,
# which the tile's package.json lists as an npm workspace. The tiles must match
# the engine that runs, so the .wapp comes from -DashboardsWapp, else a module
# checkout packed with its make.bat pack (-DashboardsDir, else the
# wippy/dashboards replacement in .wippy.workspace.yaml), else the installed
# module in .wippy/vendor/wippy at the version that wippy.lock names.
$script:tileHelperDone = $false
function Invoke-TileHelper {
    # One materialize per make.bat call serves every demo tile.
    if ($script:tileHelperDone) { return }
    $wippy = Resolve-WippyBinary
    # A file path (./wippy.exe or a relative $env:WIPPY) must survive the
    # module's make.bat, which runs pack from its own test folder.
    if (Test-Path $wippy -PathType Leaf) { $wippy = (Resolve-Path $wippy).Path }
    $wapp = $script:DashboardsWapp
    if (-not $wapp) { $wapp = $env:DASHBOARDS_WAPP }
    if (-not $wapp) {
        $dir = $script:DashboardsDir
        if (-not $dir) { $dir = $env:DASHBOARDS_DIR }
        if (-not $dir -and (Test-Path '.wippy.workspace.yaml')) {
            $line = Select-String -Path '.wippy.workspace.yaml' -Pattern '^\s*wippy/dashboards:\s*(.+)$' | Select-Object -First 1
            if ($line) {
                # A YAML scalar: a quoted value ends at its closing quote; an
                # unquoted one ends before an inline comment. Inner spaces stay.
                $value = $line.Matches[0].Groups[1].Value.Trim()
                if ($value -match '^"([^"]*)"' -or $value -match "^'([^']*)'") { $dir = $Matches[1] }
                else { $dir = ($value -replace '\s+#.*$', '').Trim() }
            }
        }
        if ($dir) {
            if (-not (Test-Path (Join-Path $dir 'wippy.yaml'))) { throw "no wippy/dashboards checkout at $dir" }
            $previousWippyBin = $env:WIPPY_BIN
            $env:WIPPY_BIN = $wippy
            try { & (Join-Path $dir 'make.bat') pack }
            finally { $env:WIPPY_BIN = $previousWippyBin }
            if ($LASTEXITCODE -ne 0) { throw "make.bat pack failed in $dir (exit $LASTEXITCODE)" }
            $wapp = Join-Path $dir '.wippy/dist/dashboards.wapp'
        }
    }
    if (-not $wapp -and (Test-Path 'wippy.lock')) {
        $lock = Get-Content 'wippy.lock' -Raw
        if ($lock -match '(?m)-\s*name:\s*wippy/dashboards\s*\r?\n\s*version:\s*(\S+)') {
            $installed = ".wippy/vendor/wippy/dashboards-$($Matches[1]).wapp"
            if (Test-Path $installed) { $wapp = (Resolve-Path $installed).Path }
        }
    }
    if (-not $wapp) { throw 'no wippy/dashboards .wapp: pass -DashboardsWapp or -DashboardsDir, or run wippy install' }
    foreach ($t in ($script:wcs | Where-Object { $_.tileHelper })) {
        & $wippy artifacts materialize $wapp wippy.dashboards:tile_helper_fs --root "$($t.dir)/.wippy"
        if ($LASTEXITCODE -ne 0) { throw "materializing the tile helper into $($t.dir) failed (exit $LASTEXITCODE)" }
    }
    $script:tileHelperDone = $true
}

function Invoke-Recipe {
    param(
        [Parameter(Mandatory)][string]$Dir,
        [Parameter(Mandatory)][string]$Out,
        [switch]$Clean
    )
    if (($script:wcs | Where-Object { $_.dir -eq $Dir -and $_.tileHelper })) { Invoke-TileHelper }
    Push-Location $Dir
    try {
        Write-Host "==> $Dir" -ForegroundColor Cyan
        # Clean = wipe both node_modules AND package-lock.json. Removing the
        # lockfile is what makes a "clean reinstall" actually clean: a stale
        # lockfile from before a @wippy-fe/* version bump pins the resolver
        # to the OLD versions (npm ERESOLVE) even when package.json now asks
        # for the new range.
        if ($Clean) {
            if (Test-Path 'node_modules') { Remove-Item -Recurse -Force 'node_modules' }
            if (Test-Path 'package-lock.json') { Remove-Item -Force 'package-lock.json' }
        }
        if ($Clean -or -not $SkipInstall) {
            npm install
            if ($LASTEXITCODE -ne 0) { throw "npm install failed in $Dir (exit $LASTEXITCODE)" }
        }
        else {
            Write-Host 'Using installed dependencies for local package smoke'
        }
        npm run build -- --outDir "../../../$Out" --emptyOutDir
        if ($LASTEXITCODE -ne 0) { throw "npm run build failed in $Dir (exit $LASTEXITCODE)" }
    }
    finally {
        Pop-Location
    }
}

function Invoke-Lint {
    param([Parameter(Mandatory)][string]$Dir)
    $hadFlatConfigSetting = Test-Path 'Env:ESLINT_USE_FLAT_CONFIG'
    $previousFlatConfigSetting = $env:ESLINT_USE_FLAT_CONFIG
    Push-Location $Dir
    try {
        Write-Host "==> lint $Dir" -ForegroundColor Cyan
        # No build installs a headless package, so its lint installs it first
        # (the Makefile's lint does the same for these packages).
        if (($script:pkgs | Where-Object { $_.dir -eq $Dir }) -and -not $SkipInstall) {
            npm install
            if ($LASTEXITCODE -ne 0) { throw "npm install failed in $Dir (exit $LASTEXITCODE)" }
        }
        # Lint in eslintrc mode, as the Makefile does (see the comment there).
        $env:ESLINT_USE_FLAT_CONFIG = 'false'
        npm run lint
        if ($LASTEXITCODE -ne 0) { throw "npm run lint failed in $Dir (exit $LASTEXITCODE)" }
    }
    finally {
        if ($hadFlatConfigSetting) {
            $env:ESLINT_USE_FLAT_CONFIG = $previousFlatConfigSetting
        }
        else {
            Remove-Item 'Env:ESLINT_USE_FLAT_CONFIG' -ErrorAction SilentlyContinue
        }
        Pop-Location
    }
}

function Invoke-PackageTest {
    param([Parameter(Mandatory)][string]$Dir)
    Push-Location $Dir
    try {
        Write-Host "==> test $Dir" -ForegroundColor Cyan
        if (-not $SkipInstall) {
            npm install
            if ($LASTEXITCODE -ne 0) { throw "npm install failed in $Dir (exit $LASTEXITCODE)" }
        }
        npm run typecheck
        if ($LASTEXITCODE -ne 0) { throw "npm run typecheck failed in $Dir (exit $LASTEXITCODE)" }
        npm test
        if ($LASTEXITCODE -ne 0) { throw "npm test failed in $Dir (exit $LASTEXITCODE)" }
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

# Same lookup as resolveWippyBinary() in scripts/run-dev.mjs: $env:WIPPY, then
# ./wippy.exe, then wippy on PATH.
function Resolve-WippyBinary {
    if ($env:WIPPY) { return $env:WIPPY }
    if (Test-Path './wippy.exe') { return './wippy.exe' }
    return 'wippy'
}

function Invoke-WippyLint {
    $wippyBin = Resolve-WippyBinary
    # Two runs, as in the Makefile. See the comment there.
    foreach ($profileArgs in @(@(), @('--profile', 'session-forms-fixtures'))) {
        Write-Host "==> $wippyBin lint --level error --ns app,app.* $profileArgs" -ForegroundColor Cyan
        & $wippyBin lint --level error --ns 'app,app.*' @profileArgs
        if ($LASTEXITCODE -ne 0) { throw "wippy lint failed (exit $LASTEXITCODE)" }
    }
}

function Show-Help {
    Write-Host "make - Windows mirror of the Makefile (via make.bat -> make.ps1)`n"
    Write-Host "Targets:"
    Write-Host "  build              Build every app and web component"
    Write-Host "  build -SkipInstall Build against installed local release packages"
    Write-Host "  build-app-<name>   Build a single app (e.g. build-app-main)"
    Write-Host "  build-wc-<name>    Build a single web component"
    Write-Host "  lint               npm run lint across every package"
    Write-Host "  tile-helper        Materialize the wippy/dashboards tile helper into the demo tiles"
    Write-Host "                     (-DashboardsWapp <file> or -DashboardsDir <checkout>)"
    Write-Host "  test-pkg-<name>    Typecheck and unit-test a package (e.g. test-pkg-app-nav)"
    Write-Host "  verify             build + lint + wippy lint --level error for app, app.*"
    Write-Host "  test-attention     Run Attention acceptance in Chromium"
    Write-Host "  test-attention-touch Run Attention touch acceptance in Chromium"
    Write-Host "  test-attention-helpers Run Attention codec and helper checks"
    Write-Host "  clean-build        Wipe node_modules + reinstall + rebuild"
    Write-Host "  dev                npm run dev in frontend/applications/main"
    Write-Host "  run                build, then ./wippy.exe run -c"
    Write-Host "  run-dev            build, then node scripts/run-dev.mjs (generic local launcher)"
    Write-Host "  prepare-e2e        Prepare an isolated app with test agents"
    Write-Host "  run-e2e            build, prepare-e2e, then run the isolated app"
    Write-Host "  help               Show this message`n"
    Write-Host "Apps:           $($apps.name -join ', ')"
    Write-Host "Web components: $($wcs.name -join ', ')"
    Write-Host "Packages:       $($pkgs.name -join ', ')"
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
        '^test-pkg-(.+)$' {
            $name = $Matches[1]
            $item = $pkgs | Where-Object { $_.name -eq $name }
            if (-not $item) { throw "Unknown package: $name. Run 'make help' for the list." }
            Invoke-PackageTest -Dir $item.dir
            break
        }
        '^lint$' {
            Invoke-TileHelper
            foreach ($d in $lintDirs) { Invoke-Lint -Dir $d }
            break
        }
        '^tile-helper$' {
            Invoke-TileHelper
            break
        }
        '^verify$' {
            # Same steps as the Makefile's verify target.
            Invoke-BuildAll
            foreach ($d in $lintDirs) { Invoke-Lint -Dir $d }
            Invoke-WippyLint
            break
        }
        '^test-attention$' {
            npm run test:e2e:attention -- --project=chromium --max-failures=1 --output=.local/test-results/attention-tmp
            if ($LASTEXITCODE -ne 0) { throw "Attention tests failed (exit $LASTEXITCODE)" }
            break
        }
        '^test-attention-touch$' {
            npm run test:e2e:attention -- --project=chromium-touch --max-failures=1 --output=.local/test-results/attention-tmp
            if ($LASTEXITCODE -ne 0) { throw "Attention touch tests failed (exit $LASTEXITCODE)" }
            break
        }
        '^test-attention-helpers$' {
            npm run test:e2e -- attention-context-helpers.spec.ts --project=chromium --max-failures=1 --output=.local/test-results/attention-helpers-tmp
            if ($LASTEXITCODE -ne 0) { throw "Attention helper tests failed (exit $LASTEXITCODE)" }
            break
        }
        '^clean-build$' {
            # Same set as `build` (every app + web component), wiped clean first so a
            # @wippy-fe/* version bump resolves against fresh node_modules + lockfile.
            foreach ($i in $script:apps + $script:wcs) { Invoke-Recipe -Dir $i.dir -Out $i.out -Clean }
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
            if ($LASTEXITCODE -ne 0) { throw "Wippy run failed (exit $LASTEXITCODE)" }
            break
        }
        '^prepare-e2e$' {
            node "$PSScriptRoot/e2e/prepare-runtime.mjs"
            if ($LASTEXITCODE -ne 0) { throw "Test runtime preparation failed (exit $LASTEXITCODE)" }
            break
        }
        '^run-e2e$' {
            Invoke-BuildAll
            node "$PSScriptRoot/e2e/prepare-runtime.mjs"
            if ($LASTEXITCODE -ne 0) { throw "Test runtime preparation failed (exit $LASTEXITCODE)" }
            Push-Location "$PSScriptRoot/.local/e2e-runtime-tmp"
            try {
                & wippy run -c @RuntimeArguments
                if ($LASTEXITCODE -ne 0) { throw "Wippy test runtime failed (exit $LASTEXITCODE)" }
            }
            finally {
                Pop-Location
            }
            break
        }
        '^run-dev$' {
            Invoke-BuildAll
            node scripts/run-dev.mjs
            if ($LASTEXITCODE -ne 0) { throw "run-dev.mjs failed (exit $LASTEXITCODE)" }
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
