/** @type {import('jest').Config} */
export default {
  testEnvironment: 'node',
  transform: {
    '^.+\\.ts$': '@swc/jest',
  },
  // Le code source écrit des imports relatifs en `.js` (résolution ESM / NodeNext),
  // alors que les fichiers réels sont en `.ts` : sans ce mapping, Jest (qui résout via
  // CommonJS après transform SWC) ne les trouverait pas.
  moduleNameMapper: {
    '^(\\.{1,2}/.*)\\.js$': '$1',
  },
  testMatch: ['**/*.spec.ts'],
};
