import { defineConfig } from 'limina';

export default defineConfig({
  // Shared checker entries used by graph, proof, paths, and typecheck checks.
  config: {
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
      exclude: [
        'node_modules',
        'dist',
        '.git',
        '.tsbuild',
        'coverage',
        '**/tsconfig*.json',
        '**/package.json',
        '.prettierrc.json',
        '.markdownlint.json',
        'vercel.json',
      ],
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
      'graph:check',
      {
        type: 'command',
        command: 'tsc',
        args: ['-b', 'tsconfig.build.json', '--pretty', 'false'],
      },
    ],
    // Production library/runtime declaration graph.
    lib: [
      {
        type: 'command',
        command: 'tsc',
        args: ['-b', 'tsconfig.lib.build.json', '--pretty', 'false'],
      },
    ],
    // Source-owned Vue SFC checks that are intentionally outside native tsc -b.
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
      'proof:check',
      'package:check',
      'release:check',
    ],
  },
});
