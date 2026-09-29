# Button control source map

This folder contains Fixed-canvas presentation for `BUTTON_WIDGET`, `ICON_BUTTON_WIDGET`, and `BUTTON_GROUP_WIDGET`. The Appsmith widget and component sources were read before implementation.

| Local behavior | Appsmith source |
| --- | --- |
| Defaults and content/style property descriptors | `app/client/src/widgets/ButtonWidget/widget/index.tsx`, `IconButtonWidget/widget/index.tsx`, `ButtonGroupWidget/widget/index.tsx` |
| Primary/secondary/tertiary color, border, text contrast and placement | `app/client/src/widgets/WidgetUtils.ts`, `getCustomBackgroundColor`, `getCustomBorderColor`, `getComplementaryGrayscaleColor`, `getCustomJustifyContent` |
| Button fill, label/optional icon, alignment, disabled/loading and tooltip | `ButtonWidget/component/index.tsx`, `BaseButton`, `BtnWrapper`, `ButtonComponent` |
| Icon button square centered inside Fixed widget, 4px padding on each side | `IconButtonWidget/component/index.tsx`, `IconButtonComponent` |
| Visible ButtonGroup children sorted by `index`, row/column orientation, equal flex, 1px primary gap and end cap radii | `ButtonGroupWidget/component/index.tsx`, `render`, `ButtonGroupWrapper`, `StyledButton` |
| Default Blueprint SVG icon paths | `app/client/node_modules/@blueprintjs/icons/src/generated/iconSvgPaths.ts`, 16px set used by Appsmith's Blueprint Icon components |

`NativeButtonControlsView({ widget, width, height, mode, themePrimaryColor?, themeBorderRadius?, themeBoxShadow? })` accepts the existing compat DSL without changes. `getButtonControlDefaults(kind)` returns fresh source-derived defaults for newly authored widgets. `BUTTON_CONTROL_PROPERTY_CONTRACTS` records Appsmith's controls and paths for integration with the local property pane; it does not install an action selector.

Click action execution, ReCAPTCHA, form submission/reset, ButtonGroup menu popovers, and loading lifecycle require a product action contract. Configured actions and menus are rendered as disabled controls with explicit titles. The local client does not include Blueprint Button/Popover2, so this port retains their source geometry/style rules in native buttons rather than claiming complete Blueprint component parity. The bundled SVG paths cover Appsmith defaults and a few common icons; unsupported icon names render without an icon until their Blueprint paths are ported.
