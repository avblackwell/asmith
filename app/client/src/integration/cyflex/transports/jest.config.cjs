module.exports = {
  rootDir: "../../../..",
  testEnvironment: "node",
  testMatch: ["<rootDir>/src/integration/cyflex/transports/*.test.ts"],
  transform: {
    "^.+\\.tsx?$": [
      "<rootDir>/node_modules/ts-jest",
      { isolatedModules: true },
    ],
  },
};
