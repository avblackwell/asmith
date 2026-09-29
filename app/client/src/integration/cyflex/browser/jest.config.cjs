module.exports = {
  rootDir: "../../../..",
  testEnvironment: "node",
  testMatch: ["<rootDir>/src/integration/cyflex/browser/*.test.ts"],
  moduleNameMapper: { "^(\\.{1,2}/.*)\\.js$": "$1" },
  transform: {
    "^.+\\.tsx?$": [
      "<rootDir>/node_modules/ts-jest",
      { isolatedModules: true },
    ],
  },
};
