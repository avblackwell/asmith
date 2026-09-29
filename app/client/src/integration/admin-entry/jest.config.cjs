module.exports = {
  rootDir: "../../..",
  roots: ["<rootDir>/src/integration/admin-entry"],
  testEnvironment: "node",
  transform: {
    "^.+\\.(ts|tsx)$": ["ts-jest", { isolatedModules: true }],
  },
};
