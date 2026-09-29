# Theme marketplace assets

A theme upload is a versioned JSON package with `assetKind: "theme"`, `schemaVersion: 1`, a name, and selected Appsmith theme properties. The properties include the four groups already supported by `DashboardDocument.theme`: colors, border radius, box shadow, and font family. Additional string values within each group are preserved.

`ThemeMarketplaceRepository` uses the unchanged marketplace endpoints. `listThemes` requests the exact `theme` type filter. `downloadTheme` checks both the marketplace item type and package content. `publishNewTheme` creates a new item and requires a thumbnail through `MarketplaceClient`; `replacePublishedTheme` explicitly overwrites an existing theme after checking its type and retaining omitted metadata. The backend has no immutable revision or conflict token.

`applyThemeAsset` copies values into a dashboard's inline theme. This makes the applied appearance available to the existing editor and offline preview without a later marketplace lookup. Changes to the shared theme item do not silently change an installed dashboard. `themeAssetFromDocument` creates an uploadable package from the current inline theme. `appThemeFromThemeAsset` converts a package directly to the Appsmith `AppTheme` shape when a renderer needs it.
