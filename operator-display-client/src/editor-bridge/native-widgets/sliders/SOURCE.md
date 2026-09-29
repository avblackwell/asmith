# Fixed Rating and Sliders

This module ports the Fixed widget defaults and display behavior from the local Appsmith client source. It does not import Appsmith's backend or action execution path.

| Local file | Appsmith source |
| --- | --- |
| `defaults.ts`, `NativeRateView.tsx` | `app/client/src/widgets/RateWidget/widget/index.tsx` and `component/index.tsx` |
| `defaults.ts`, `NativeSliderViews.tsx` | `app/client/src/widgets/NumberSliderWidget/widget/index.tsx`, `RangeSliderWidget/widget/index.tsx`, and `CategorySliderWidget/widget/index.tsx` |
| `sliderModel.ts` | `app/client/src/widgets/NumberSliderWidget/utils.ts`, `RangeSliderWidget/component/RangeSlider.tsx`, and `CategorySliderWidget/widget/index.tsx` |
| `SliderChrome.tsx` | `app/client/src/widgets/NumberSliderWidget/component/{Container,SilderRoot,Track,Marks,Thumb}.tsx` |
| `useSliderMove.ts` | `app/client/src/widgets/NumberSliderWidget/use-move.ts` |

`RateWidget` uses Blueprint's `STAR` SVG path and sizes 12/16/21. It exposes Appsmith's `rate` meta value, half-star choice, colors, tooltips, disabled, and read-only states. Number and Range sliders use Appsmith's position, step rounding, range-thumb linking, marks, and mouse/touch scrub lifecycle. Their widget classes remove all marks when `showMarksLabel` is false. Category Slider uses Appsmith's rounded `100 / options.length` marks and maps the selected position back to its option value. The widget classes' `getDefaults()` values are in `defaults.ts`.

Each component accepts the current meta value as a prop and reports changes through callbacks. Appsmith calls `updateWidgetMetaProperty` and can run action selectors; the operator display's Redux bridge owns those integrations. Sliders report a change after scrubbing ends, matching `onChangeEnd`; a changed default clears `isDirty`. Source validation requires Category Slider options to have at least two entries, unique values of one type, and nonempty labels.

Remaining differences are explicit. Appsmith uses `react-rating` and Blueprint `Icon` for Rating; this module renders the same star path directly and supports click and keyboard changes without those packages. Appsmith's slider hover state darkens the active color through `tinycolor2` in `WidgetUtils.darkenColor`; the operator package does not yet carry that dependency, so the active color stays constant on hover while the track changes to Appsmith's hover gray. Appsmith's `LabelWithTooltip` and `getRgbaColor` focus ring are not in this isolated module. Appsmith action selectors are outside the widget view contract and are not invoked here.

Checks: `sliders.contract.test.cjs` covers defaults, source-derived transformations, and rendered controls. `sliders.browser.test.cjs` covers rating halves, slider keyboard input, track scrubbing, number/range thumb dragging, disabled input, default reset, and marks disappearing when marks are switched off.
