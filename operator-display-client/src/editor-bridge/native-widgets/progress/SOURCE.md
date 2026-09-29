# Read-only ProgressWidget extraction

`AppsmithProgressComponent.tsx` and `constants.ts` come from
`app/client/src/widgets/ProgressWidget/component/index.tsx` and
`app/client/src/widgets/ProgressWidget/constants.ts` under Appsmith's Apache-2.0
license. The component's imports were changed to local files, its three fixed
palette values were copied locally, and the one Lodash range call became
`Array.from`. `NativeProgressView.tsx` is the standalone adapter.

The Appsmith presentation component graph has three source files and no API
imports. The widget class graph reaches the editor store and backend APIs, so
this package does not import it. The adapter renders linear/circular,
determinate/indeterminate, steps, and the optional result label from already
resolved static values. It clamps progress to 0–100 and steps to 1–100 and
restricts color/radius CSS values. It resolves the saved Appsmith theme color
token from `themePrimaryColor` if supplied.

The caller is responsible for detecting unresolved dynamic DSL expressions and
for applying live updates before passing `progress`. This package does not
evaluate JavaScript, run widget events, request APIs, or control Cyflex.
