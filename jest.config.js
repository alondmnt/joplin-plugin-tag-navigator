module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/tests'],
  moduleNameMapper: {
    '^api$': '<rootDir>/tests/__mocks__/api.ts',
    '^api/types$': '<rootDir>/tests/__mocks__/api/types.ts',
  },
};
