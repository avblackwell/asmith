module.exports = {
  rootDir: "../../..",
  roots: ["<rootDir>/src/integration/runtime-ui"],
  testEnvironment: "node",
  transform: {
    "^.+\\.(ts|tsx)$": ["ts-jest", { isolatedModules: true }],
  },
};
