# Vendored @wippy-fe/layout

Build output of `@wippy-fe/layout` 0.0.68 with a local patch: a nested `PanelTree` takes an optional `size`.
Remove this folder and use the published package when the patch is released.

- Repository: `C:/Projects/gen-2-chat` (Wippy Web Host)
- Branch: `feat/layout-tree-size` (not pushed), cut from `origin/webcomponents` at `1e92ea1e`
- Commit: `252942387a3dcb5b303eec7e3c6f67123878a5ae`
- Package: `npm/@wippy-fe--layout`

Build commands, run at the repository root:

```
pnpm install --frozen-lockfile
pnpm build:npm:shared
pnpm build:npm:layout
```

This folder holds the contents of `npm/@wippy-fe--layout/dist` (no `dist` level, because `frontend/**/dist/` is gitignored).

Use notes:

- `index.js` imports `vue` and `nanoevents` as bare specifiers, and begins with `import './style.css'`. Bundle it with a bundler that resolves both, and add `style.css` to the shadow root.
- `@wippy-fe/shared` is used for types only. It is not needed at run time.
- `size` on a nested tree: `Nfr`, `Npx`, `N%` or `auto`. `Npx` and `N%` fix the tree (no grow, no shrink). A tree without `size` is unchanged. See the package README, section "Sizing a nested tree".
