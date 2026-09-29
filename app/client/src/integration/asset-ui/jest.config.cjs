module.exports = {
  rootDir: "../../..",
  roots: ["<rootDir>/src/integration/asset-ui"],
  testEnvironment: "node",
  moduleNameMapper: {
    "^(\\.{1,2}/.*)\\.js$": "$1",
    "\\.css$": "<rootDir>/src/integration/asset-ui/styleMock.cjs",
  },
  transform: {
    "^.+\\.(ts|tsx)$": ["ts-jest", { isolatedModules: true }],
  },
};
