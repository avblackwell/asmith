# Appsmith ADS subset

The source and assets in `src/` were copied from
`app/client/packages/design-system/ads/src` in this repository, at ADS version
2.1.43. `src/index.ts` is a product-owned export barrel that includes only the
components currently used by Operator Display. Run `node scripts/vendor-ads.cjs`
from the client root to audit the import closure; `--sync` refreshes the copied
files from the same repository revision. The sync script applies one type-only
cast in `Box/Box.styles.tsx` for compatibility between the isolated package's
`@xstyled/system` and `styled-components` typings; generated CSS is unchanged.

The original ADS `package.json` declares the ISC license. The parent Appsmith
repository carries the Apache License 2.0. The parent license text is included
as `LICENSE-APACHE-2.0`; original source comments and attribution remain in
the copied files. This subset is retained to reproduce Appsmith's actual
components and design tokens in the independent frontend.
