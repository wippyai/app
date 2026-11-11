# dash-tile-helper

Shared helper of the dashboard tiles (protocol `tile_v1`, see `docs/dashboards-poc/contracts.md`, sections 6 to 9).
It reads the tile's data, follows slow results, reacts to live signals, runs actions and reports `render-state`.
A tile only renders.

The package is TypeScript source. A tile package depends on it with `"@example/dash-tile-helper": "file:../../packages/dash-tile-helper"`
and lists `vue` and `@wippy-fe/proxy` as Rollup externals. It has no build target. Run its tests with `npm test`.

## Write a tile

1. Add `src/<tag>.ts` to the tile package: a `WippyVueElement` subclass with `propsSchema: tilePropsSchema` and one
   `define(import.meta.url, ...)`. Add the entry to `build.lib.entry` in `vite.config.ts`.
2. In the root component call the composable (in `dash-tiles` it is `useDashTile()`, which passes `useProps()` and `useEvents()`).
3. Draw from `tile.data('main')` (null until the input can be drawn). Read field names with `tile.fieldName('x')`.
4. Pass `validate` when a ready value can still be unusable: `useDashTile({ main: (data, config) => TileError | null })`.
5. For actions call `await tile.runAction('name', { ...tileArgs }, { confirmMessage: 'Question?' })`. When the action declares `confirm: true`, the helper asks the Host first (`host.confirm()` of `@wippy-fe/proxy`). Put `<TileConfirm :request="confirmRequest" @answer="answerConfirm" />` in the template (`const { confirmRequest, answerConfirm } = tile`) as the fallback dialog for a runtime that has no `host.confirm`.
   For a declared event call `tile.emitTileEvent('change', { value })`.
6. Add a `view.component` entry and a `wippy.dashboards.tile` descriptor in `src/dashboards/components/_index.yaml`.

The helper never shows a zero or an old value as `ready`: HTTP 5xx, network failure and `failed` become `error`, HTTP 403 becomes `denied`.
