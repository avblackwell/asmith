module.exports = {
  rootDir: "../../..",
  roots: ["<rootDir>/src/integration/components"],
  testEnvironment: "node",
  transform: {
    "^.+\\.(ts|tsx)$": ["ts-jest", { isolatedModules: true }],
  },
};
