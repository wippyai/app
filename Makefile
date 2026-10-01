.PHONY: build clean-build dev run run-dev lint verify build-app-main build-app-iframe-demo build-app-session-forms-demo build-wc-reaction-bar build-wc-websocket-log build-wc-chart-circle build-wc-mermaid build-wc-markdown build-wc-model-gallery build-wc-counter-persist

build: build-app-main build-app-iframe-demo build-app-session-forms-demo build-wc-reaction-bar build-wc-websocket-log build-wc-chart-circle build-wc-mermaid build-wc-markdown build-wc-model-gallery build-wc-counter-persist

build-app-main:
	cd frontend/applications/main && npm install && npm run build -- --outDir ../../../static/app/main --emptyOutDir

build-app-iframe-demo:
	cd frontend/applications/iframe-demo && npm install && npm run build -- --outDir ../../../static/app/iframe-demo --emptyOutDir

build-app-session-forms-demo:
	cd frontend/applications/session-forms-demo && npm install && npm run build -- --outDir ../../../static/app/session-forms-demo --emptyOutDir

build-wc-reaction-bar:
	cd frontend/web-components/reaction-bar && npm install && npm run build -- --outDir ../../../static/wc/reaction-bar --emptyOutDir

build-wc-websocket-log:
	cd frontend/web-components/websocket-log && npm install && npm run build -- --outDir ../../../static/wc/websocket-log --emptyOutDir

build-wc-chart-circle:
	cd frontend/web-components/chart-circle && npm install && npm run build -- --outDir ../../../static/wc/chart-circle --emptyOutDir

build-wc-mermaid:
	cd frontend/web-components/mermaid && npm install && npm run build -- --outDir ../../../static/wc/mermaid --emptyOutDir

build-wc-markdown:
	cd frontend/web-components/markdown && npm install && npm run build -- --outDir ../../../static/wc/markdown --emptyOutDir

build-wc-model-gallery:
	cd frontend/web-components/model-gallery && npm install && npm run build -- --outDir ../../../static/wc/model-gallery --emptyOutDir

build-wc-counter-persist:
	cd frontend/web-components/counter-persist && npm install && npm run build -- --outDir ../../../static/wc/counter-persist --emptyOutDir

# Every app/web-component here lints via its own classic `.eslintrc.cjs` +
# `eslint ... --ext .ts,.vue` (ESLint 8.x eslintrc mode). `--ext` is rejected
# once ESLint resolves a flat `eslint.config.*` — and ESLint's flat-config
# search walks up the filesystem past this repo's own root. Run from a
# worktree nested under the gen-2-chat Web Host checkout (which has its own
# root `eslint.config.mjs`), that search finds the HOST's unrelated flat
# config and silently switches every app here into flat mode. Forcing
# eslintrc mode here is the documented ESLint escape hatch for exactly this
# ancestor-config collision, scoped to this one target (and anything that
# depends on it, e.g. `verify`) — it does not touch the Host repo.
lint: export ESLINT_USE_FLAT_CONFIG := false
lint:
	cd frontend/applications/main && npm run lint
	cd frontend/applications/session-forms-demo && npm run lint
	cd frontend/web-components/reaction-bar && npm run lint
	cd frontend/web-components/websocket-log && npm run lint
	cd frontend/web-components/chart-circle && npm run lint
	cd frontend/web-components/mermaid && npm run lint
	cd frontend/web-components/markdown && npm run lint
	cd frontend/web-components/model-gallery && npm run lint
	cd frontend/web-components/counter-persist && npm run lint

# Full local verification: frontend build + lint across every app/web
# component, then the same backend Lua lint the GitLab CI "Lint" stage runs
# (.gitlab-ci.yml: `wippy install` + `wippy lint --level error` — `wippy
# install` is a fresh-environment bootstrap step, not re-run here; a local
# checkout already has `.wippy/` populated). Assumes `wippy` is resolvable
# on PATH, matching CI; see make.ps1's Invoke-WippyLint for the Windows
# adapter's WIPPY/local-binary fallback (a worktree has no vendored
# wippy.exe).
verify: build lint
	wippy lint --level error

clean-build:
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

dev:
	cd frontend/applications/main && npm run dev

run: build
	wippy run -c

run-dev: build
	node scripts/run-dev.mjs
