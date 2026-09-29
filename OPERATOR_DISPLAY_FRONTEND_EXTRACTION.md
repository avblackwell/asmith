# Operator Display frontend extraction

Source audit: 2026-09-28. Goal: build an application in a root-level folder outside `app/client/src` whose page layouts follow the corresponding Appsmith pages, while its data and actions use the Java `operator_display` backend. See [Appsmith page layout inventory](APPSMITH_PAGE_LAYOUT_INVENTORY.md) and [backend screen map](ADMIN_SCREENS_BACKEND_MAP.md).

## Decision

Create a separate `operator-display-client/` frontend with its own routes, Redux store, Java clients, and build. Copy or extract the **presentational composition** of the Appsmith page layouts. Vendor the design-system files reachable from the product's actual ADS imports, with their CSS, fonts, icons, and provenance, rather than its entire source package. Keep copyright and license notices with copied source.

Use Redux for application state, with backend-specific slices and async actions. Do not copy Appsmith's full root store, saga registry, API classes, or global Redux state type into the new app. The native editor canvas is a separate compatibility boundary until its widget, drag, property, and evaluation dependencies are extracted. The new frontend must not start Appsmith authentication, workspace, template, settings, or Git requests.

This is a staged extraction, not a claim that copying JSX alone makes a stock Appsmith page functional with another backend.

## Implemented in the separate folder

`operator-display-client/` now has its own Vite entry, Redux Toolkit store, Java marketplace client, Appsmith Templates-style catalog and item detail, Applications-style dashboard library, extracted Admin Settings frame with group/user/tag/operations screens, an AppIDE-shaped editable workbench, and a marketplace dashboard viewer. The workbench loads the copied dashboard document format and same-origin IndexedDB drafts. It has a per-mount Redux editor store with sagas for Appsmith-style command actions, committed layout updates, and revision-checked local saves. The palette can add six supported widgets by click or drag into the main or a nested Container canvas, and the workbench can edit their Appsmith-derived static Content/Style property controls, move/resize fixed-layout widgets, delete, undo/redo, save, and reopen drafts. It migrates and flattens DSL into a separate display store and renders Text, Container, basic Chart, Image, Divider, and Progress widgets plus Statbox container structure through adapted Appsmith presentation code. It resolves restricted saved `{{WidgetName.propertyPath}}` references and can preview local synthetic values through the product's transient Cyflex binding projector. The viewer reuses the renderer without selection controls, loading Java marketplace download bytes and resolving referenced marketplace themes. General Appsmith JavaScript evaluation, action controls, the full widget registry, and live data await later native runtime extraction. The old native editor remains available in the Appsmith-built integration during the port.

The [native editor extraction report](operator-display-client/NATIVE_EDITOR_EXTRACTION_REPORT.md) and [graph script](operator-display-client/scripts/audit-native-graph.cjs) turn the import graph into an ordered source manifest. The current standalone editor reaches 1,642 client source files, including 63 Appsmith API modules; the global store sits in a 278-module import cycle. The dashboard document package was the first five-file, zero-API leaf copied with parity verification. The pure DSL migration/flattening boundary is extracted into a validated canvas payload adapter without importing PageSagas or PageApi. Its 97 Appsmith-owned runtime files match the source byte-for-byte; parity checks cover DSL versions 94, 89, 88, 12, and 1. That payload now feeds the read-only compatibility store and renderer. The full native editor canvas, widget classes, evaluator, and editing watchers are not mounted in this product bundle.

The package now carries a 276-file graph-traced ADS subset in `operator-display-client/vendor/ads`, a locked pnpm installation, and no Vite or TypeScript module fallback into `app/client`. A frozen-lockfile install, local typecheck, production build, and browser fixtures passed. Source parity and vendor-refresh scripts still read the checked-out Appsmith tree; the application build and runtime do not. Browser fixtures verify marketplace, item detail, workspace, workbench/draft loading, marketplace dashboard viewing, read-only Text/Container/Image/Divider/Progress widgets, nested Statbox Text, empty and populated basic charts, saved reference resolution/fallback, local sample projection, and admin routes without Appsmith requests; a live Java or Cyflex deployment remains unavailable.

## Why the complete page modules cannot be copied unchanged

| Boundary | Evidence | Consequence |
|---|---|---|
| Appsmith build scope | The current [webpack config](app/client/config/webpack.config.js) fixes its entry and Babel/module scope to `app/client/src` and client packages; [paths](app/client/config/paths.js) define the source root. | A root-level application needs its own build. An `app/client/packages` workspace would still be inside Appsmith's build ecosystem. |
| Root Redux graph | [store.ts](app/client/src/store.ts:1) creates a legacy Redux store with batch, route/package middleware, Sentry, and saga middleware. [root reducer](app/client/src/ce/reducers/index.tsx:94) combines entities, UI, evaluations, form, settings, organization, linting, Git, and AI state. [saga registry](app/client/src/ce/sagas/index.tsx:65) includes editor and unrelated Appsmith backend flows. | Copying it brings over backend assumptions and a large import graph. A product store should contain only our state. |
| API contract | [Appsmith Api](app/client/src/api/Api.ts:13) targets `/api/` and uses Appsmith interceptors; [success interceptor](app/client/src/api/interceptors/response/apiSuccessResponseInterceptor.ts:8) expects `responseMeta`. Our [MarketplaceClient](app/client/src/integration/marketplace/MarketplaceClient.ts:185) uses `/operator_display/...` and Java-shaped responses. | Appsmith API/saga actions cannot be reused as the Java action layer. |
| Bootstrap | The stock [entry](app/client/src/index.tsx:80) runs Appsmith initialization and the full saga registry before rendering AppRouter. The [route switch](app/client/src/ce/AppRouter.tsx:77) mounts Appsmith pages and headers. | The new entry must mount only the Java app and its store. |
| TypeScript state assumptions | [config.d.ts](app/client/src/config.d.ts:1) extends React Redux `DefaultRootState` with Appsmith's `AppState`; native selectors assume that shape. | A separate TypeScript project avoids accidental state-type coupling. |
| Native editor | Current [standalone editor](app/client/src/integration/standalone/index.tsx:726) seeds Appsmith user, app, page, theme, canvas, selection, and evaluation state, then runs selected drag/widget/evaluation sagas. | Replacing its Redux store with the small product store would break native canvas and property-pane behavior. |

## Target boundaries

```text
operator-display-client/
  src/app/                 route entry, providers, typed hooks
  src/state/               product Redux slices and async Java actions
  src/api/                 copied/adapted Java clients and validation
  src/layouts/             copied Appsmith page composition and CSS
  src/features/marketplace/
  src/features/admin/
  src/features/groups/
  src/features/workspace/
  src/features/run/
  src/editor-bridge/       adapter contract for native editor/viewer runtime
  src/styles/              Appsmith design tokens and product styles
```

The product Redux store should contain serializable UI and server state: session identity and roles, marketplace query/results, group/user/admin lists, selected dashboard and draft metadata, navigation, and run connection status. Java HTTP clients remain transport services. IndexedDB owns durable draft bytes; NATS owns live connections and dispatches status/data updates. Tokens or browser credentials do not enter Redux.

The editor bridge should expose `mount(document, mode, identity)`, `replaceDocument`, `snapshot`, `subscribe`, and `dispose`. Its implementation owns an **editor compatibility store** with the specific Appsmith canvas state and sagas, and keeps that store out of the normal product route tree. The current editor starts `widgetOperationSagas`, `draggingCanvasSagas`, selection, and evaluation watchers ([standalone/index.tsx](app/client/src/integration/standalone/index.tsx:776)); the viewer starts evaluation only ([standalone/index.tsx](app/client/src/integration/standalone/index.tsx:1295)). The bridge's output is a validated dashboard document, not direct access to its Redux state.

Two early editor extractions reduce backend coupling: move `getCanvasWidgetsPayload` usage out of [PageSagas](app/client/src/ce/sagas/PageSagas.tsx:211) into a pure DSL adapter, and replace the imported [global store](app/client/src/store.ts:1) with a per-mount store using only explicitly required reducers and watchers. Preserve the existing [network guard](app/client/src/integration/standalone/networkGuard.ts:1) while doing this.

## Page migration map

| Product surface | Appsmith layout to follow | Data/action replacement | Initial move |
|---|---|---|---|
| Marketplace catalog and item detail | [Templates list/detail](app/client/src/pages/Templates/index.tsx:30), [TemplateView](app/client/src/pages/Templates/TemplateView.tsx:189) | Java item/group/tag/rating/download clients | Copy page composition and adapt to Java models; use product Redux query/results state. |
| Dashboard catalog and local drafts | [Applications](app/client/src/ce/pages/Applications/index.tsx:1252) | Java item catalog and IndexedDB draft repository | Copy workspace rail/card composition; no Appsmith workspace fetch. |
| Administration | [Admin Settings frame/navigation](app/client/src/pages/AdminSettings/SettingsLayout.tsx:7) | Java session, group, user, tag, site, test cell, variable clients | Copy the already extracted neutral layout and existing backend-specific screens. |
| Group General/Members | [Workspace settings tabs](app/client/src/pages/workspace/settings.tsx:127) | Java group/member clients | Keep ADS tabs and Java role rules. |
| Workbench | [AppIDE four-area layout](app/client/src/pages/AppIDE/layouts/StaticLayout.tsx:39) and native canvas | Java dashboard document, local drafts, marketplace publishing, Cyflex run | Copy layout shell; move native canvas under editor bridge before removing Appsmith host. |
| Marketplace dashboard viewer | [AppViewer body/navigation](app/client/src/pages/AppViewer/index.tsx:253) | Java download now; Cyflex run later | A single saved fixed canvas uses a compact header and centered read-only canvas. Add navigation variants only if the document format gains multiple pages. |
| Authentication and onboarding | [UserAuth](app/client/src/pages/UserAuth/index.tsx:33), [Setup](app/client/src/pages/setup/index.tsx:12) | Deployment's Entra/session and account setup contract | Copy presentation only when backend routes for those screens are defined. |

## Build and verification plan

1. **Done:** create the root-level frontend with Vite, React, React Redux, Redux Toolkit, and Java clients. Copy the reachable ADS runtime subset and pin local dependencies. `pnpm install --frozen-lockfile`, local typecheck, and production build pass without `app/client/node_modules`.
2. **Done:** marketplace catalog and item detail with group filter, Appsmith Templates composition, product store, Java client, and a browser check against Java-shaped fixtures. No Appsmith `/api/v1` requests occur in that check.
3. **Done for current frontend routes:** administration, groups, and dashboard library in the separate app. Java behavior awaits a live deployment.
4. **Supported fixed-layout editing done; native editor parity in progress:** the AppIDE four-area shell, API-free canvas payload adapter, isolated widget display state, Redux/saga editor state, six-widget palette, Appsmith-derived static property sections and controls, main and nested canvas grid drag/resize controls, delete, undo/redo, and revision-checked local save/reopen are mounted. The Text/Container/basic Chart/Image/Divider/Progress display components and Statbox container structure, restricted saved-reference resolver, and transient product-binding projector remain shared with the viewer. Browser and contract checks cover add, move, resize, selection, property edits, deletion, save/restore, and preview. Continue the dependency-graph stages for broader native fixed/auto/Anvil canvas behavior, dynamic controls, and the full evaluator.
5. **Saved-content viewer done; live viewer pending:** `/viewer/items/:id` uses Java's POST download and content GET contract, resolves a current marketplace theme, and displays the saved canvas without editing controls. Dashboard catalog navigation opens it. Continue with authorized Cyflex live values and full viewer runtime after deployment details are available. Compare desktop/mobile screenshots against the corresponding Appsmith layouts and run contract checks against a live Java deployment when available.
6. **Build boundary done:** the new app installs and builds without `app/client/node_modules` or source aliases. Keep the old integration entries until native editor/viewer behavior and live backend flows are verified in the new app.

The dependency boundary is a build gate: production source in the new app must not import `app/client/src/api`, Appsmith workspace/admin sagas, Appsmith auth actions, or the global `DefaultRootState`. Editor compatibility code is isolated and audited separately.
