module.exports = {
  rootDir: "../../..",
  roots: ["<rootDir>/src/integration/workspace"],
  testEnvironment: "node",
  transform: {
    "^.+\\.(ts|tsx)$": ["ts-jest", { isolatedModules: true }],
  },
};
