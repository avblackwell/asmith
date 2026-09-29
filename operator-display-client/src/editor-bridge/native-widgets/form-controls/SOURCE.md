# Appsmith form widget port status

## Integrated: Checkbox and Switch

- Source widget contracts: `app/client/src/widgets/CheckboxWidget/widget/index.tsx` and
  `app/client/src/widgets/SwitchWidget/widget/index.tsx`. Their default property maps
  feed `defaultCheckedState` into `isChecked` and `defaultSwitchState` into
  `isSwitchedOn` respectively. Clicks update the transient meta value and mark the
  widget dirty; they do not change the authored default.
- Source presentation: `app/client/src/widgets/CheckboxWidget/component/index.tsx`,
  `app/client/src/widgets/CheckboxWidget/component/Checkbox/index.tsx`,
  `app/client/src/widgets/SwitchWidget/component/index.tsx`, and Blueprint's
  `Control` in `app/client/node_modules/@blueprintjs/core/lib/esm/components/forms/controls.js`.
  The local component uses Blueprint's `label > input + .bp3-control-indicator +
  .label-container` DOM and ports the relevant Appsmith CSS. The two checkmark SVGs
  were copied from `app/client/src/assets/icons/widget/checkbox/`.
- The caller supplies `value` from its transient Redux meta slice and dispatches
  `onValueChange`. Without a meta value, saved defaults are shown. Editor mode
  keeps the original enabled appearance but does not dispatch a value change.

## Integrated for basic Fixed use: Input V2 and Radio Group

- Input source: `app/client/src/widgets/InputWidgetV2/widget/index.tsx`,
  `app/client/src/widgets/InputWidgetV2/component/index.tsx`,
  `app/client/src/widgets/BaseInputWidget/component/index.tsx`, and
  `app/client/src/widgets/InputWidgetV2/widget/Utilities.ts`. The local view
  uses the source ControlGroup, TextInputWrapper, InputGroup and NumericInput
  DOM class structure and a 32px input border. Fixed multiline input fills its
  widget height; Fixed left labels use Appsmith's `labelWidth * parentColumnSpace`
  ratio. Password eye and numeric chevron SVG paths come from the source
  Blueprint icon assets. The non-localized Blueprint numeric keyboard filter,
  paste sanitizer, arrow-key step, and min/max disabled-button rules are ported.
  Text and password changes emit the
  exact input string. A caller should set transient `inputText` to that string,
  `text` to Appsmith's `getParsedText` result (number input: `Number(value)`,
  empty or NaN: `null`), and `isDirty` to true. The saved `defaultText` is
  shown when transient meta is absent.
- Radio source: `app/client/src/widgets/RadioGroupWidget/widget/index.tsx`,
  `app/client/src/widgets/RadioGroupWidget/component/index.tsx`,
  `app/client/src/constants/DefaultTheme.tsx`, and Blueprint's `Radio` control.
  The local view uses the source RadioGroup/Radio structure, indicator styling,
  inline spacing and right-indicator class. A change emits the selected option
  value as a number when the first option is numeric, otherwise as a string.
  A caller should set transient `selectedOptionValue` and `isDirty` to true.
  The saved `defaultOptionValue` is shown when transient meta is absent.
- Focused Chrome tests cover the DOM shape, input height, password visibility,
  fixed multiline height, numeric keys and step bounds, top-label alignment,
  radio right alignment, controlled value updates, and editor-mode interaction
  suppression.

`isFormWidget` includes both. The canvas stores their changes in transient
Redux meta properties, leaving authored defaults in the DSL. Remaining gaps
are Appsmith's evaluation-driven validation/error tooltip, multiline auto-height
proxy, arbitrary input icon selector, NumericInput's continuous button hold and
composition handling, loading skeleton, label help tooltip, and the runtime
action contract for focus, blur, change, and submit. These features should not
be represented as complete parity in the workbench.

## Select and MultiSelect: provisional and unexposed

`SELECT_WIDGET` and `MULTI_SELECT_WIDGET_V2` have saved-property mapping
experiments, but their native `<select>` controls do not reproduce Appsmith's
dropdown and menu structure, filtering, keyboard handling, or transient meta.
They are excluded by `isFormWidget` and should remain absent from the palette.

`FORM_PROPERTY_CONTROLS` contains a static property-pane field map for the six
types. The central property-pane registry should register only the integrated
types at this stage. Action selector fields are omitted because there is no
product action contract for the runtime events yet.
