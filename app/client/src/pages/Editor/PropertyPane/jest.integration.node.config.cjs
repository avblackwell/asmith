/** Pure integration property filter tests do not need the browser Jest setup. */
module.exports = {
  rootDir: "../../../..",
  testEnvironment: "node",
  testMatch: [
    "<rootDir>/src/pages/Editor/PropertyPane/filterIntegrationPropertyControls.test.ts",
  ],
  transform: {
    "^.+\\.tsx?$": [
      "<rootDir>/node_modules/ts-jest",
      { isolatedModules: true },
    ],
  },
};
