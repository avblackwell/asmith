# Read-only Text and Container rendering boundary

This package extracts the presentation behavior of Appsmith's `TextWidget` and
`ContainerWidget` for the standalone Operator Display client. It is an
Apache-2.0 derivative of the Appsmith source in `app/client/src/widgets`, with
the source boundary deliberately cut before the widget classes and editor
runtime. Import from `./index.ts` and pass already hydrated widget properties.

## Source graph

The original Text and Container component entry points each reach roughly
190 Appsmith source files and one API module through `WidgetUtils` →
`utils/helpers` → service worker utilities. Their widget class entry points
each reach roughly 1,240 source files and 63 API modules through `BaseWidget`
→ `store` → sagas. `WidgetStyleContainer` alone has one local source file and
no API edge. The exact audit command is:

```powershell
node scripts/audit-native-graph.cjs widgets/TextWidget/component/index.tsx widgets/ContainerWidget/component/index.tsx widgets/TextWidget/widget/index.tsx widgets/ContainerWidget/widget/index.tsx components/designSystems/appsmith/WidgetStyleContainer.tsx
```

The extracted files import only React, React DOM, styled-components,
Interweave, and Interweave Autolink. The latter two are the versions already
used by Appsmith (`12.7.2` and `4.4.2`). No Appsmith selector, Redux store,
saga, API, or global theme module is loaded.

## Contract

- `NativeTextView` accepts Appsmith's resolved text, text style, overflow,
  border, and link settings. It retains Interweave's safe HTML rendering and
  Appsmith's href normalization, automatic URL and email links, legacy font
  size mapping, scroll/truncate behavior, and a local Show More dialog.
- `NativeContainerView` accepts resolved background, border, shadow, scroll,
  and layout mode settings plus child React nodes. The caller renders and
  positions the child canvas/widgets.
- Stable browser markers are `data-native-widget="text"` with
  `data-testid="native-text-{widgetId}"` and `data-native-widget="container"`
  with `data-testid="native-container-{widgetId}"`.
- The local contract test runs with
  `node src/editor-bridge/native-widgets/text-container/text-container.contract.test.cjs`.
- With `npm run dev` active on port 3004, the browser check runs with
  `node src/editor-bridge/native-widgets/text-container/text-container.browser.test.cjs`.
  It checks rendered rich text, href normalization, automatic links,
  container styles, truncation/dialog behavior, and absence of API requests.

The package does not evaluate `{{ }}` bindings, resolve Appsmith theme tokens,
position widgets, run editor interactions, or render chart widgets. Those are
caller/runtime concerns. The dialog and truncation affordance use local HTML
elements instead of Blueprint's Text and Appsmith's modal/icon, so their exact
pixel appearance differs. Interweave emits its text content in the browser;
`react-dom/server` output does not include that content. Browser verification
is required for rendered HTML and links.
