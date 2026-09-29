/** Pure binary envelope tests without the app's browser-wide Jest setup. */
module.exports = {
  rootDir: "../../..",
  testEnvironment: "node",
  testMatch: ["<rootDir>/src/integration/cyflex/*.test.ts"],
  transform: {
    "^.+\\.tsx?$": [
      "<rootDir>/node_modules/ts-jest",
      { isolatedModules: true },
    ],
  },
};
