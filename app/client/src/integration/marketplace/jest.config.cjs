// Fetch contract tests do not need Appsmith's browser-wide setup or native canvas.
module.exports = {
  rootDir: "../../..",
  roots: ["<rootDir>/src/integration/marketplace"],
  testEnvironment: "node",
  transform: {
    "^.+\\.(ts|tsx)$": ["ts-jest", { isolatedModules: true }],
  },
};
