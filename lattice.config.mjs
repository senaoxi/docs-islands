import { defineConfig } from '@docs-islands/lattice/config';

// Project kinds that are part of published or runtime builds. The graph rules
// reuse this list to keep production code away from tests and tooling code.
const productionKinds = [
  'lib',
  'runtime-client',
  'runtime-node',
  'runtime-shared',
  'types',
];

// Project kinds that are not solution aggregators. Build leaf projects should
// depend on other leaves, not on tsconfig.graph.json-style aggregator configs.
const nonSolutionKinds = [...productionKinds, 'test', 'tools', 'unknown'];

export default defineConfig({
  // TypeScript project graph policy. This checks project references,
  // cross-project imports, package exports, and dependency direction by kind.
  graph: {
    // Root solution tsconfig used to discover governed projects.
    rootConfig: 'tsconfig.graph.json',
    // Production project kinds reused by rules such as forbiddenEdges.
    productionKinds,
    // Ordered matchers for classifying each tsconfig. Put specific rules first.
    projectKinds: [
      {
        // Solution configs aggregate references and should not be leaf deps.
        kind: 'solution',
        paths: ['tsconfig.graph.json', 'tsconfig.lib.graph.json'],
        suffixes: ['/tsconfig.graph.json', '/tsconfig.lib.graph.json'],
      },
      {
        // Tooling configs cover scripts such as build and migration utilities.
        kind: 'tools',
        paths: ['scripts/tsconfig.build.json'],
        suffixes: ['/tsconfig.tools.build.json'],
      },
      {
        // Shared runtime code must stay independent of node/client specifics.
        kind: 'runtime-shared',
        paths: ['packages/vitepress/src/shared/tsconfig.build.json'],
      },
      {
        // Node runtime code may use Node.js built-ins.
        kind: 'runtime-node',
        paths: ['packages/vitepress/src/node/tsconfig.build.json'],
      },
      {
        // Client runtime code runs in browsers and must not use Node-only APIs.
        kind: 'runtime-client',
        paths: ['packages/vitepress/src/client/tsconfig.build.json'],
      },
      {
        // Type entry projects usually only carry public declarations.
        kind: 'types',
        paths: [
          'packages/vitepress/src/types/tsconfig.build.json',
          'packages/vitepress/types/tsconfig.build.json',
        ],
      },
      {
        // Regular publishable library projects.
        kind: 'lib',
        suffixes: ['/tsconfig.lib.build.json'],
      },
      {
        // Test projects should only be used by test flows.
        kind: 'test',
        suffixes: ['/tsconfig.test.build.json'],
      },
    ],
    // Manual source ownership hints for folders that tsconfig includes cannot
    // describe clearly enough.
    inferredProjects: [
      {
        packageName: '@docs-islands/vitepress',
        project: 'packages/vitepress/src/types/tsconfig.build.json',
        sourcePrefix: 'packages/vitepress/src/types/',
      },
      {
        packageName: '@docs-islands/vitepress',
        project: 'packages/vitepress/types/tsconfig.build.json',
        sourcePrefix: 'packages/vitepress/types/',
      },
      {
        packageName: '@docs-islands/vitepress',
        project: 'packages/vitepress/src/shared/tsconfig.build.json',
        sourcePrefix: 'packages/vitepress/src/shared/',
      },
      {
        packageName: '@docs-islands/vitepress',
        project: 'packages/vitepress/src/node/tsconfig.build.json',
        sourcePrefix: 'packages/vitepress/src/node/',
      },
      {
        packageName: '@docs-islands/vitepress',
        project: 'packages/vitepress/src/client/tsconfig.build.json',
        sourcePrefix: 'packages/vitepress/src/client/',
      },
    ],
    // Dependency directions that are not allowed. Each reason is shown in
    // failure output so the fix is easier to understand.
    forbiddenEdges: [
      {
        fromKinds: productionKinds,
        toKinds: ['tools', 'test'],
        reason:
          'production library/runtime graph must not depend on tools or tests',
      },
      {
        fromKinds: ['tools'],
        toKinds: ['test'],
        reason: 'tools graph must not depend on tests',
      },
      {
        fromKinds: nonSolutionKinds,
        toKinds: ['solution'],
        reason:
          'build leaves must reference build leaves, not parent graph aggregators',
      },
      {
        fromKinds: ['runtime-client'],
        toKinds: ['runtime-node'],
        reason: 'client runtime must not depend on node runtime',
      },
      {
        fromKinds: ['runtime-shared'],
        toKinds: ['runtime-node', 'runtime-client'],
        reason: 'shared runtime must stay independent of node/client runtime',
      },
    ],
    // Project kinds that must not import Node.js built-ins such as fs or path.
    nodeBuiltinRules: [
      {
        kinds: ['runtime-client'],
        reason: 'client runtime must not import Node builtins',
      },
      {
        kinds: ['runtime-shared'],
        reason: 'shared runtime must not import Node builtins',
      },
    ],
  },
  // Typecheck coverage proof. Source files must be covered by the root graph,
  // a sidecar typecheck, or an explicit allowlist entry.
  proof: {
    // Consumer and fixture typecheck targets are verified by separate flows.
    ignoredTypecheckTargets: [
      'packages/vitepress/docs/tsconfig.json',
      'packages/vitepress/playground/tsconfig.json',
      'packages/vitepress/playground/tsconfig.test.json',
      'packages/vitepress/smoke/tsconfig.json',
      'packages/vitepress/smoke/tsconfig.test.json',
    ],
    // Extra typecheck targets outside the root graph, such as Vue SFC checks.
    sidecarTargets: [
      {
        config: 'docs/tsconfig.json',
        label: 'docs vue typecheck',
        tool: 'vue-tsc',
      },
      {
        config: 'packages/vitepress/theme/tsconfig.json',
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
    ],
  },
  // Published package checks. These validate the actual dist output that
  // consumers install: package exports, type resolution, and import boundaries.
  packageChecks: {
    // Each target is one built package output to check.
    targets: [
      {
        name: '@docs-islands/logger',
        distDir: 'packages/logger/dist',
      },
      {
        name: '@docs-islands/vitepress',
        distDir: 'packages/vitepress/dist',
        boundary: {
          // vitepress dist currently references utils, but this dependency is
          // handled separately at the publish boundary.
          ignoredExternalPackages: ['@docs-islands/utils'],
        },
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
        args: ['-p', 'packages/vitepress/theme/tsconfig.json', '--noEmit'],
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
