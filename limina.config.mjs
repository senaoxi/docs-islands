import { defineConfig } from 'limina';

export default defineConfig({
  strict: true,
  // Shared checker entries used by graph, proof, paths, and typecheck checks.
  config: {
    /**
     * Note: The two reference trees built by tsconfig.build.json and
     * tsconfig.vue.build.json have common tsconfig*.dts.json leaf nodes.
     * Using tsgo may cause cache hit failure,
     * so the unified underlying implementation is maintained at the total entry point.
     */
    checkers: {
      typescript: {
        preset: 'tsc',
        entry: 'tsconfig.build.json',
      },
      vue: {
        preset: 'vue-tsc',
        entry: 'tsconfig.vue.build.json',
      },
    },
    source: {
      include: [
        '**/*.d.cts',
        '**/*.d.mts',
        '**/*.d.ts',
        '**/*.cts',
        '**/*.mts',
        '**/*.tsx',
        '**/*.vue',
        '**/*.ts',
        '**/eslint.config.mjs',
        '**/.vitepress/**/*.ts',
        '**/.vitepress/**/*.vue',
        '**/.vitepress/**/*.tsx',
        'packages/agents/package.json',
        'packages/core/package.json',
        'packages/limina/package.json',
        'packages/limina/schemas/*.json',
        'packages/logaria/package.json',
        'packages/vitepress/package.json',
        'utils/package.json',
        '**/local-data.json',
      ],
      exclude: [
        'node_modules',
        'dist',
        '.nx',
        '.git',
        '.tsbuild',
        'coverage',
        '**/tsconfig.json',
        '**/tsconfig.*.json',
        '**/project.json',
        '**/.vitepress/dist',
        '.prettierrc.json',
        '.markdownlint.json',
        'nx.json',
        'vercel.json',
      ],
      // Workspace dependencies used by configs, package scripts, operational JS,
      // or documentation examples that are outside tsconfig-owned source imports.
      unusedDependencies: {
        ignore: [
          {
            importer: '@docs-islands/vitepress-docs',
            dependency: 'logaria',
            reason:
              '@docs-islands/vitepress does not yet support TypeScript Language Service.',
          },
          {
            importer: '@docs-islands/core',
            dependency: 'limina',
            reason:
              'Invoked by package.json scripts for package checks outside static source imports.',
          },
          {
            importer: '@docs-islands/limina-docs',
            dependency: 'limina',
            reason:
              'Invoked by package.json scripts for docs typechecks outside static source imports.',
          },
          {
            importer: '@docs-islands/plugin-license',
            dependency: 'limina',
            reason:
              'Invoked by package.json scripts for package checks outside static source imports.',
          },
          {
            importer: '@docs-islands/utils',
            dependency: 'limina',
            reason:
              'Invoked by package.json scripts for package checks outside static source imports.',
          },
          {
            importer: '@docs-islands/vitepress',
            dependency: 'limina',
            reason:
              'Invoked by package.json scripts for package checks outside static source imports.',
          },
          {
            importer: '@docs-islands/eslint-config',
            dependency: 'limina',
            reason:
              'Invoked by package.json scripts for package checks outside static source imports.',
          },
          {
            importer: '@docs-islands/vitepress-playground',
            dependency: 'limina',
            reason:
              'Invoked by package.json scripts for playground typechecks outside static source imports.',
          },
          {
            importer: '@docs-islands/vitepress-smoke',
            dependency: 'limina',
            reason:
              'Invoked by package.json scripts for smoke typechecks outside static source imports.',
          },
          {
            importer: 'docs-islands-monorepo',
            dependency: 'limina',
            reason:
              'Imported by limina.config.mjs and invoked by root package.json scripts outside static source imports.',
          },
          {
            importer: 'logaria',
            dependency: 'limina',
            reason:
              'Invoked by package.json scripts for package checks outside static source imports.',
          },
        ],
      },
    },
  },
  // TypeScript project graph policy. This checks project references,
  // cross-project imports, workspace source dependencies, and label-based graph
  // boundaries.
  graph: {
    // Label-based package and declaration boundary rules. Labels are declared
    // inside tsconfig*.dts.json with "limina": "<label>".
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
              path: 'packages/vitepress/src/node/tsconfig.dts.json',
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
              path: 'packages/vitepress/src/node/tsconfig.dts.json',
              reason: 'shared runtime must stay independent of node runtime',
            },
            {
              path: 'packages/vitepress/src/client/tsconfig.dts.json',
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
        reason:
          'Declaration-only stub copied into dist for the injected client runtime; the matching runtime source is covered by the shared runtime declaration leaf.',
      },
      {
        file: 'packages/vitepress/docs/en/guide/rendering-strategy-comps/react/local-data.json',
        reason:
          'Docs example runtime data is read through fs in the covered React component; TypeScript does not include standalone JSON files in the project file set.',
      },
      {
        file: 'packages/vitepress/docs/zh/guide/rendering-strategy-comps/react/local-data.json',
        reason:
          'Docs example runtime data is read through fs in the covered React component; TypeScript does not include standalone JSON files in the project file set.',
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
      'nx:check',
      'proof:check',
      'checker:build',
      'checker:typecheck',
    ],
    // Default TypeScript project-reference graph check.
    graph: [
      'graph:check',
      {
        type: 'command',
        command: 'tsgo',
        args: ['-b', 'tsconfig.build.json', '--pretty', 'false'],
      },
    ],
    // Production library/runtime declaration graph.
    lib: [
      {
        type: 'command',
        command: 'tsgo',
        args: ['-b', 'tsconfig.lib.build.json', '--pretty', 'false'],
      },
    ],
    // Source-owned Vue SFC checks that are intentionally outside native tsc -b.
    // Prefer vue-tsc here: current vue-tsgo --build does not preserve
    // TypeScript project-reference boundaries or support incremental builds.
    vue: [
      {
        type: 'command',
        command: 'vue-tsc',
        args: ['-b', 'tsconfig.vue.build.json', '--pretty', 'false'],
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
      'nx:check',
      'proof:check',
      'package:check',
      'release:check',
    ],
  },
});
