// Install the standalone API boundary before the other entrypoint imports run.
import "integration/standalone/networkGuard";
// This file must be executed as early as possible to ensure the preloads are triggered ASAP
import "./preload-route-chunks";
// Initialise eval worker instance
import "utils/workerInstances";
// Populate the widget loader registry (side effect of importing the barrel).
// Consumers (EvaluationsSaga, EditorUtils) read loaders from `widgets/registry`,
// so this import is what registers them on the main thread.
import "widgets";

import React from "react";
import "./wdyr";
import ReactDOM from "react-dom";
import { Provider } from "react-redux";
import "./index.css";
import "@appsmith/ads-old/src/themes/default/index.css";
import "@appsmith/ads/src/__theme__/default/index.css";
import { ThemeProvider } from "styled-components";
import { appInitializer } from "utils/AppUtils";
import store, { runSagaMiddleware } from "./store";
import { LayersContext, Layers } from "constants/Layers";
import AppRouter from "ee/AppRouter";
import { getCurrentThemeDetails } from "selectors/themeSelectors";
import { connect } from "react-redux";
import type { DefaultRootState } from "react-redux";
import { Toast } from "@appsmith/ads";
import "./assets/styles/index.css";
import "./polyfills";
import GlobalStyles from "globalStyles";
// enable autofreeze only in development

import AppErrorBoundary from "./AppErrorBoundry";
import log from "loglevel";
import { FaroErrorBoundary } from "@grafana/faro-react";

const isStandalone = /^\/standalone(?:\/|$)/.test(window.location.pathname);
const isWorkspace = /^\/workspace(?:\/|$)/.test(window.location.pathname);
const isMarketplace = /^\/marketplace(?:\/|$)/.test(window.location.pathname);
const isAdmin = /^\/(?:admin|operations)(?:\/|$)/.test(
  window.location.pathname,
);
const isViewer = /^\/view(?:\/|$)/.test(window.location.pathname);
const isIntegrationRoute =
  isStandalone || isWorkspace || isMarketplace || isAdmin || isViewer;

if (isIntegrationRoute) {
  const module = isMarketplace
    ? import("integration/marketplace-entry")
    : isAdmin
      ? import("integration/admin-entry")
      : isWorkspace
        ? import("integration/workspace-entry")
        : isViewer
          ? import("integration/viewer-entry")
          : import("integration/standalone");

  void module
    .then(async (entry) => {
      const root = document.getElementById("root") as HTMLElement;

      if ("startMarketplace" in entry) return entry.startMarketplace(root);

      if ("startAdmin" in entry) return entry.startAdmin(root);

      if ("startWorkspace" in entry) return await entry.startWorkspace(root);

      if ("startViewer" in entry) return await entry.startViewer(root);

      return await entry.startStandalone(root);
    })
    .catch((error) => {
      log.error("Dashboard integration page failed to start", error);
      ReactDOM.render(
        <div role="alert">Dashboard page failed to start: {String(error)}</div>,
        document.getElementById("root"),
      );
    });
} else {
  runSagaMiddleware();
  appInitializer();

  (async () => {
    try {
      await import(
        /* webpackChunkName: "instrumentation" */ "./instrumentation"
      );
    } catch (e) {
      log.error("Error loading telemetry script", e);
    }
  })();
}

function App() {
  return (
    <FaroErrorBoundary fallback={<div>An error has occured</div>}>
      <Provider store={store}>
        <LayersContext.Provider value={Layers}>
          <ThemedAppWithProps />
        </LayersContext.Provider>
      </Provider>
    </FaroErrorBoundary>
  );
}

class ThemedApp extends React.Component<{
  // TODO: Fix this the next time the file is edited
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  currentTheme: any;
}> {
  render() {
    return (
      <ThemeProvider theme={this.props.currentTheme}>
        <Toast />
        <GlobalStyles />
        <AppErrorBoundary>
          <AppRouter />
        </AppErrorBoundary>
      </ThemeProvider>
    );
  }
}
const mapStateToProps = (state: DefaultRootState) => ({
  currentTheme: getCurrentThemeDetails(state),
});

const ThemedAppWithProps = connect(mapStateToProps)(ThemedApp);

if (!isIntegrationRoute) {
  ReactDOM.render(<App />, document.getElementById("root"));
}

// expose store when run in Cypress
// TODO: Fix this the next time the file is edited
// eslint-disable-next-line @typescript-eslint/no-explicit-any
if ((window as any).Cypress) {
  // TODO: Fix this the next time the file is edited
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (window as any).store = store;
}
