export default {
  config: {
    checkers: {
      tsc: {
        include: ['alpha/tsconfig.json'],
      },
      tsgo: {
        include: ['beta/tsconfig.json'],
      },
    },
    source: {
      include: ['packages/**/*.ts'],
    },
  },
  pipelines: {
    detector: ['proof:check'],
  },
};
