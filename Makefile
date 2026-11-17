.PHONY: tile-helper build clean-build dev run run-e2e prepare-e2e lint test-pkg-app-nav test-attention test-attention-touch test-attention-helpers build-app-main build-app-iframe-demo build-wc-reaction-bar build-wc-websocket-log build-wc-chart-circle build-wc-mermaid build-wc-markdown build-wc-model-gallery build-wc-counter-persist build-wc-run-timeline build-wc-user-status

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
# lists as an npm workspace. The .wapp it reads, in this order:
#   1. DASHBOARDS_WAPP, when set;
#   2. a checkout of the module in DASHBOARDS_DIR (default: a sibling folder),
#      packed with its `make pack` (local development, before publication);
#   3. the installed module in .wippy/vendor/wippy (after `wippy install`), at
#      the version wippy.lock names, so the tiles match the engine that runs.
WIPPY ?= wippy
DASHBOARDS_DIR ?= ../wippy-dashboards
DASHBOARDS_WAPP ?=
TILE_HELPER_CONSUMERS := run-timeline user-status

tile-helper:
	@set -e; wapp="$(DASHBOARDS_WAPP)"; \
	if [ -z "$$wapp" ] && [ -f "$(DASHBOARDS_DIR)/wippy.yaml" ]; then \
	  $(MAKE) -C "$(DASHBOARDS_DIR)" pack WIPPY="$(WIPPY)"; wapp="$(DASHBOARDS_DIR)/.wippy/dist/dashboards.wapp"; \
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

build: build-app-main build-app-iframe-demo build-wc-reaction-bar build-wc-websocket-log build-wc-chart-circle build-wc-mermaid build-wc-markdown build-wc-model-gallery build-wc-counter-persist build-wc-run-timeline build-wc-user-status

build-app-main:
	cd frontend/applications/main && $(NPM_INSTALL) && npm run build -- --outDir ../../../static/app/main --emptyOutDir

build-app-iframe-demo:
	cd frontend/applications/iframe-demo && $(NPM_INSTALL) && npm run build -- --outDir ../../../static/app/iframe-demo --emptyOutDir

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

lint: tile-helper
	cd frontend/applications/main && npm run lint
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

clean-build: tile-helper
	cd frontend/applications/main && rm -rf node_modules package-lock.json && npm install && npm run build -- --outDir ../../../static/app/main --emptyOutDir
	cd frontend/applications/iframe-demo && rm -rf node_modules package-lock.json && npm install && npm run build -- --outDir ../../../static/app/iframe-demo --emptyOutDir
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
