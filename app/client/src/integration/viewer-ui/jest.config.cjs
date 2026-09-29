module.exports = {
  rootDir: "../../..",
  roots: ["<rootDir>/src/integration/viewer-ui"],
  testEnvironment: "node",
  moduleDirectories: ["node_modules", "<rootDir>/src"],
  moduleNameMapper: {
    "^(\\.{1,2}/.*)\\.js$": "$1",
    "\\.css$": "<rootDir>/src/integration/viewer-ui/styleMock.cjs",
  },
  transform: {
    "^.+\\.(ts|tsx)$": ["ts-jest", { isolatedModules: true }],
  },
};
