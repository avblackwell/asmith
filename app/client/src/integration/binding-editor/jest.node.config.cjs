/** Pure dashboard binding edits do not need the app's browser test setup. */
module.exports = {
  rootDir: "../../..",
  testEnvironment: "node",
  testMatch: [
    "<rootDir>/src/integration/binding-editor/model.test.ts",
    "<rootDir>/src/integration/binding-editor/VariableDiscoveryChooser.test.tsx",
  ],
  transform: {
    "^.+\\.tsx?$": [
      "<rootDir>/node_modules/ts-jest",
      { isolatedModules: true },
    ],
  },
};
