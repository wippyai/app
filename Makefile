.PHONY: build clean-build dev run lint build-app-main build-app-iframe-demo build-wc-reaction-bar build-wc-websocket-log build-wc-chart-circle build-wc-mermaid build-wc-markdown build-wc-model-gallery build-wc-counter-persist

build: build-app-main build-app-iframe-demo build-wc-reaction-bar build-wc-websocket-log build-wc-chart-circle build-wc-mermaid build-wc-markdown build-wc-model-gallery build-wc-counter-persist

build-app-main:
	cd frontend/applications/main && npm install && npm run build -- --outDir ../../../static/app/main --emptyOutDir

build-app-iframe-demo:
	cd frontend/applications/iframe-demo && npm install && npm run build -- --outDir ../../../static/app/iframe-demo --emptyOutDir

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

lint:
	cd frontend/applications/main && npm run lint
	cd frontend/web-components/reaction-bar && npm run lint
	cd frontend/web-components/websocket-log && npm run lint
	cd frontend/web-components/chart-circle && npm run lint
	cd frontend/web-components/mermaid && npm run lint
	cd frontend/web-components/markdown && npm run lint
	cd frontend/web-components/model-gallery && npm run lint
	cd frontend/web-components/counter-persist && npm run lint

clean-build:
	cd frontend/applications/main && rm -rf node_modules && npm install && npm run build -- --outDir ../../../static/app/main --emptyOutDir
	cd frontend/web-components/reaction-bar && rm -rf node_modules && npm install && npm run build -- --outDir ../../../static/wc/reaction-bar --emptyOutDir
	cd frontend/web-components/websocket-log && rm -rf node_modules && npm install && npm run build -- --outDir ../../../static/wc/websocket-log --emptyOutDir
	cd frontend/web-components/chart-circle && rm -rf node_modules && npm install && npm run build -- --outDir ../../../static/wc/chart-circle --emptyOutDir
	cd frontend/web-components/mermaid && rm -rf node_modules && npm install && npm run build -- --outDir ../../../static/wc/mermaid --emptyOutDir
	cd frontend/web-components/markdown && rm -rf node_modules && npm install && npm run build -- --outDir ../../../static/wc/markdown --emptyOutDir
	cd frontend/web-components/model-gallery && rm -rf node_modules && npm install && npm run build -- --outDir ../../../static/wc/model-gallery --emptyOutDir
	cd frontend/web-components/counter-persist && rm -rf node_modules && npm install && npm run build -- --outDir ../../../static/wc/counter-persist --emptyOutDir

dev:
	cd frontend/applications/main && npm run dev

run: build
	./wippy run -c
