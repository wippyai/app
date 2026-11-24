.PHONY: build clean-build dev run run-dev run-e2e prepare-e2e lint lint-lua verify test-attention test-attention-touch test-attention-helpers build-app-main build-app-iframe-demo build-app-session-forms-demo build-wc-reaction-bar build-wc-websocket-log build-wc-chart-circle build-wc-mermaid build-wc-markdown build-wc-model-gallery build-wc-counter-persist tile-helper test-pkg-app-nav build-wc-run-timeline build-wc-user-status build-wc-fixture-tiles

# Use NPM_INSTALL=true after installing local release packages for a smoke build.
NPM_INSTALL ?= npm install
WIPPY_ARGS ?=

prepare-e2e:
	node e2e/prepare-runtime.mjs

run-e2e: build
	node e2e/prepare-runtime.mjs
	cd .local/e2e-runtime-tmp && wippy run -c $(WIPPY_ARGS)

test-attention:
	npm run test:e2e:attention -- --project=chromium --max-failures=1 --output=.local/test-results/attention-tmp

test-attention-touch:
	npm run test:e2e:attention -- --project=chromium-touch --max-failures=1 --output=.local/test-results/attention-tmp

test-attention-helpers:
	npm run test:e2e -- attention-context-helpers.spec.ts --project=chromium --max-failures=1 --output=.local/test-results/attention-helpers-tmp

# The demo plugin tiles (run-timeline, user-status) build against
# @wippy/dashboards-tile-helper, which the wippy/dashboards module ships as a
# build-time npm package (artifact wippy.dashboards:tile_helper_fs). tile-helper
# materializes it into each tile's .wippy/npm, which the tile's package.json
# lists as an npm workspace. The tiles must match the engine that runs, so the
# .wapp it reads is, in this order:
#   1. DASHBOARDS_WAPP, when set;
#   2. a module checkout, packed with its `make pack`: DASHBOARDS_DIR when set,
#      else the wippy/dashboards replacement in .wippy.workspace.yaml, if any
#      (a plain, "double" or 'single' quoted path; escaped quotes inside it are
#      not supported);
#   3. the installed module in .wippy/vendor/wippy (after `wippy install`), at
#      the version wippy.lock names.
WIPPY ?= wippy
DASHBOARDS_DIR ?=
DASHBOARDS_WAPP ?=
TILE_HELPER_CONSUMERS := run-timeline user-status fixture-tiles

tile-helper:
	@set -e; wapp="$(DASHBOARDS_WAPP)"; dir="$(DASHBOARDS_DIR)"; \
	if [ -z "$$wapp" ] && [ -z "$$dir" ] && [ -f .wippy.workspace.yaml ]; then \
	  dir=$$(sed -n 's/^ *wippy\/dashboards: *//p' .wippy.workspace.yaml | tr -d '\r' | head -1 | sed -e 's/^"\([^"]*\)".*$$/\1/;t' -e "s/^'\([^']*\)'.*$$/\1/;t" -e 's/[[:space:]][[:space:]]*#.*$$//;s/[[:space:]]*$$//'); \
	fi; \
	if [ -z "$$wapp" ] && [ -n "$$dir" ]; then \
	  test -f "$$dir/wippy.yaml" || { echo "no wippy/dashboards checkout at $$dir" >&2; exit 1; }; \
	  $(MAKE) -C "$$dir" pack WIPPY="$(WIPPY)"; wapp="$$dir/.wippy/dist/dashboards.wapp"; \
	fi; \
	if [ -z "$$wapp" ]; then \
	  ver=$$(sed -n '/- name: wippy\/dashboards *$$/{n;s/^ *version: *//p;}' wippy.lock | tr -d '\r'); \
	  if [ -n "$$ver" ] && [ -f ".wippy/vendor/wippy/dashboards-$$ver.wapp" ]; then wapp=".wippy/vendor/wippy/dashboards-$$ver.wapp"; fi; \
	fi; \
	test -n "$$wapp" || { echo "no wippy/dashboards .wapp: set DASHBOARDS_WAPP or DASHBOARDS_DIR, or run wippy install" >&2; exit 1; }; \
	for t in $(TILE_HELPER_CONSUMERS); do \
	  $(WIPPY) artifacts materialize "$$wapp" wippy.dashboards:tile_helper_fs --root frontend/web-components/$$t/.wippy; \
	done

# Headless TypeScript packages under frontend/packages: install, typecheck, unit tests.
test-pkg-app-nav:
	cd frontend/packages/app-nav && $(NPM_INSTALL) && npm run typecheck && npm test

build: build-app-main build-app-iframe-demo build-app-session-forms-demo build-wc-reaction-bar build-wc-websocket-log build-wc-chart-circle build-wc-mermaid build-wc-markdown build-wc-model-gallery build-wc-counter-persist build-wc-run-timeline build-wc-user-status build-wc-fixture-tiles

build-app-main:
	cd frontend/applications/main && $(NPM_INSTALL) && npm run build -- --outDir ../../../static/app/main --emptyOutDir

build-app-iframe-demo:
	cd frontend/applications/iframe-demo && $(NPM_INSTALL) && npm run build -- --outDir ../../../static/app/iframe-demo --emptyOutDir

build-app-session-forms-demo:
	cd frontend/applications/session-forms-demo && $(NPM_INSTALL) && npm run build -- --outDir ../../../static/app/session-forms-demo --emptyOutDir

build-wc-reaction-bar:
	cd frontend/web-components/reaction-bar && $(NPM_INSTALL) && npm run build -- --outDir ../../../static/wc/reaction-bar --emptyOutDir

build-wc-websocket-log:
	cd frontend/web-components/websocket-log && $(NPM_INSTALL) && npm run build -- --outDir ../../../static/wc/websocket-log --emptyOutDir

build-wc-chart-circle:
	cd frontend/web-components/chart-circle && $(NPM_INSTALL) && npm run build -- --outDir ../../../static/wc/chart-circle --emptyOutDir

build-wc-mermaid:
	cd frontend/web-components/mermaid && $(NPM_INSTALL) && npm run build -- --outDir ../../../static/wc/mermaid --emptyOutDir

build-wc-markdown:
	cd frontend/web-components/markdown && $(NPM_INSTALL) && npm run build -- --outDir ../../../static/wc/markdown --emptyOutDir

build-wc-model-gallery:
	cd frontend/web-components/model-gallery && $(NPM_INSTALL) && npm run build -- --outDir ../../../static/wc/model-gallery --emptyOutDir

build-wc-counter-persist:
	cd frontend/web-components/counter-persist && $(NPM_INSTALL) && npm run build -- --outDir ../../../static/wc/counter-persist --emptyOutDir

build-wc-run-timeline: tile-helper
	cd frontend/web-components/run-timeline && $(NPM_INSTALL) && npm run build -- --outDir ../../../static/wc/run-timeline --emptyOutDir

build-wc-user-status: tile-helper
	cd frontend/web-components/user-status && $(NPM_INSTALL) && npm run build -- --outDir ../../../static/wc/user-status --emptyOutDir

# Fixture tiles of the RC1 browser specs (dashboards-layout, -states, -artifact).
build-wc-fixture-tiles: tile-helper
	cd frontend/web-components/fixture-tiles && $(NPM_INSTALL) && npm run build -- --outDir ../../../static/wc/fixture-tiles --emptyOutDir

# Lint in eslintrc mode: a flat config in a parent directory (such as the Web
# Host checkout) would otherwise reject --ext.
lint: export ESLINT_USE_FLAT_CONFIG := false
lint: tile-helper
	cd frontend/applications/main && npm run lint
	cd frontend/applications/session-forms-demo && npm run lint
	cd frontend/packages/app-nav && $(NPM_INSTALL) && npm run lint
	cd frontend/web-components/reaction-bar && npm run lint
	cd frontend/web-components/websocket-log && npm run lint
	cd frontend/web-components/chart-circle && npm run lint
	cd frontend/web-components/mermaid && npm run lint
	cd frontend/web-components/markdown && npm run lint
	cd frontend/web-components/model-gallery && npm run lint
	cd frontend/web-components/counter-persist && npm run lint
	cd frontend/web-components/run-timeline && npm run lint
	cd frontend/web-components/user-status && npm run lint
	cd frontend/web-components/fixture-tiles && npm run lint

# Frontend build and lint for every app and web component, then the Lua lint for
# this app's own namespaces (`app`, `app.*`) and the demo seed. The CI lint stage covers the whole
# workspace, which also reports errors in the vendored keeper module that this
# repo does not own. Needs `wippy` on PATH; make.ps1 has the Windows fallback.
# The second wippy lint run selects the fixtures profile, because .wippy.yaml
# removes that namespace from a release.
verify: build lint
	$(MAKE) lint-lua

lint-lua:
	$(WIPPY) lint --level error --ns 'app,app.*,demo.seed' $(WIPPY_ARGS)
	$(WIPPY) lint --level error --ns 'app,app.*,demo.seed' $(WIPPY_ARGS) --profile session-forms-fixtures

clean-build: tile-helper
	cd frontend/applications/main && rm -rf node_modules package-lock.json && npm install && npm run build -- --outDir ../../../static/app/main --emptyOutDir
	cd frontend/applications/iframe-demo && rm -rf node_modules package-lock.json && npm install && npm run build -- --outDir ../../../static/app/iframe-demo --emptyOutDir
	cd frontend/applications/session-forms-demo && rm -rf node_modules package-lock.json && npm install && npm run build -- --outDir ../../../static/app/session-forms-demo --emptyOutDir
	cd frontend/web-components/reaction-bar && rm -rf node_modules package-lock.json && npm install && npm run build -- --outDir ../../../static/wc/reaction-bar --emptyOutDir
	cd frontend/web-components/websocket-log && rm -rf node_modules package-lock.json && npm install && npm run build -- --outDir ../../../static/wc/websocket-log --emptyOutDir
	cd frontend/web-components/chart-circle && rm -rf node_modules package-lock.json && npm install && npm run build -- --outDir ../../../static/wc/chart-circle --emptyOutDir
	cd frontend/web-components/mermaid && rm -rf node_modules package-lock.json && npm install && npm run build -- --outDir ../../../static/wc/mermaid --emptyOutDir
	cd frontend/web-components/markdown && rm -rf node_modules package-lock.json && npm install && npm run build -- --outDir ../../../static/wc/markdown --emptyOutDir
	cd frontend/web-components/model-gallery && rm -rf node_modules package-lock.json && npm install && npm run build -- --outDir ../../../static/wc/model-gallery --emptyOutDir
	cd frontend/web-components/counter-persist && rm -rf node_modules package-lock.json && npm install && npm run build -- --outDir ../../../static/wc/counter-persist --emptyOutDir
	cd frontend/web-components/run-timeline && rm -rf node_modules package-lock.json && npm install && npm run build -- --outDir ../../../static/wc/run-timeline --emptyOutDir
	cd frontend/web-components/user-status && rm -rf node_modules package-lock.json && npm install && npm run build -- --outDir ../../../static/wc/user-status --emptyOutDir

dev:
	cd frontend/applications/main && npm run dev

run: build
	wippy run -c

run-dev: build
	node scripts/run-dev.mjs
