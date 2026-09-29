import React from "react";
import { useSelector } from "react-redux";
import type { DefaultRootState } from "react-redux";
import { getCanvasWidgetsStructure } from "ee/selectors/entitiesSelector";
import Canvas from "pages/Editor/Canvas";
import { RunPanel } from "integration/workspace-ui/RunPanel";
import type { RunPanelProps } from "integration/workspace-ui/RunPanel";
import "./viewerShell.css";

export interface ViewerShellProps {
  title: string;
  itemId: number;
  run: RunPanelProps;
}

/** The published dashboard surface; its bootstrap must set APP_MODE.PUBLISHED. */
export function ViewerShell({
  itemId,
  run,
  title,
}: ViewerShellProps): React.ReactElement {
  const structure = useSelector(getCanvasWidgetsStructure);
  const canvasWidth = useSelector(
    (state: DefaultRootState) => state.ui.mainCanvas.width,
  );

  return (
    <div className="dashboard-viewer" data-testid="t--dashboard-viewer">
      <header className="dashboard-viewer__header">
        <div>
          <h1>{title}</h1>
          <p>Marketplace dashboard #{itemId}</p>
        </div>
        <a href="/workspace">Back to dashboard catalog</a>
      </header>
      <main
        aria-label="Dashboard viewer"
        className="dashboard-viewer__workspace"
      >
        <div className="dashboard-viewer__canvas">
          <Canvas canvasWidth={canvasWidth} widgetsStructure={structure} />
        </div>
        <aside aria-label="Run controls" className="dashboard-viewer__controls">
          <RunPanel {...run} />
        </aside>
      </main>
    </div>
  );
}
