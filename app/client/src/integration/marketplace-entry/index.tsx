import React from "react";
import ReactDOM from "react-dom";
import { ThemeProvider } from "styled-components";
import { lightTheme } from "selectors/themeSelectors";
import { MarketplaceClient } from "integration/marketplace";
import { facetFromSearch } from "integration/marketplace-ui/catalogModel";
import { MarketplacePage } from "integration/marketplace-ui/MarketplacePage";
import { MarketplaceShell } from "integration/marketplace-ui/MarketplacePage";
import { ItemManagementScreen } from "integration/admin-ui/items/ItemManagementScreen";

function marketplaceRoute(pathname: string): {
  itemId: number | null;
  manage: boolean;
} {
  if (pathname === "/marketplace" || pathname === "/marketplace/") {
    return { itemId: null, manage: false };
  }

  const match = /^\/marketplace\/items\/([^/]+)(\/manage)?\/?$/.exec(pathname);

  if (!match) throw new TypeError("Marketplace route is not supported");

  const id = Number(match[1]);

  if (!/^[1-9]\d*$/.test(match[1]) || !Number.isSafeInteger(id)) {
    throw new TypeError("Marketplace item ID must be a positive integer");
  }

  return { itemId: id, manage: Boolean(match[2]) };
}

/** Runs without Appsmith's Redux/router/bootstrap API calls. */
export function startMarketplace(root: HTMLElement): void {
  const marketplace = new MarketplaceClient();
  const route = marketplaceRoute(window.location.pathname);

  ReactDOM.render(
    <ThemeProvider theme={lightTheme}>
      {route.manage && route.itemId !== null ? (
        <MarketplaceShell>
          <ItemManagementScreen client={marketplace} itemId={route.itemId} />
        </MarketplaceShell>
      ) : (
        <MarketplacePage
          initialFacet={facetFromSearch(window.location.search)}
          itemId={route.itemId}
          marketplace={marketplace}
        />
      )}
    </ThemeProvider>,
    root,
  );
}
