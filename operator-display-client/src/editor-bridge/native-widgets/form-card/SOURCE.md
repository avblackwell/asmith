# Form and Card Fixed widgets

These source-shaped adapters follow Appsmith's Apache-2.0 client files:

- `app/client/src/widgets/FormWidget/widget/index.tsx`
- `app/client/src/widgets/ContainerWidget/widget/index.tsx`
- `app/client/src/widgets/ContainerWidget/component/index.tsx`
- `app/client/src/widgets/CardWidget/widget/index.tsx`
- `app/client/src/widgets/CardWidget/component/index.tsx`
- `app/client/src/widgets/CardWidget/chromeHeight.ts`
- `app/client/src/widgets/CardWidget/constants.ts`

`blueprints.ts` materializes the Fixed branch of each widget's `getDefaults().blueprint` with caller-allocated IDs and names. Form creates a canvas, title, Submit and Reset buttons. Card creates a canvas and body hint text; the header, media, menu and footer are Card chrome, not canvas children. It seeds the Appsmith theme expressions and Card's two default menu and footer items.

`NativeFormView` uses the existing port of Appsmith's Container presentation. `NativeCardView` follows CardComponent's zones and dimensions (50px header, 48px footer, 140px default top media, 120px left media), Blueprint Menu/Popover2/Icon controls, footer Button styling, loading skeletons, and media error handling. `viewModel.ts` retains Card's explicit visibility and ordering rules, collapse defaults, and shared chrome-height arithmetic. The view receives evaluated/static props and callback-driven meta actions.

The product document currently rejects configured Appsmith event handlers. The generated buttons and Card actions therefore have no trigger strings, and the adapters do not execute arbitrary JavaScript or call the Appsmith backend. Card selection and expansion state use the local Redux meta bridge in viewer mode. A full action contract, Form reset/data meta wiring, and live canvas sizing still require work before claiming runtime parity.
