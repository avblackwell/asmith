module.exports = {
  rootDir: "../../..",
  roots: ["<rootDir>/src/integration/component-assets"],
  testEnvironment: "node",
  transform: {
    "^.+\\.(ts|tsx)$": ["ts-jest", { isolatedModules: true }],
  },
};
