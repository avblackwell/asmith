// Small browser-independent contract suites avoid the app-wide Jest setup.
module.exports = {
  rootDir: "../..",
  testEnvironment: "node",
  testMatch: [
    "<rootDir>/src/integration/document/validation.test.ts",
    "<rootDir>/src/integration/runtime/LiveBindingProjector.test.ts",
    "<rootDir>/src/integration/cyflex/frame.test.ts",
  ],
  moduleNameMapper: { "^(\\.{1,2}/.*)\\.js$": "$1" },
  transform: {
    "^.+\\.tsx?$": ["ts-jest", { isolatedModules: true }],
  },
};
