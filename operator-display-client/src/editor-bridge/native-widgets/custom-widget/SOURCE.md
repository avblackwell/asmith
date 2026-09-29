# Fixed Custom widget source mapping

- Appsmith source: `app/client/src/widgets/CustomWidget/widget/index.tsx`,
  `component/index.tsx`, `component/customWidgetscript.js`,
  `component/reset.css`, `component/appsmithConsole.js`,
  `widget/defaultApp.ts`, and
  `pages/Editor/CustomWidgetBuilder/utility.ts`.
- The runtime script, console forwarding script, CSS reset, thumbnail, and
  default compiled and uncompiled source are copied from those files. The
  default source's documentation URL import is replaced by its checked-in
  literal URL. The srcDoc template and fixed iframe sandbox follow
  `CustomWidget/component/index.tsx`.
- `NativeCustomWidgetView` preserves Appsmith's ordered message acknowledgement,
  iframe-window source check, ready handshake, model/UI/theme notifications,
  `appsmith.updateModel`, `appsmith.triggerEvent`, height reporting, editor
  overlay, and widget style container. `model` meta resets to `defaultModel`.
- `compileSrcDoc` in its separate module follows the Appsmith builder's Babel
  React preset and Sass compilation. It is deliberately outside the runtime
  index so displaying a Custom widget does not load these compilers.
- `builderProtocol.ts` ports Appsmith's builder message types and event
  references without loading the compiler into the workbench. `builderModel.ts`
  ports Add Event name normalization and restrictions, event list updates, and
  the paired compiled/uncompiled source update payload.
- `AppsmithBuilderCodeEditor.tsx` extracts the CodeMirror path used by Appsmith's
  Custom Widget Builder: HTMLMIXED/CSS/JAVASCRIPT modes, duotone light theme,
  line numbers, folding, Appsmith key bindings, active line, and paste quote
  normalization. `AppsmithCustomWidgetBuilder.tsx` uses ADS HTML/Style/JS tabs,
  a live Fixed iframe preview, debugger pane, references, and split resize.
- The workbench `Edit source` control opens `/workbench/builder`. Its bridge
  uses Appsmith's `READY`/`READY_ACK`, `UPDATE_REFERENCES`, `PAUSE`/`RESUME`,
  `UPDATE_SRCDOC`, and `DISCONNECTED` messages. The parent validates the
  popup window and same-origin message. Redux/saga saves `srcDoc` and
  `uncompiledSrcDoc` together as one undoable document edit. The builder route
  loads separately from the workbench bundle and does not require an additional
  account request.

## Remaining integration contracts

- Appsmith's dynamic Add Event control, event rename/delete controls, and
  action selector are still absent from the operator property pane. The
  `builderModel.ts` patches and reference display recognize events already in
  a document, but users cannot author or bind a new event in this UI. The
  operator has no Appsmith action execution contract; `onTriggerEvent` reports
  events whose named action property exists but does not execute them.
- The editor copies the Appsmith Custom Builder's CodeMirror configuration
  rather than its entire `CodeEditor/index.tsx` dependency graph. That graph
  imports evaluator selectors, data tree, sagas, analytics, and broader
  completion modes. Appsmith's JS Tern autocomplete, evaluated-value hints,
  full debugger log handling, ReactJson reference tree, and template picker
  are not available here. The ADS tabs, source compile/save, iframe preview,
  and popup lifecycle are implemented and browser verified.
- The `defaultModel` builder reference reads local JSON or runtime model meta.
  Appsmith expressions in that field need the operator binding evaluator; an
  unresolved `{{...}}` expression appears as an empty model in the builder.
- The copied default app imports React from `esm.sh`, exactly as Appsmith's
  default does. It needs that URL reachable in the operator's browser; saved
  custom source with no external imports works offline.
- Fixed auto height reports measured padded pixels through `onHeightChange`;
  the native canvas connects it to the existing auto-height measurement path.
