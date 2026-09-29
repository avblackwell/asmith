# Fixed choice widget source map

This module ports the saved defaults, derived selection values, widget meta updates,
and control layout of Appsmith's Fixed palette choices. The source files read before
writing the port were:

| Widget | Appsmith source |
| --- | --- |
| Select | `app/client/src/widgets/SelectWidget/widget/index.tsx`, `widget/derived.js`, `component/index.tsx`, `component/SelectButton.tsx`, `component/index.styled.tsx` |
| MultiSelect V2 | `app/client/src/widgets/MultiSelectWidgetV2/widget/index.tsx`, `widget/derived.js`, `component/index.tsx`, `component/index.styled.tsx` |
| Checkbox Group | `app/client/src/widgets/CheckboxGroupWidget/widget/index.tsx`, `component/index.tsx`, `constants.ts` |
| Switch Group | `app/client/src/widgets/SwitchGroupWidget/widget/index.tsx`, `component/index.tsx` |
| Shared styling | `app/client/src/constants/DefaultTheme.tsx` (`BlueprintRadioSwitchGroupTransform`), `app/client/node_modules/@design-system/widgets-old/src/LabelWithTooltip/index.tsx` |

`choiceModel.ts` records the exact Fixed default dimensions, saved defaults, and
Appsmith's distinct transient meta property names. `NativeChoiceWidgetView` sends
only meta patches through `onMetaChange`; the caller owns Redux dispatch. The
operator display has no Appsmith action evaluator. `onOptionChange`,
`onSelectionChange`, `onFilterUpdate`, and dropdown open/close action strings are
not executed here. A configured server side filter will expose the filter text
but needs a product query/action contract to fetch revised options.

The extracted client does not currently carry Blueprint Select, rc-select,
react-window, or the Appsmith theme dependency graph. The port keeps their
visible DOM classes and measured control/list metrics with scoped CSS and the
same interaction/meta rules for literal options. It does not claim pixel exact
parity for virtualized long lists, popup placement, rc-select responsive tag
overflow, loading skeletons, or Appsmith's action-backed server filtering.
The property's `JSON_ARRAY` and text controls correspond to Appsmith's
`ONE_CLICK_BINDING_CONTROL`, `OPTION_INPUT`, and `WRAPPED_CODE_EDITOR` as the
local property-pane supports only the bounded controls listed in its config.
