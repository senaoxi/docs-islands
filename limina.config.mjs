import { defineConfig } from 'limina';

const overlapConfig = [
  'tsconfig.json',
  'packages/vitepress/**/tsconfig.json',
  'packages/logaria/tsconfig.json',
  'packages/limina/tsconfig.json',
  'packages/core/tsconfig.json',
];

export default defineConfig({
  // Shared checker source config coverage used by graph, proof, paths, and typecheck checks.
  config: {
    checkers: {
      typescript: {
        preset: 'tsgo',
        include: ['utils/tsconfig.json', 'packages/**/tsconfig.json'],
        exclude: ['**/docs/**', ...overlapConfig],
      },
      vue: {
        preset: 'vue-tsc',
        include: ['**/docs/**/tsconfig.json', ...overlapConfig],
      },
    },
    source: {
      include: [
        '**/*.ts',
        '**/*.d.ts',
        '**/*.tsx',
        '**/*.js',
        '**/*.mjs',
        '**/*.json',
        '**/*.vue',
        '**/eslint.config.mjs',
        '**/.vitepress/**/*.ts',
        '**/.vitepress/**/*.d.ts',
        '**/.vitepress/**/*.tsx',
        '**/.vitepress/**/*.vue',
      ],
      exclude: [
        'nx.json',
        'project.json',
        'tsconfig.json',
        '**/tsconfig.*.json',
        'vercel.json',
        '**/.vitepress/dist',
        '.prettierrc.json',
        '.markdownlint.json',
        'dist',
        '.nx',
        '.git',
        '.tsbuild',
        'coverage',
        'node_modules',
      ],
    },
  },

  // Workspace dependency usages that static source and package script analysis
  // cannot see.
  source: {
    knip: {
      workspaces: {
        '@docs-islands/vitepress': {
          entry: [
            {
              files: ['packages/vitepress/src/**/__tests__/**'],
              reason:
                'All test modules are used as entry modules for actual usage coverage analysis and unused dependency entry sources.',
            },
            // TODO: Needs optimization
            {
              files: ['packages/vitepress/theme/**'],
              reason:
                'Components will temporarily follow the build process and expose build artifacts.',
            },
            {
              files: ['packages/vitepress/rolldown.theme.config.ts'],
              reason: 'Build configuration items need to be entry modules.',
            },
          ],
        },
        '@docs-islands/core': {
          entry: [
            {
              files: ['packages/core/src/**/__tests__/**'],
              reason:
                'All test modules are used as entry modules for actual usage coverage analysis and unused dependency entry sources.',
            },
          ],
        },
        'logaria-plugin-test': {
          entry: [
            {
              files: ['packages/logaria/src/plugin/__tests__/**'],
              reason:
                'All test modules are used as entry modules for actual usage coverage analysis and unused dependency entry sources.',
            },
          ],
        },
        '@docs-islands/vitepress-docs': {
          ignoreDependencies: [
            {
              dep: 'logaria',
              reason:
                '@docs-islands/vitepress does not yet support TypeScript Language Service.',
            },
          ],
        },
        '@docs-islands/logaria-docs': {
          ignoreDependencies: [
            {
              dep: 'logaria',
              reason:
                'The docs package keeps the workspace package installed for VitePress Markdown examples; those fenced examples are not executable Knip entries.',
            },
          ],
        },
      },
    },
  },

  // TypeScript project graph policy. This checks project references,
  // cross-project imports, workspace source dependencies, and label-based graph
  // boundaries.
  graph: {
    // Label-based package and declaration boundary rules. Labels are declared
    // inside source tsconfig*.json files with liminaOptions.graphRules.
    rules: {
      'runtime-client': {
        deny: {
          deps: [
            {
              name: 'node:*',
              reason: 'client runtime must stay free of Node builtin imports',
            },
          ],
          refs: [
            {
              path: 'packages/vitepress/src/node/tsconfig.json',
              reason: 'client runtime must not depend on node runtime',
            },
          ],
        },
      },
      'runtime-shared': {
        deny: {
          deps: [
            {
              name: 'node:*',
              reason:
                'shared runtime must stay portable across client and node runtimes',
            },
          ],
          refs: [
            {
              path: 'packages/vitepress/src/node/tsconfig.json',
              reason: 'shared runtime must stay independent of node runtime',
            },
            {
              path: 'packages/vitepress/src/client/tsconfig.json',
              reason: 'shared runtime must stay independent of client runtime',
            },
          ],
        },
      },
    },
  },

  // Typecheck coverage proof. Source files must be covered by checker entries
  // or an explicit allowlist entry.
  proof: {
    // Intentional exceptions. Each entry must explain why it is safe.
    allowlist: [
      {
        file: 'packages/vitepress/src/shared/internal/client-runtime.d.ts',
        reason: `
          This is a non-user-facing module that will be copied into the artifacts during the build process.
          Since TypeScript follows the single source file principle and cannot govern it,
          it is treated as a known reachable module here.
        `,
      },
    ],
  },
  // Published package checks. These validate the actual dist output that
  // consumers install: package exports, type resolution, and import boundaries.
  package: {
    // Each entry is one built package output to check.
    entries: [
      {
        name: 'logaria',
        outDir: 'packages/logaria/dist',
      },
      {
        name: 'limina',
        outDir: 'packages/limina/dist',
        boundary: {
          environment: 'node',
        },
      },
      {
        name: '@docs-islands/vitepress',
        outDir: 'packages/vitepress/dist',
      },
    ],
  },

  release: {
    contentHash: {
      baselineTag: 'latest',
      builtinIgnore: true,
    },
  },

  // Reusable command pipelines. Run them with `limina check <name>`.
  pipelines: {
    // Main typecheck pipeline: run graph checks, source authority checks,
    // proof checks, and the configured checker entries.
    typecheck: [
      'graph:check',
      'source:check',
      'proof:check',
      'checker:build',
      'checker:typecheck',
    ],
    // Default TypeScript project-reference graph check.
    graph: [
      'graph:prepare',
      'graph:check',
      {
        type: 'command',
        command: 'tsgo',
        args: [
          '-b',
          '.limina/tsconfig/checkers/typescript/tsconfig.build.json',
          '--pretty',
          'false',
        ],
      },
    ],
    // Production library/runtime declaration graph.
    lib: [
      'graph:prepare',
      {
        type: 'command',
        command: 'tsgo',
        args: [
          '-b',
          '.limina/tsconfig/checkers/typescript/tsconfig.build.json',
          '--pretty',
          'false',
        ],
      },
    ],
    // Source-owned Vue SFC checks that are intentionally outside native tsc -b.
    // Prefer vue-tsc here: current vue-tsgo --build does not preserve
    // TypeScript project-reference boundaries or support incremental builds.
    vue: [
      'graph:prepare',
      {
        type: 'command',
        command: 'vue-tsc',
        args: [
          '-b',
          '.limina/tsconfig/checkers/vue/tsconfig.build.json',
          '--pretty',
          'false',
        ],
      },
    ],
    // Validation pipeline for consumer docs, playground, and smoke projects.
    consumer: [
      {
        type: 'command',
        command: 'pnpm',
        args: ['--filter', '@docs-islands/plugin-license', 'build'],
      },
      {
        type: 'command',
        command: 'pnpm',
        args: ['--filter', '@docs-islands/vitepress', 'build'],
      },
      {
        type: 'command',
        command: 'pnpm',
        args: ['--dir', 'packages/vitepress/docs', 'typecheck'],
      },
      {
        type: 'command',
        command: 'pnpm',
        args: ['--dir', 'packages/vitepress/playground', 'typecheck'],
      },
      {
        type: 'command',
        command: 'pnpm',
        args: ['--dir', 'packages/vitepress/smoke', 'typecheck'],
      },
    ],
    // Package artifact checks for dist output.
    package: ['package:check'],
    // Governance checks to run before publishing.
    publish: [
      'graph:check',
      'source:check',
      'proof:check',
      'package:check',
      'release:check',
    ],
  },
});
