# Fixed theme editor port

The operator display workbench uses Appsmith's **Fixed** theme editor. The visual controls come from the Appsmith client source; theme mutations go through the operator display document's Redux and saga commands. Appsmith's application/theme API is not mounted in this workspace.

## Source to port map

| Appsmith source | Operator display port | What was retained |
| --- | --- | --- |
| `app/client/src/pages/AppIDE/layouts/hooks/useGridLayoutTemplate.ts` and `src/constants/AppConstants.ts` | `operator-display-client/src/layouts/ide/AppIdeFrame.tsx`, `appIdeFrame.css` | Settings grid: 50 px sidebar, 525 px settings pane, canvas, zero-width property pane. |
| `app/client/src/pages/AppIDE/components/AppSettings/AppSettings.tsx`, `src/pages/Editor/commons/EditorSettingsPaneContainer.tsx`, `src/IDE/Components/PaneHeader.tsx` | `operator-display-client/src/features/workbench/WorkbenchAppSettings.tsx`, `workbenchAppSettings.css` | App Settings header and two-column section navigation/content layout. |
| `app/client/src/pages/Editor/ThemePropertyPane/{index,ThemeEditor,ThemeSelector,ThemeCard,SettingSection,DeleteThemeModal}.tsx` | `operator-display-client/src/features/theme-editor/` | Edit/select modes, applied, saved, and featured theme cards, hover delete with confirmation, collapsible Font/Color/Border/Shadow sections, Change theme, and Reset widget styles. |
| `app/client/src/pages/Editor/ThemePropertyPane/controls/*.tsx` and `src/components/propertyControls/ColorPickerComponentV2.tsx` | `operator-display-client/src/features/theme-editor/controls/` | Appsmith control options and interactions. The color picker includes Appsmith's fixed swatch palette and full picker toggle. |
| `app/client/packages/design-system/ads/src/Select/` and `Spinner/` | `operator-display-client/vendor/ads/src/Select/` and `Spinner/` | Directly copied ADS source components, with the local vendor package's dependencies. Existing vendored ADS Button, Icon, and SegmentedControl are reused. |
| `app/server/appsmith-server/src/main/resources/system-themes.json` | `operator-display-client/src/editor-bridge/appsmith-theme/systemThemes.json`, `presets.ts` | Eight active featured themes and their exact names, order, config, and properties. |
| `app/client/src/assets/fonts/custom/` | `operator-display-client/src/assets/fonts/custom/` | Appsmith's selectable font files and CSS declarations. |
| `app/client/src/sagas/AppThemingSaga.tsx` and `src/entities/AppTheming/utils.ts` | `operator-display-client/src/editor-bridge/editable-store/`, `appsmith-theme/`, and `src/features/theme-editor/resetWidgetStyles.ts` | Theme edit/select/reset as Redux/saga document commands. Widget reset values are extracted from Appsmith Fixed widget stylesheet configs. |
| `app/server/appsmith-server/src/main/java/com/appsmith/server/themes/base/ThemeServiceCEImpl.java` (`persistCurrentTheme`, `changeCurrentTheme`, `getApplicationThemes`) and Appsmith's `deleteTheme` flow | `operator-display-client/src/features/theme-editor/IndexedDbSavedThemeStore.ts` | A named saved theme is a copy of the current properties, separate from the draft's applied theme. The local library is scoped by deployment, account, and dashboard; saved themes are listed under Your themes and can be applied or deleted. |

## State and rendering flow

1. The workbench reads the draft document's inline theme or downloads and validates a referenced Marketplace theme for display. The reference stays in the saved document until the first property edit copies that theme inline as one undo step.
2. A theme property or preset selection dispatches an editor command. The command changes the local document through the existing undo/redo and save flow.
3. The canvas receives the theme as render props. Exact `{{appsmith.theme.*}}` style bindings are resolved for rendering while the authored widget DSL keeps its bindings.
4. Reset widget styles applies the source stylesheet bindings in one undoable document edit. Table's generated column expressions and JSONForm's generated field expressions are resolved only when they match the exact Appsmith theme wrappers; arbitrary JavaScript is not evaluated.
5. Save theme copies the current properties and the source preset's control configuration into the dashboard's IndexedDB theme library. This leaves the applied draft unchanged. Applying a saved card dispatches an inline theme edit through the existing saga and undo/save flow, with its display name and source preset retained in the draft. Deleting a saved card removes the library copy after confirmation; an applied copy keeps its identity and properties.

The Appsmith source saves a selected application theme through `AppThemingApi` and replays the widget data tree. This port stores the theme in the dashboard document and updates the local canvas without replacing its widgets or live-value overlay for a theme-only edit.

## Scope

This is the Fixed theme editor. Appsmith's separate Anvil/WDS theme system is outside the current Fixed workbench scope. The selector offers the eight source featured themes and local saved themes. The checked-in Appsmith client has a save action without a wired save UI, while its Java theme service defines named copies; the operator client adds a Save theme dialog to make that library usable. IndexedDB themes stay in the current browser, account, and dashboard scope. A server-backed theme library remains an integration task if saved themes must sync across devices. Widget rendering support still follows the operator display widget-port status, so a style on an unported widget cannot yet be previewed. The existing Table and JSONForm ports render their source-generated theme styles; full Appsmith JavaScript evaluation, Table actions, and the complete JSONForm field catalog remain outside their current runtime.

The Java Marketplace download route returns the current asset bytes. A document's stored theme revision is descriptive here; this client cannot retrieve an immutable older revision from that route.

## Verification

From `operator-display-client/`, run `node_modules/.bin/tsc --noEmit`, `node scripts/check-boundary.cjs`, `node scripts/extract-appsmith-theme-bindings.cjs --check`, `node src/editor-bridge/appsmith-theme/themeEditor.contract.test.cjs`, `node src/features/theme-editor/IndexedDbSavedThemeStore.contract.test.cjs`, and `node src/features/theme-editor/resetWidgetStyles.contract.test.cjs`. With the local Vite and mock Java servers running, `node scripts/verify-theme-editor.cjs` checks the settings flow, all four controls, keyboard palette interaction, canvas and live-value continuity, and save/reload. `node scripts/verify-saved-themes.cjs` checks save, list, apply, reload, and confirmed deletion. `node scripts/verify-referenced-theme.cjs` checks a referenced Marketplace theme's transient preview, first edit, and undo.
