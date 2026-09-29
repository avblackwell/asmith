import React, { useCallback, useRef } from "react";
import { Button, IDEHeader, IDEHeaderTitle, Icon } from "@appsmith/ads";
import "./IntegrationHeader.css";

export interface IntegrationHeaderProps {
  documentName: string;
  editorLabel: string;
  titleText: string;
  canEditTitle: boolean;
  busy: boolean;
  hasUnsavedChanges: boolean;
  catalogHref?: string;
  onDocumentNameChange: (name: string) => void;
  onTitleTextChange: (title: string) => void;
  onSave: () => void | Promise<void>;
  onExport: () => void;
  onImport?: (file: File) => void | Promise<void>;
  onOpenRun?: () => void;
}

export interface IntegrationStatusBarProps {
  revision: number | null;
  hasUnsavedChanges: boolean;
  status: string;
  statusIsError: boolean;
  blockedAppsmithRequests: number;
}

const dashboardLogo = <Icon name="dashboard-line" size="lg" />;

/** The workbench header receives all data and actions from its host shell. */
export function IntegrationHeader({
  busy,
  canEditTitle,
  catalogHref,
  documentName,
  editorLabel,
  hasUnsavedChanges,
  onDocumentNameChange,
  onExport,
  onImport,
  onOpenRun,
  onSave,
  onTitleTextChange,
  titleText,
}: IntegrationHeaderProps) {
  const importInput = useRef<HTMLInputElement>(null);
  const handleSave = useCallback(() => void onSave(), [onSave]);
  const handleDocumentNameChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) =>
      onDocumentNameChange(event.target.value),
    [onDocumentNameChange],
  );
  const handleTitleTextChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) =>
      onTitleTextChange(event.target.value),
    [onTitleTextChange],
  );
  const handleOpenImport = useCallback(() => importInput.current?.click(), []);
  const handleImportChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];

      if (file) void onImport?.(file);

      event.target.value = "";
    },
    [onImport],
  );

  return (
    <div className="integration-header">
      <IDEHeader>
        <IDEHeader.Left logo={dashboardLogo}>
          <div className="integration-header__document-title">
            <IDEHeaderTitle title={documentName || "Untitled dashboard"} />
          </div>
          {hasUnsavedChanges && (
            <span
              className="integration-header__unsaved"
              title="Unsaved changes"
            >
              Unsaved
            </span>
          )}
        </IDEHeader.Left>
        <IDEHeader.Center>
          <span className="integration-header__editor-label">
            {editorLabel}
          </span>
        </IDEHeader.Center>
        <IDEHeader.Right>
          <Button
            data-testid="t--standalone-save"
            isDisabled={busy}
            kind="primary"
            onClick={handleSave}
            size="sm"
          >
            {busy ? "Working…" : "Save local draft"}
          </Button>
          <Button
            data-testid="t--standalone-export"
            kind="secondary"
            onClick={onExport}
            size="sm"
          >
            Export JSON
          </Button>
        </IDEHeader.Right>
      </IDEHeader>
      <div className="integration-header__fields">
        <label>
          <span>Dashboard name</span>
          <input
            aria-label="Dashboard name"
            disabled={busy}
            onChange={handleDocumentNameChange}
            value={documentName}
          />
        </label>
        <label>
          <span>Title text</span>
          <input
            aria-label="Title text"
            disabled={!canEditTitle || busy}
            onChange={handleTitleTextChange}
            value={titleText}
          />
        </label>
        <div className="integration-header__secondary-actions">
          {onOpenRun && (
            <Button kind="tertiary" onClick={onOpenRun} size="sm">
              Run
            </Button>
          )}
          {onImport && (
            <>
              <Button
                isDisabled={busy}
                kind="tertiary"
                onClick={handleOpenImport}
                size="sm"
              >
                Import JSON
              </Button>
              <input
                accept=".json,application/json"
                aria-label="Import dashboard JSON"
                className="integration-header__import-input"
                data-testid="t--standalone-import"
                disabled={busy}
                onChange={handleImportChange}
                ref={importInput}
                type="file"
              />
            </>
          )}
          {catalogHref && <a href={catalogHref}>Back to dashboard catalog</a>}
        </div>
      </div>
    </div>
  );
}

/** Local save and API boundary diagnostics in the editor's bottom bar. */
export function IntegrationStatusBar({
  blockedAppsmithRequests,
  hasUnsavedChanges,
  revision,
  status,
  statusIsError,
}: IntegrationStatusBarProps) {
  return (
    <footer
      className="integration-status-bar standalone-editor__status"
      role={statusIsError ? "alert" : "status"}
    >
      <span>{status}</span>
      <span data-testid="t--standalone-revision">
        Local revision: {revision ?? "none"}
        {hasUnsavedChanges ? " · unsaved changes" : ""}
      </span>
      <span>Appsmith API requests blocked: {blockedAppsmithRequests}</span>
    </footer>
  );
}
