module.exports = {
  rootDir: "../../../..",
  testEnvironment: "node",
  testMatch: ["<rootDir>/src/integration/cyflex/resolution/*.test.ts"],
  transform: {
    "^.+\\.tsx?$": [
      "<rootDir>/node_modules/ts-jest",
      { isolatedModules: true },
    ],
  },
};
