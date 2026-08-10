module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  rootDir: '.',
  testMatch: ['<rootDir>/__tests__/integration/**/*.test.ts'],
  testTimeout: 20000,
};
