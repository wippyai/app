.PHONY: build clean-build dev run lint \
  build-app-main build-app-iframe-demo \
  build-app-dam-gallery build-app-dam-list build-app-dam-detail build-app-dam-settings build-app-dam-side-history \
  build-wc-reaction-bar build-wc-websocket-log build-wc-chart-circle build-wc-mermaid build-wc-markdown build-wc-model-gallery build-wc-counter-persist \
  build-wc-dam-header build-wc-dam-subheader build-wc-dam-filterbar build-wc-dam-toolbar build-wc-dam-footer \
  build-wc-dam-tools-flap build-wc-dam-details-flap build-wc-dam-coordinator build-wc-dam-upload-modal-body

build: build-app-main build-app-iframe-demo \
       build-app-dam-gallery build-app-dam-list build-app-dam-detail build-app-dam-settings build-app-dam-side-history \
       build-wc-reaction-bar build-wc-websocket-log build-wc-chart-circle build-wc-mermaid build-wc-markdown build-wc-model-gallery build-wc-counter-persist \
       build-wc-dam-header build-wc-dam-subheader build-wc-dam-filterbar build-wc-dam-toolbar build-wc-dam-footer \
       build-wc-dam-tools-flap build-wc-dam-details-flap build-wc-dam-coordinator build-wc-dam-upload-modal-body

build-app-main:
	cd frontend/applications/main && npm install && npm run build -- --outDir ../../../static/app/main --emptyOutDir

build-app-iframe-demo:
	cd frontend/applications/iframe-demo && npm install && npm run build -- --outDir ../../../static/app/iframe-demo --emptyOutDir

build-app-dam-gallery:
	cd frontend/applications/dam-gallery && npm install && npm run build -- --outDir ../../../static/app/dam-gallery --emptyOutDir

build-app-dam-list:
	cd frontend/applications/dam-list && npm install && npm run build -- --outDir ../../../static/app/dam-list --emptyOutDir

build-app-dam-detail:
	cd frontend/applications/dam-detail && npm install && npm run build -- --outDir ../../../static/app/dam-detail --emptyOutDir

build-app-dam-settings:
	cd frontend/applications/dam-settings && npm install && npm run build -- --outDir ../../../static/app/dam-settings --emptyOutDir

build-app-dam-side-history:
	cd frontend/applications/dam-side-history && npm install && npm run build -- --outDir ../../../static/app/dam-side-history --emptyOutDir

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

build-wc-dam-header:
	cd frontend/web-components/dam-header && npm install && npm run build -- --outDir ../../../static/wc/dam-header --emptyOutDir

build-wc-dam-subheader:
	cd frontend/web-components/dam-subheader && npm install && npm run build -- --outDir ../../../static/wc/dam-subheader --emptyOutDir

build-wc-dam-filterbar:
	cd frontend/web-components/dam-filterbar && npm install && npm run build -- --outDir ../../../static/wc/dam-filterbar --emptyOutDir

build-wc-dam-toolbar:
	cd frontend/web-components/dam-toolbar && npm install && npm run build -- --outDir ../../../static/wc/dam-toolbar --emptyOutDir

build-wc-dam-footer:
	cd frontend/web-components/dam-footer && npm install && npm run build -- --outDir ../../../static/wc/dam-footer --emptyOutDir

build-wc-dam-tools-flap:
	cd frontend/web-components/dam-tools-flap && npm install && npm run build -- --outDir ../../../static/wc/dam-tools-flap --emptyOutDir

build-wc-dam-details-flap:
	cd frontend/web-components/dam-details-flap && npm install && npm run build -- --outDir ../../../static/wc/dam-details-flap --emptyOutDir

build-wc-dam-coordinator:
	cd frontend/web-components/dam-coordinator && npm install && npm run build -- --outDir ../../../static/wc/dam-coordinator --emptyOutDir

build-wc-dam-upload-modal-body:
	cd frontend/web-components/dam-upload-modal-body && npm install && npm run build -- --outDir ../../../static/wc/dam-upload-modal-body --emptyOutDir

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
