import React from "react";
import { Button } from "@appsmith/ads";
import { MarketplaceHttpError } from "../../marketplace";
import type { MarketplacePageMeta } from "../../marketplace";

export function adminError(error: unknown, action: string): string {
  if (error instanceof MarketplaceHttpError) {
    if (error.status === 401)
      return "Your session has expired. Sign in and try again.";

    if (error.status === 403) return "You do not have permission to do that.";

    if (error.status === 404) return `${action} could not be found.`;

    return `${action} failed (HTTP ${error.status}).`;
  }

  return error instanceof Error && error.message
    ? `${action} failed: ${error.message.slice(0, 180)}`
    : `${action} failed. Please try again.`;
}

export function AdminPager({
  ariaLabel,
  busy,
  meta,
  onPage,
}: {
  ariaLabel: string;
  busy: boolean;
  meta: MarketplacePageMeta;
  onPage: (cursor: number) => void;
}): React.ReactElement | null {
  if (meta.previousCursor === null && meta.nextCursor === null) return null;

  return (
    <nav aria-label={ariaLabel} className="admin-entity__pager">
      <Button
        isDisabled={busy || meta.previousCursor === null}
        kind="secondary"
        onClick={() => {
          if (meta.previousCursor !== null) onPage(meta.previousCursor);
        }}
        size="sm"
      >
        Previous
      </Button>
      <span>
        Page {meta.currentPage} of {meta.totalPages}
      </span>
      <Button
        isDisabled={busy || meta.nextCursor === null}
        kind="secondary"
        onClick={() => {
          if (meta.nextCursor !== null) onPage(meta.nextCursor);
        }}
        size="sm"
      >
        Next
      </Button>
    </nav>
  );
}
