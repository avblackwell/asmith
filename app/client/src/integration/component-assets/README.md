# Marketplace component packages

A component item stores a versioned `component` JSON package with one copied
`CONTAINER_WIDGET` or `STATBOX_WIDGET` subtree. The package includes only
variables and live bindings whose target widgets are inside that subtree.
`createComponentFromDashboard` captures a selected group from a validated
dashboard; `parseComponentPackage` validates imported or downloaded JSON using
the dashboard widget and binding contract.

`ComponentMarketplaceRepository` uses the existing Java marketplace item
routes. Browsing applies the exact `component` type filter. Publishing a new
item requires a thumbnail, while explicit replacement overwrites an existing
component item in place. The backend stores opaque content and does not enforce
schema, revision conflicts, or immutable versions.

Installation downloads and hashes the exact item bytes, copies the group into
the chosen canvas (root by default), places it below existing children, remaps
widget IDs/names and colliding variable and binding keys, and adds a pinned
`componentDependencies` entry. It returns a new validated dashboard without
mutating the input. The copied group does not follow later marketplace updates.
When a package with DSL version 89–93 enters a current version 94 dashboard,
installation runs Appsmith's actual page DSL migrator on a temporary canvas
before copying. It rejects future versions, older unverified versions, and
migrations that invalidate declared bindings. The dependency hash still refers
to the original downloaded bytes.
`unresolvedDynamicPaths` reports expressions the insertion helper could not
rewrite safely; the caller should display them for review. Canvas positioning
and renderer compatibility still need verification with real marketplace
component examples.
