module.exports = {
  rootDir: "../../..",
  testEnvironment: "node",
  testMatch: ["<rootDir>/src/integration/runtime/*.test.ts"],
  transform: {
    "^.+\\.tsx?$": [
      "<rootDir>/node_modules/ts-jest",
      { isolatedModules: true },
    ],
  },
};
