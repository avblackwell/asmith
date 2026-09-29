# Fixed Menu and Tree Widget Port

This isolated module maps Appsmith Community Edition's Fixed palette widgets to the operator display. The original widget classes are the authority for the defaults, row/column sizes, property metadata, meta-property names, and derived values.

| Widget | Appsmith source read | Port |
| --- | --- | --- |
| `MENU_BUTTON_WIDGET` | `app/client/src/widgets/MenuButtonWidget/widget/index.tsx`, `component/index.tsx`, `constants.ts`, `widget/propertyConfig/{contentConfig,styleConfig}.ts`, `widget/propertyConfig/childPanels/{menuItemsConfig,configureMenuItemsConfig}.ts`, `widget/propertyConfig/propertyUtils.ts` | Blueprint `Popover2`, `Button`, `Menu`, `MenuItem`; static strict visibility and index sorting; dynamic per-item scalar/array configuration |
| `SINGLE_SELECT_TREE_WIDGET` | `app/client/src/widgets/SingleSelectTreeWidget/widget/{index.tsx,derived.js}`, `component/{index.tsx,index.styled.tsx}` | `rc-tree-select` with Appsmith default option tree, filtering, expand/collapse, clear, derived selected value and label |
| `MULTI_SELECT_TREE_WIDGET` | `app/client/src/widgets/MultiSelectTreeWidget/widget/{index.tsx,derived.js}`, `component/{index.tsx,index.styled.tsx}` | `rc-tree-select` with checks, checked strategy, filtering, tags, derived selected values and labels |

The original `rc-tree-select@5.4.0`, `rc-select`, `rc-tree`, Blueprint core, and Blueprint Popover2 styles are used. `rc-tree-select.less` copies the package entry stylesheet composition with its legacy webpack `~` imports changed to ordinary package imports for Vite. `menuTree.css` carries the Appsmith component's target and popup layout selectors, scoped to the operator display.

`MENU_TREE_DEFAULT_PROPERTY_MAP` and `selectedTree` match Appsmith's `getDefaultPropertiesMap`, `getMetaPropertiesMap`, and `derived.js` mapping. The parent store should clear selected meta when `defaultOptionValue` changes, as the Appsmith widget's `componentDidUpdate` does. The menu has no widget meta properties.

The module exposes `onAction` for the product action runner. It does not evaluate Appsmith JavaScript action strings. The local property pane lacks Appsmith's `MENU_ITEMS`, `OPEN_CONFIG_PANEL`, `MENU_BUTTON_DYNAMIC_ITEMS`, and `ACTION_SELECTOR` controls, so nested menu item authoring, dynamic item configuration, and event authoring remain integration gaps. The JSON `sourceData` and tree option controls can be edited in the existing pane. The popup container uses Appsmith's `.canvas` target when present and `document.body` in the isolated harness.

Run `node src/editor-bridge/native-widgets/menu-tree/menu-tree.contract.test.cjs` and `node src/editor-bridge/native-widgets/menu-tree/menu-tree.browser.test.cjs` from `operator-display-client`. The browser test expects the local Vite server on port 3004.
