# Browser-local dashboard drafts

`IndexedDbDraftStore` stores validated `DashboardDocument` packages in IndexedDB. Its key contains the marketplace deployment ID, signed-in account ID, and document ID. Callers must obtain the account ID from the marketplace session and use a stable deployment ID that changes when they switch marketplace installations.

`save(scope, document, expectedRevision)` snapshots validated JSON before opening IndexedDB. It creates revision 1 when the expected revision is `null`, then requires the revision returned by `load` or the previous save. A stale tab gets `DraftConflictError` and must reload or explicitly resolve the difference. Each successful save keeps up to 20 previous snapshots; `restore` creates a new revision from one of them. A failed transaction, including a quota failure, leaves the prior copy intact and propagates the error so the UI can offer file export.

`list` returns both readable drafts and errors for damaged records. If only an old history snapshot is damaged, `load` still returns the current document with `historyIssue` set. Saving then raises `DraftCorruptHistoryError` so the raw record is preserved for recovery. Export the current document before any manual repair.

These drafts stay in the current browser profile and may be evicted by the browser. They are not shared marketplace items, and saving them never uploads content. The editor should label local save and marketplace publication separately.

From `app/client`, run `node scripts/verify-integration-drafts.cjs` to exercise native IndexedDB in Chromium. Set `PLAYWRIGHT_BROWSER_CHANNEL` if Chrome is not the desired local browser channel. This check uses a synthetic local page and contacts no backend.
