module.exports = {
  rootDir: "../../..",
  roots: ["<rootDir>/src/integration/theme-assets"],
  testEnvironment: "node",
  transform: {
    "^.+\\.(ts|tsx)$": ["ts-jest", { isolatedModules: true }],
  },
};
