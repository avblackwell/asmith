module.exports = {
  rootDir: "../../..",
  testEnvironment: "node",
  testMatch: ["<rootDir>/src/integration/widget-palette/*.test.ts"],
  moduleDirectories: ["node_modules", "<rootDir>/src"],
  transform: {
    "^.+\\.tsx?$": ["<rootDir>/node_modules/ts-jest", { isolatedModules: true }],
  },
};
