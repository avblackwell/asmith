import React from "react";
import type { AppsmithWidgetDsl } from "../../../document";
import parseFileData from "./FileParser";
import { FileDataTypes } from "./model";
import "@uppy/core/dist/style.css";
import "@uppy/dashboard/dist/style.css";
import "@uppy/webcam/dist/style.css";
import "./captureUpload.css";

export interface SelectedFile {
  type?: string;
  id: string;
  data: unknown;
  meta: Record<string, unknown>;
  name: string;
  size: number;
  dataFormat: FileDataTypes;
}

export interface NativeFilePickerViewProps {
  widget: AppsmithWidgetDsl;
  selectedFiles?: SelectedFile[];
  editor?: boolean;
  themePrimaryColor?: string;
  themeBorderRadius?: string;
  onMetaChange?: (meta: { selectedFiles: SelectedFile[]; isDirty: boolean }) => void;
  /** Product action execution is injected by the canvas owner when available. */
  onFilesSelected?: () => void;
}

const FILE_SIZE_LIMIT_FOR_BLOBS = 5000 * 1024;

function string(value: unknown, fallback: string): string {
  return typeof value === "string" && value.trim() && !value.includes("{{") ? value : fallback;
}
function number(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : fallback;
}

/** Appsmith FilePickerWidgetV2's lazy Uppy import list. */
async function importUppy() {
  const [Uppy, Dashboard, GoogleDrive, OneDrive, Url, Webcam] = await Promise.all([
    import("@uppy/core").then((m) => m.default),
    import("@uppy/dashboard").then((m) => m.default),
    import("@uppy/google-drive").then((m) => m.default),
    import("@uppy/onedrive").then((m) => m.default),
    import("@uppy/url").then((m) => m.default),
    import("@uppy/webcam").then((m) => m.default),
  ]);
  return { Uppy, Dashboard, GoogleDrive, OneDrive, Url, Webcam };
}

export function NativeFilePickerView(props: NativeFilePickerViewProps): React.ReactElement {
  const { widget } = props;
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState("");
  const uppyRef = React.useRef<any>();
  const initializingRef = React.useRef<Promise<any>>();
  const mountedRef = React.useRef(true);
  const filesRef = React.useRef(props.selectedFiles ?? []);
  const previousFileCountRef = React.useRef((props.selectedFiles ?? []).length);
  const propsRef = React.useRef(props);
  const largeBlobUrls = React.useRef(new Set<string>());
  filesRef.current = props.selectedFiles ?? [];
  propsRef.current = props;

  const allowedFileTypes = Array.isArray(widget.allowedFileTypes)
    ? widget.allowedFileTypes.filter((value): value is string => typeof value === "string") : [];
  const restrictionKey = JSON.stringify([
    allowedFileTypes, widget.maxNumFiles, widget.maxFileSize,
  ]);

  const init = React.useCallback(async () => {
    if (uppyRef.current) return uppyRef.current;
    if (initializingRef.current) return initializingRef.current;
    initializingRef.current = (async () => {
      const { Uppy, Dashboard, GoogleDrive, OneDrive, Url, Webcam } = await importUppy();
      const current = propsRef.current.widget;
      const allowed = Array.isArray(current.allowedFileTypes)
        ? current.allowedFileTypes.filter((value): value is string => typeof value === "string") : [];
      const uppy = Uppy({
        id: current.widgetId,
        autoProceed: false,
        allowMultipleUploads: true,
        debug: false,
        restrictions: {
          maxFileSize: number(current.maxFileSize, 5) * 1024 * 1024,
          maxNumberOfFiles: number(current.maxNumFiles, 1),
          minNumberOfFiles: null,
          allowedFileTypes: allowed.length && !allowed.includes("*") ? allowed : null,
        },
      });
      uppy.use(Dashboard, {
        target: "body", metaFields: [], inline: false, width: 750, height: 550,
        thumbnailWidth: 280, showLinkToFileUploadResult: true,
        showProgressDetails: false, hideUploadButton: false,
        hideProgressAfterFinish: false, note: null, closeAfterFinish: true,
        closeModalOnClickOutside: true, disableStatusBar: false,
        disableInformer: false, disableThumbnailGenerator: false,
        disablePageScrollWhenModalOpen: true, proudlyDisplayPoweredByUppy: false,
        onRequestCloseModal: () => (uppy.getPlugin("Dashboard") as any)?.closeModal(),
        locale: { strings: { closeModal: "Close" } },
      }).use(GoogleDrive, { companionUrl: "https://companion.uppy.io" })
        .use(Url, { companionUrl: "https://companion.uppy.io" })
        .use(OneDrive, { companionUrl: "https://companion.uppy.io/" });
      if (location.protocol === "https:") {
        uppy.use(Webcam, { onBeforeSnapshot: async () => Promise.resolve(),
          countdown: false, mirror: true, facingMode: "user", locale: {} });
      }
      uppy.on("file-removed", (_removed: unknown, reason: string) => {
        if (reason !== "removed-by-user" && reason !== "cancel-all") return;
        if (reason === "cancel-all" && !mountedRef.current) return;
        const oldFiles = filesRef.current;
        const ids = new Set(uppy.getFiles().map((file: { id: string }) => file.id));
        const nextFiles = reason === "cancel-all" ? [] : oldFiles.filter((file) => ids.has(file.id));
        for (const old of oldFiles) {
          if (!ids.has(old.id) && typeof old.data === "string" && largeBlobUrls.current.has(old.data)) {
            URL.revokeObjectURL(old.data);
            largeBlobUrls.current.delete(old.data);
          }
        }
        filesRef.current = nextFiles;
        propsRef.current.onMetaChange?.({ selectedFiles: nextFiles, isDirty: true });
      });
      uppy.on("files-added", async (files: Array<{
        id: string; data: Blob; type?: string; extension?: string;
        meta: Record<string, unknown>; size: number;
      }>) => {
        try {
          const newFiles = files.filter((file) => file.meta?.isInitializing !== true);
          if (!newFiles.length) return;
          const currentProps = propsRef.current;
          const dataType = Object.values(FileDataTypes).includes(currentProps.widget.fileDataType as FileDataTypes)
            ? currentProps.widget.fileDataType as FileDataTypes : FileDataTypes.Base64;
          const parsed = await Promise.all(newFiles.map(async (file, index): Promise<SelectedFile> => {
            const data = file.size < FILE_SIZE_LIMIT_FOR_BLOBS
              ? await parseFileData(file.data, dataType, file.type || "", file.extension || "",
                currentProps.widget.dynamicTyping !== false)
              : URL.createObjectURL(file.data);
            if (typeof data === "string" && data.startsWith("blob:")) largeBlobUrls.current.add(data);
            return {
              type: file.type, id: file.id, data, meta: file.meta,
              name: typeof file.meta?.name === "string" ? file.meta.name : `File-${index + filesRef.current.length}`,
              size: file.size, dataFormat: dataType,
            };
          }));
          const selectedFiles = [...filesRef.current, ...parsed];
          filesRef.current = selectedFiles;
          propsRef.current.onMetaChange?.({ selectedFiles, isDirty: true });
        } catch (cause) {
          if (mountedRef.current) setError(cause instanceof Error ? cause.message : "Could not read files");
        }
      });
      uppy.on("upload", () => propsRef.current.onFilesSelected?.());
      for (const selected of filesRef.current) {
        uppy.addFile({ name: selected.name, type: selected.type,
          data: new Blob([selected.data as BlobPart]), meta: { isInitializing: true } });
      }
      uppyRef.current = uppy;
      return uppy;
    })();
    return initializingRef.current;
  }, []);

  React.useEffect(() => {
    if (previousFileCountRef.current > 0 && filesRef.current.length === 0)
      uppyRef.current?.reset();
    previousFileCountRef.current = filesRef.current.length;
  }, [props.selectedFiles]);

  React.useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      const uppy = uppyRef.current;
      uppyRef.current = undefined;
      if (uppy) uppy.close();
    };
  }, []);

  React.useEffect(() => {
    if (!uppyRef.current) return;
    uppyRef.current.setOptions({ restrictions: {
      maxFileSize: number(widget.maxFileSize, 5) * 1024 * 1024,
      maxNumberOfFiles: number(widget.maxNumFiles, 1),
      minNumberOfFiles: null,
      allowedFileTypes: allowedFileTypes.length && !allowedFileTypes.includes("*")
        ? allowedFileTypes : null,
    } });
  }, [restrictionKey]);

  const openModal = async () => {
    if (props.editor || widget.isDisabled === true) return;
    setError(""); setLoading(true);
    try {
      const uppy = await init();
      if (mountedRef.current) uppy.getPlugin("Dashboard")?.openModal();
    } catch (cause) {
      if (mountedRef.current) setError(cause instanceof Error ? cause.message : "Could not open file picker");
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  };

  const count = filesRef.current.length;
  return <div className="od-capture-file-picker" data-native-widget="file-picker"
    style={{ "--od-capture-accent": string(widget.buttonColor, props.themePrimaryColor || "#03b365"),
      "--od-capture-radius": string(widget.borderRadius, props.themeBorderRadius || "0.375rem") } as React.CSSProperties}>
    <button type="button" disabled={widget.isDisabled === true || loading}
      title={error || undefined} onClick={openModal}
      style={{ boxShadow: string(widget.boxShadow, "none") }}>
      {loading ? "Loading..." : count ? `${count} files selected` : string(widget.label, "Select Files")}
    </button>
    {error && <span className="od-capture-error" role="alert">{error}</span>}
  </div>;
}
