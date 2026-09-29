import { safeMediaSource } from "./mediaSource";

// Appsmith DocumentViewerWidget/constants.ts and component/index.tsx.
export const SUPPORTED_EXTENSIONS = ["txt", "pdf", "docx", "ppt", "pptx", "xlsx", "xls"] as const;
export type DocumentViewerMode = "url" | "office" | "error";

export interface DocumentViewerConfig {
  url: string;
  viewer: DocumentViewerMode;
  errorMessage: string;
}

/** Port of Appsmith's URL, Dropbox, OneDrive and extension selection. */
export function getDocViewerConfigs(docUrl: string): DocumentViewerConfig {
  if (/^data:application\/(?:vnd\.|ms-excel)/i.test(docUrl)) {
    return { url: "", viewer: "error", errorMessage: "This base64 document format is not available in the operator display" };
  }
  if (/\s/.test(docUrl)) return { url: "", viewer: "error", errorMessage: "Provided URL / Base64 is invalid." };
  const safeUrl = safeMediaSource(docUrl, "document");
  if (!docUrl) return { url: "", viewer: "error", errorMessage: "No document url provided for viewer" };
  if (!safeUrl) return { url: "", viewer: "error", errorMessage: "Provided URL / Base64 is invalid." };

  if (/^data:/i.test(safeUrl)) {
    // Appsmith decodes DOCX/XLSX through mammoth/xlsx. The isolated viewer has
    // neither parser; PDF and text are browser-native and can use a data URL.
    return { url: safeUrl, viewer: "url", errorMessage: "" };
  }

  const parsed = new URL(safeUrl, typeof window === "undefined"
    ? "https://read-only-media.invalid/"
    : window.location.href);
  let url = safeUrl;
  let viewer: DocumentViewerMode = "url";

  if (parsed.hostname === "dropbox.com" || parsed.hostname.endsWith(".dropbox.com")) {
    // Appsmith requests the raw Dropbox response, rather than its sharing page.
    parsed.searchParams.delete("dl");
    parsed.searchParams.set("raw", "1");
    url = parsed.href;
    return { url, viewer, errorMessage: "" };
  }

  if (parsed.hostname === "onedrive.live.com") {
    const cid = parsed.searchParams.get("cid");
    const resid = parsed.searchParams.get("id");
    if (!cid || !resid) return { url: "", viewer: "error", errorMessage: "OneDrive document link is incomplete" };
    url = `https://onedrive.live.com/embed?cid=${encodeURIComponent(cid)}&resid=${encodeURIComponent(resid)}&em=2`;
    return { url, viewer, errorMessage: "" };
  }

  const fileName = parsed.pathname.split("/").pop() ?? "";
  const extension = fileName.includes(".") ? fileName.split(".").pop() ?? "" : "";
  if (extension) {
    if (!SUPPORTED_EXTENSIONS.includes(extension as typeof SUPPORTED_EXTENSIONS[number])) {
      return { url: "", viewer: "error", errorMessage: "Current file type is not supported" };
    }
    if (extension !== "txt" && extension !== "pdf") {
      if (!/^https:\/\//i.test(safeUrl)) {
        return { url: "", viewer: "error", errorMessage: "Office documents require a public HTTPS URL" };
      }
      viewer = "office";
    }
  }

  return { url, viewer, errorMessage: "" };
}

/** react-documents uses this Office embed endpoint for Appsmith's office mode. */
export function documentIframeSource(config: DocumentViewerConfig): string | undefined {
  if (config.viewer === "error") return undefined;
  return config.viewer === "office"
    ? `https://view.officeapps.live.com/op/embed.aspx?src=${encodeURIComponent(config.url)}`
    : config.url;
}
