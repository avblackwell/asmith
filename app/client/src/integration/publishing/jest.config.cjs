// Runs the repository's fetch contract tests without Appsmith's browser setup.
module.exports = {
  rootDir: "../../..",
  roots: ["<rootDir>/src/integration/publishing"],
  testEnvironment: "node",
  transform: {
    "^.+\\.(ts|tsx)$": ["ts-jest", { isolatedModules: true }],
  },
};
