import React from "react";
import { documentIframeSource, getDocViewerConfigs } from "./documentViewerModel";

export interface NativeDocumentViewerViewProps {
  docUrl?: string;
  widgetName?: string;
}

export function NativeDocumentViewerView({ docUrl = "", widgetName = "Document Viewer" }: NativeDocumentViewerViewProps): React.ReactElement {
  const config = React.useMemo(() => getDocViewerConfigs(docUrl), [docUrl]);
  const source = documentIframeSource(config);

  if (!source) {
    return <div data-native-widget="document-viewer" role="status" style={centeredError}>{config.errorMessage}</div>;
  }

  return <iframe
    data-native-widget="document-viewer"
    data-document-viewer={config.viewer}
    loading="lazy"
    referrerPolicy="no-referrer"
    src={source}
    style={{ border: 0, height: "100%", width: "100%", background: "#fff" }}
    title={widgetName}
  />;
}

const centeredError: React.CSSProperties = {
  alignItems: "center",
  background: "#fff",
  display: "flex",
  height: "100%",
  justifyContent: "center",
  width: "100%",
};
