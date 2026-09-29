# Frontend-only live binding projection

`LiveBindingProjector.ts` is adapted from
`app/client/src/integration/runtime/LiveBindingProjector.ts`. Its projection
rules and sample shape are retained. `TransientWidgetOverlay.ts` adapts the
pure class and property-copy helpers from
`app/client/src/integration/runtime-ui/TransientWidgetOverlay.tsx`; the
Appsmith React context/hook is omitted because this product controls its own
render lifecycle.

A validated dashboard defines `variables` and `bindings` separately from
Appsmith `{{...}}` widget expressions. The projector accepts a normalized
sample for one selected cell and returns updates for existing widget paths.
An overlay holds these display values in memory; `applyTransientWidgetProps`
uses structural copies and leaves the saved DSL untouched. The caller creates
one projector and one overlay per run and clears the overlay when that run
ends or the dashboard changes.

The product renderer accepts only `TEXT_WIDGET.text` and
`CHART_WIDGET.chartData.<series>.data` updates. This matches the guided binding
editor's exposed targets and prevents a document binding from changing widget
identity or layout through the display overlay.

This module does not resolve variables against a cell, decode Cyflex frames,
open NATS or control connections, evaluate `{{...}}` JavaScript, or provide
historical data before samples arrive. The normalized sample boundary remains
unverified against a live deployment. Run the local contract with
`node src/editor-bridge/live-bindings/contract.test.cjs` from
`operator-display-client`.
