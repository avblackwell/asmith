# Fixed special input port

This module ports `DATE_PICKER_WIDGET2`, `PHONE_INPUT_WIDGET`, and
`CURRENCY_INPUT_WIDGET` for the extracted operator client. It is isolated from
Appsmith's backend and evaluation engine. The renderer accepts authored DSL,
transient meta, and a callback for meta patches; the canvas owner must store the
patches in Redux without changing authored default properties.

## Source read before implementation

- `app/client/src/widgets/DatePickerWidget2/widget/index.tsx`,
  `component/index.tsx`, `component/utils.ts`, `widget/derived.js`,
  `widget/constants.ts`, `constants.ts`.
- `app/client/src/widgets/PhoneInputWidget/widget/index.tsx`,
  `widget/derived.js`, `component/index.tsx`, `component/ISDCodeDropdown.tsx`,
  `component/utilities.ts`.
- `app/client/src/widgets/CurrencyInputWidget/widget/index.tsx`,
  `widget/derived.js`, `component/index.tsx`,
  `component/CurrencyCodeDropdown.tsx`, `component/utilities.ts`.
- `app/client/src/widgets/BaseInputWidget/widget/index.tsx` and
  `component/index.tsx` for shared defaults, meta, Blueprint numeric and text
  input behavior, styling, and label layout.
- `app/client/src/constants/ISDCodes_v2.tsx` and `Currency.tsx` are copied
  without modification to preserve the full Appsmith country and currency
  catalogs. Their entries are rendered with the same labels and default
  selections.
- `app/client/src/assets/fonts/custom/twemoji/twemoji.css` and its WOFF2 font
  are copied with their MIT / CC-BY-4.0 license to render country flag emoji
  on Windows, as Appsmith does.

The component imports Appsmith's actual installed Blueprint 3.47.0,
Blueprint datetime 3.23.6, moment 2.29.4, and libphonenumber-js 1.9.44
versions. DatePicker uses Blueprint `DateInput` and the source date formatting,
calendar bounds, first day, time precision, shortcuts, close behavior, ISO meta
value, and default map. Phone uses Appsmith's `AsYouType` and
`parseIncompletePhoneNumber` sequence, including not reformatting while
deleting. Currency uses Blueprint `NumericInput`, the source Intl locale and
decimal-limit transforms, and its currency symbol trigger. All three use the
source Fixed defaults, property names, labels, and local meta mapping.

## Integration

- Use `isSpecialInputWidget(widget.type)` in `NativeReadOnlyCanvas`, render
  `NativeSpecialInputView`, and pass `meta` for that widget from the compat
  store. Dispatch `onMetaChange(patch)` as one transient meta batch. Ignore
  callback in editor drag mode; the view already checks `editor`.
- Add `specialInputDefaults(type)` to the add-widget defaults and the exact
  Appsmith Fixed dimensions: 20 columns and 7 rows for each. DatePicker is
  version 2; Phone and Currency are version 1. The date default should be
  captured at add time, as Appsmith's `getDefaults` calls `moment()`.
- Register `SPECIAL_INPUT_PROPERTY_CONTROLS[type]` in the property registry.
  Copy the three `thumbnail.svg` assets from the source widget folders into
  the palette asset directory.
- Reset `value` on `defaultDate` edits, `text` and `dialCode` on Phone
  `defaultText` / `defaultDialCode` edits, and `text` and `currencyCode` on
  Currency `defaultText` / `defaultCurrencyCode` edits. In each case clear
  `isDirty` at the same time, matching the source default-property maps.

## Remaining parity gaps

- Appsmith's `@design-system/widgets-old` `Dropdown` is not in the extracted
  client. The phone and currency selectors preserve its labels, search,
  selection, and trigger classes with a Blueprint popover, but its exact
  virtualization, keyboard focus, and dropdown styling need the shared
  design-system port.
- Date properties `defaultDate`, `minDate`, and `maxDate` use `INPUT_TEXT`
  in the local property registry because its `DATE_PICKER` control type is not
  ported. The canvas date widget itself uses Appsmith's Blueprint DateInput.
- Evaluation-driven regex, custom `validation`, error tooltips, loading
  skeletons, label help popovers, and configured action events require the
  product evaluation/action contract. The static property map intentionally
  omits action selectors. There is no backend call in these widgets.
