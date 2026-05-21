import { defineConfig } from '@docs-islands/lattice/config';

export default defineConfig({
  // Shared roots used by graph, proof, paths, and typecheck checks.
  config: {
    roots: {
      graph: 'tsconfig.graph.json',
      typecheck: 'tsconfig.json',
    },
    source: {
      include: ['**/*.{ts,tsx,cts,mts}', '**/*.d.{ts,cts,mts}', '**/*.json'],
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
  // cross-project imports, package exports, and label-based package boundaries.
  graph: {
    // Label-based package and build boundary rules. Labels are declared inside
    // tsconfig*.build.json with "lattice": "<label>".
    rules: {
      'runtime-client': {
        deny: {
          refs: [
            {
              path: 'packages/vitepress/src/node/tsconfig.lib.build.json',
              reason: 'client runtime must not depend on node runtime',
            },
          ],
        },
      },
      'runtime-shared': {
        deny: {
          refs: [
            {
              path: 'packages/vitepress/src/node/tsconfig.lib.build.json',
              reason: 'shared runtime must stay independent of node runtime',
            },
            {
              path: 'packages/vitepress/src/client/tsconfig.lib.build.json',
              reason: 'shared runtime must stay independent of client runtime',
            },
          ],
        },
      },
    },
  },
  // Typecheck coverage proof. Source files must be covered by the root graph,
  // a sidecar typecheck, or an explicit allowlist entry.
  proof: {
    // Extra typecheck targets outside the root graph, such as Vue SFC checks.
    sidecarTargets: [
      {
        config: 'docs/tsconfig.json',
        label: 'docs vue typecheck',
        tool: 'vue-tsc',
      },
      {
        config: 'packages/vitepress/docs/tsconfig.json',
        label: 'vitepress docs vue typecheck',
        tool: 'vue-tsc',
      },
      {
        config: 'packages/vitepress/theme/tsconfig.lib.json',
        label: 'vitepress theme vue typecheck',
        tool: 'vue-tsc',
      },
    ],
    // Intentional exceptions. Each entry must explain why it is safe.
    allowlist: [
      {
        file: 'packages/vitepress/src/shared/internal/client-runtime.d.ts',
        reason:
          'Declaration-only stub copied into dist for the injected client runtime; the matching runtime source is covered by the shared runtime graph leaf.',
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
  packageChecks: {
    // Each target is one built package output to check.
    targets: [
      {
        name: '@docs-islands/logger',
        outDir: 'packages/logger/dist',
      },
      {
        name: '@docs-islands/vitepress',
        outDir: 'packages/vitepress/dist',
      },
    ],
  },
  // Reusable command pipelines. Run them with `lattice check <name>`.
  pipelines: {
    // Main typecheck pipeline: build required plugins, then run graph checks,
    // proof checks, and the actual tsc/vue-tsc commands.
    typecheck: [
      {
        type: 'command',
        command: 'pnpm',
        args: ['--filter', '@docs-islands/plugin-license', 'build'],
      },
      'graph:check',
      'proof:check',
      'tsc:run',
      {
        type: 'command',
        command: 'vue-tsc',
        args: ['-p', 'docs/tsconfig.json', '--noEmit'],
      },
      {
        type: 'command',
        command: 'vue-tsc',
        args: ['-p', 'packages/vitepress/theme/tsconfig.lib.json', '--noEmit'],
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
    publish: ['graph:check', 'proof:check', 'package:check'],
  },
});
