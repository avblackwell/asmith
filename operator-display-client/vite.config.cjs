const fs = require("fs");
const path = require("path");
const { createRequire } = require("module");

const here = __dirname;
const localModules = path.join(here, "node_modules");
const adsEntry = path.join(localModules, "@appsmith/ads/src/index.ts");

if (!fs.existsSync(path.join(localModules, "vite")) || !fs.existsSync(adsEntry)) {
  throw new Error("Install operator-display-client dependencies before building (pnpm install --frozen-lockfile).");
}

const fromModules = createRequire(path.join(localModules, "package.json"));
const react = fromModules("@vitejs/plugin-react");
const svgr = fromModules("vite-plugin-svgr").default;

module.exports = {
  define: {
    "process.env.BLUEPRINT_NAMESPACE": JSON.stringify("bp3"),
    "process.env.REACT_APP_BLUEPRINT_NAMESPACE": JSON.stringify("bp3"),
  },
  plugins: [
    react(),
    svgr({
      svgrOptions: { exportType: "named", ref: true },
      include: "**/*.svg",
    }),
  ],
  resolve: {
    alias: [{ find: "@appsmith/ads", replacement: adsEntry }],
    dedupe: ["react", "react-dom", "styled-components"],
  },
  server: {
    host: "127.0.0.1",
    port: 3004,
    strictPort: true,
    proxy: {
      "/operator_display": {
        target:
          process.env.OPERATOR_DISPLAY_BACKEND_ORIGIN ||
          "http://127.0.0.1:8090",
        changeOrigin: true,
      },
    },
  },
};
