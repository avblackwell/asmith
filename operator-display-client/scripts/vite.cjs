const fs = require("fs");
const path = require("path");
const { pathToFileURL } = require("url");

const localCli = path.resolve(__dirname, "../node_modules/vite/bin/vite.js");

if (!fs.existsSync(localCli)) {
  throw new Error("Vite is unavailable. Run pnpm install --frozen-lockfile in operator-display-client.");
}

process.argv[1] = localCli;
void import(pathToFileURL(localCli).href);
