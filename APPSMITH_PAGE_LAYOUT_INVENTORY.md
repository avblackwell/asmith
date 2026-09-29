# Appsmith client page layout inventory

Source review: 2026-09-28. This inventories the distinct **page-level layout families** reachable through the current [CE route switch](app/client/src/ce/AppRouter.tsx), which the [EE router](app/client/src/ee/AppRouter.tsx) reexports. Repeated pages within one shell are grouped together. Editor canvas positioning engines and smaller design-system templates are listed separately because they are different kinds of layout.

## Shared page chrome

| Piece | Role | Source and coupling |
|---|---|---|
| Route-specific header | Selects the generic page header, AppIDE header, AppViewer navigation, or no header for auth/setup/custom-widget routes. | [AppHeader](app/client/src/ce/pages/common/AppHeader.tsx:30); route- and Appsmith-state-dependent. |
| Generic page header | Fixed top bar with workspace/app navigation, search, account and product controls. | [PageHeader](app/client/src/pages/common/PageHeader.tsx:25); Appsmith routing, Redux, and permissions. |
| Generic page body | Offsets content below the header, handles banner height, and sets document title. | [PageWrapper](app/client/src/pages/common/PageWrapper.tsx:18); selectors, branding, and feature flags. |

## Active page families

| Route family | Layout visible to the user | Main implementation | Reuse boundary |
|---|---|---|---|
| `/applications` | Workspace navigation rail beside searchable application, package, and workflow card sections; mobile workspace selector. | [Applications page](app/client/src/ce/pages/Applications/index.tsx:1252), [card list](app/client/src/pages/Applications/CardList.tsx) | Full page fetches Appsmith workspaces/apps and uses Appsmith permissions. Card presentation and rail pattern can be adapted. |
| `/templates` | Fixed filter rail beside a scrolling template card catalog. | [Templates list](app/client/src/pages/Templates/index.tsx:30), [filter layout](app/client/src/pages/Templates/TemplatesLayoutWithFilters.tsx:25) | Full page loads Appsmith templates, plugins, and workspaces. Useful marketplace visual pattern. |
| `/templates/:templateId` | Template title/actions, details, and embedded preview. | [TemplateView](app/client/src/pages/Templates/TemplateView.tsx:189) | Appsmith template/import flow is backend-bound; detail/preview composition can be adapted. |
| `/settings/:category/:selected?` | Fixed two-column Admin Settings frame: grouped left navigation and right settings page or form. | [AdminSettings page](app/client/src/pages/AdminSettings/index.tsx:53), [shared SettingsLayout](app/client/src/pages/AdminSettings/SettingsLayout.tsx:7), [LeftPane](app/client/src/pages/AdminSettings/LeftPane.tsx:77), [Main](app/client/src/pages/AdminSettings/Main.tsx:15) | `SettingsLayout` is backend-neutral and already shared with our admin area. Stock category pages use Appsmith store, permissions, and settings save actions. |
| `/workspace/:workspaceId/settings` | Centered 978px settings page with sticky title/actions and General/Members tabs. | [Workspace settings](app/client/src/pages/workspace/settings.tsx:24), [tabs](app/client/src/ce/components/WorkspaceSettingsTabs/index.tsx:49), [route wrapper](app/client/src/pages/workspace/index.tsx:8) | Page fetches Appsmith workspaces and uses Appsmith member/invite APIs. ADS tabs can be reused; our Group General/Members page now does so. |
| `/user/*` | Full-screen authentication screen with centered form card and optional promotional panel. | [UserAuth](app/client/src/pages/UserAuth/index.tsx:33), [Container](app/client/src/pages/UserAuth/Container.tsx:58) | Login and signup actions use Appsmith authentication. Visual composition is separable. |
| `/setup/*` and `/signup-success` | Full-screen onboarding and welcome/form layout, including decorative panel. | [Setup](app/client/src/pages/setup/index.tsx:12), [UserWelcomeScreen](app/client/src/pages/setup/UserWelcomeScreen.tsx:39) | Appsmith instance setup actions are required for the full page. |
| App edit routes | IDE header, narrow sidebar, explorer/widget palette, center canvas or editor, property pane, and bottom bar. | [Layout switch](app/client/src/pages/AppIDE/layouts/index.tsx:19), [StaticLayout](app/client/src/pages/AppIDE/layouts/StaticLayout.tsx:39), [AnimatedLayout](app/client/src/pages/AppIDE/layouts/AnimatedLayout.tsx:35) | Static and animated versions are one workbench family selected by feature flag. Pane routers and canvas use Appsmith route, Redux, entity, and widget state. |
| App view routes | Published app navigation around a themed page body and widget canvas. | [AppViewer](app/client/src/pages/AppViewer/index.tsx:253), [AppPage](app/client/src/pages/AppViewer/AppPage/AppPage.tsx:24), [Navigation](app/client/src/pages/AppViewer/Navigation/index.tsx:96) | Navigation has desktop side, top inline, top stacked, and mobile menu variants. Full viewer uses Appsmith application state and initialization. |
| Custom-widget builder route | Dedicated header and resizable preview/code editor split with editor tabs. | [CustomWidgetBuilder](app/client/src/pages/Editor/CustomWidgetBuilder/index.tsx:36), [TabsLayout](app/client/src/pages/Editor/CustomWidgetBuilder/Editor/Layouts/TabsLayout/index.tsx:24) | Builder state and save path are Appsmith-specific. |
| Unknown/error routes | Full-screen error message with optional error header. | [Error page](app/client/src/pages/common/ErrorPages/Page.tsx:35), [ErrorPageHeader](app/client/src/pages/common/ErrorPageHeader.tsx:54) | Error presentation can be reused after replacing Appsmith-specific actions. |

Admin Settings registers Profile, Organisation, User management, and Instance categories through [configuration](app/client/src/ce/pages/AdminSettings/config/index.ts:1); [Main](app/client/src/pages/AdminSettings/Main.tsx:15) places either a generated settings form or a custom category page in the same outer frame. They are screens within one layout family.

## Additional page or modal layouts in the source

- [TemplatesModal](app/client/src/pages/Templates/TemplatesModal/index.tsx:80) has a modal catalog/detail layout used inside other flows. It is not another route-level page shell.
- [`/users`](app/client/src/pages/users/index.tsx:8) is a thin older page using `PageWrapper` and an Invite button, not the Admin Settings Users directory.
- The default [`/workspace` page](app/client/src/pages/workspace/defaultWorkspacePage.tsx:3) says it is under construction; the workspace settings subroute is the substantive layout.
- [UserProfile](app/client/src/pages/UserProfile/index.tsx:34) contains a centered tabbed profile layout but has no route in the current `AppRouter`. The active account view is the [Admin Settings profile page](app/client/src/pages/AdminSettings/Profile/index.tsx:205).

## Editor modes and canvas layouts

The AppIDE workbench always has four named areas: `Sidebar`, `Explorer`, `WidgetEditor`, and `PropertyPane`. [useGridLayoutTemplate](app/client/src/pages/AppIDE/layouts/hooks/useGridLayoutTemplate.ts:32) changes their widths or hides them for UI, Data, Settings, Libraries, preview, and split-screen states. [LeftPane](app/client/src/pages/AppIDE/layouts/routers/LeftPane.tsx:57), [MainPane](app/client/src/pages/AppIDE/layouts/routers/MainPane/MainPane.tsx:12), and [RightPane](app/client/src/pages/AppIDE/layouts/routers/RightPane.tsx:16) choose content for those areas. These are workbench modes, not separate route-level page shells.

The widgets inside the center area have three actual layout engines: [`FIXED`, `AUTO`, and `ANVIL`](app/client/src/layoutSystems/types/index.ts:6). [getLayoutSystemType](app/client/src/selectors/layoutSystemSelectors.ts:29) chooses from application positioning, defaults to Fixed, and gates Anvil by feature flags. [CanvasFactory](app/client/src/layoutSystems/CanvasFactory.tsx:22) selects editor/viewer canvases. The [Fixed](app/client/src/layoutSystems/fixedlayout/canvas/FixedLayoutEditorCanvas.tsx:28), [Auto](app/client/src/layoutSystems/autolayout/canvas/AutoLayoutEditorCanvas.tsx:20), and [Anvil](app/client/src/layoutSystems/anvil/editor/canvas/AnvilEditorCanvas.tsx:21) editors contain actual widget drag/drop behavior; the outer page shell does not.

## Reusable ADS templates

The ADS [template export list](app/client/packages/design-system/ads/src/Templates/index.ts:1) contains [IDEHeader](app/client/packages/design-system/ads/src/Templates/IDEHeader/IDEHeader.tsx:62) with left/center/right slots, [IDESidebar](app/client/packages/design-system/ads/src/Templates/Sidebar/Sidebar.tsx:6) driven by button configuration, [EntityExplorer](app/client/packages/design-system/ads/src/Templates/EntityExplorer/ExplorerContainer/ExplorerContainer.tsx:6), editable entity names/tabs, entity tab headers, and context menus. These are presentational building blocks. ADS does not export a complete one-piece AppIDE, marketplace, or admin page.

## Our integration routes in this checkout

[src/index.tsx](app/client/src/index.tsx:39) diverts `/standalone`, `/workspace`, `/marketplace`, `/admin`, `/operations`, and `/view` into integration-owned entries before the stock AppRouter runs. These currently have their own [workbench shell](app/client/src/integration/standalone/index.tsx:307), [dashboard catalog](app/client/src/integration/workspace-ui/DashboardCatalog.tsx:72), [marketplace shell](app/client/src/integration/marketplace-ui/MarketplacePage.tsx:46), [admin shell](app/client/src/integration/admin-ui/AdminShell.tsx:45), and [viewer shell](app/client/src/integration/viewer-ui/ViewerShell.tsx:17). The admin shell shares the extracted Appsmith SettingsLayout; the others are currently separate compositions.

For our product, the closest stock references are Templates for the marketplace, Applications for the dashboard catalog, AppIDE for the workbench, Admin Settings for administration, workspace settings for group detail, and AppViewer for published dashboards. Reusing a presentational template or extracted frame does not automatically bring over the Appsmith backend actions embedded in its route container.
