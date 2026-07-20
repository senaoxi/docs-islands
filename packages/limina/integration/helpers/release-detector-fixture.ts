import { createHash } from 'node:crypto';

import type {
  DetectorFixtureDefinition,
  DetectorFixtureExpectation,
  FixtureSetupOperation,
  FixtureToolName,
  LocalRegistryPackageFile,
  LocalRegistryScenario,
} from './detector-fixture-types';
import { defineDetectorFixture } from './detector-fixture-types';

export const RELEASE_FIXTURE_ROOT_PACKAGE = '@fixture/release-root';
export const RELEASE_FIXTURE_WORKSPACE_PACKAGE = '@fixture/release-workspace';
export const RELEASE_FIXTURE_DEPENDENCY_PACKAGE = '@fixture/release-dependency';
export const RELEASE_FIXTURE_ROOT_SOURCE_MANIFEST =
  'packages/root/package.json';
export const RELEASE_FIXTURE_ROOT_OUTPUT_MANIFEST =
  'packages/root/dist/package.json';
export const RELEASE_FIXTURE_DEPENDENCY_SOURCE_MANIFEST =
  'packages/dependency/package.json';
export const RELEASE_FIXTURE_DEPENDENCY_OUTPUT_MANIFEST =
  'packages/dependency/dist/package.json';
export const RELEASE_FIXTURE_METADATA_PATH = '/%40fixture%2Frelease-dependency';
export const RELEASE_FIXTURE_TARBALL_PATH =
  '/tarballs/release-dependency-1.0.0.tgz';
export const RELEASE_FIXTURE_ROOT_TARBALL = 'fixture-release-root-1.0.0.tgz';

type Manifest = Readonly<Record<string, unknown>>;
type FileOverrides = Readonly<Record<string, string | null>>;

export interface ReleaseFixturePackageOptions {
  readonly outputFiles?: FileOverrides;
  readonly outputManifest?: Manifest;
  readonly sourceManifest?: Manifest;
}

export interface CreateReleaseDetectorFixtureOptions {
  readonly dependency?: false | ReleaseFixturePackageOptions;
  readonly expected: DetectorFixtureExpectation;
  readonly id: string;
  readonly registry?: LocalRegistryScenario;
  readonly releaseConfigSource?: string;
  readonly root?: ReleaseFixturePackageOptions;
  readonly tools?: readonly FixtureToolName[];
}

function stringifyJson(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function createRootSourceManifest(overrides: Manifest = {}): Manifest {
  return {
    name: RELEASE_FIXTURE_ROOT_PACKAGE,
    version: '1.0.0',
    ...overrides,
  };
}

function createRootOutputManifest(overrides: Manifest = {}): Manifest {
  return {
    exports: { '.': './index.js' },
    license: 'MIT',
    name: RELEASE_FIXTURE_ROOT_PACKAGE,
    type: 'module',
    types: './index.d.ts',
    version: '1.0.0',
    ...overrides,
  };
}

function createDependencySourceManifest(overrides: Manifest = {}): Manifest {
  return {
    name: RELEASE_FIXTURE_DEPENDENCY_PACKAGE,
    version: '1.0.0',
    ...overrides,
  };
}

export function createReleaseDependencyOutputManifest(
  overrides: Manifest = {},
): Manifest {
  return {
    exports: { '.': './index.js' },
    license: 'MIT',
    name: RELEASE_FIXTURE_DEPENDENCY_PACKAGE,
    type: 'module',
    types: './index.d.ts',
    version: '1.0.0',
    ...overrides,
  };
}

function mergeOutputFiles(
  packageManifest: Manifest,
  overrides: FileOverrides = {},
): Readonly<Record<string, string>> {
  const files: Record<string, string | null> = {
    'LICENSE.md': 'MIT\n',
    'README.md': '# Release fixture\n',
    'index.d.ts': 'export declare const value: number;\n',
    'index.js': 'export const value = 1;\n',
    'package.json': stringifyJson(packageManifest),
    ...overrides,
  };

  return Object.fromEntries(
    Object.entries(files).filter(
      (entry): entry is [string, string] => entry[1] !== null,
    ),
  );
}

export function createReleaseDependencyOutputFiles(
  options: ReleaseFixturePackageOptions = {},
): Readonly<Record<string, string>> {
  return mergeOutputFiles(
    createReleaseDependencyOutputManifest(options.outputManifest),
    options.outputFiles,
  );
}

export function createReleaseDependencyTarballFiles(
  options: ReleaseFixturePackageOptions = {},
): readonly LocalRegistryPackageFile[] {
  return Object.entries(createReleaseDependencyOutputFiles(options))
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([filePath, content]) => ({ content, path: filePath }));
}

export function createReleaseContentDiffEvidenceLine(options: {
  readonly kind: 'changed' | 'local-only' | 'remote-only';
  readonly localContent?: string;
  readonly path: string;
  readonly remoteContent?: string;
}): string {
  const localHash =
    options.localContent === undefined
      ? undefined
      : createHash('sha256').update(options.localContent).digest('hex');
  const remoteHash =
    options.remoteContent === undefined
      ? undefined
      : createHash('sha256').update(options.remoteContent).digest('hex');

  return [
    `${options.kind}: ${options.path}`,
    localHash ? `local=${localHash}` : undefined,
    remoteHash ? `remote=${remoteHash}` : undefined,
  ]
    .filter((value): value is string => value !== undefined)
    .join(' ');
}

function addFileOperations(
  operations: FixtureSetupOperation[],
  root: string,
  files: Readonly<Record<string, string>>,
): void {
  for (const [filePath, content] of Object.entries(files).sort(
    ([left], [right]) => left.localeCompare(right),
  )) {
    operations.push({
      content,
      kind: 'write-file',
      path: `repo/${root}/${filePath}`,
    });
  }
}

function createConfigSource(options: {
  readonly releaseConfigSource?: string;
}): string {
  return [
    'export default {',
    '  config: {},',
    '  package: {',
    '    entries: [',
    '      {',
    '        checks: [],',
    `        name: '${RELEASE_FIXTURE_WORKSPACE_PACKAGE}',`,
    "        outDir: 'packages/root/dist',",
    '      },',
    '    ],',
    '  },',
    '  pipelines: {',
    "    detector: ['release:check'],",
    '  },',
    ...(options.releaseConfigSource
      ? [`  release: ${options.releaseConfigSource},`]
      : []),
    '};',
    '',
  ].join('\n');
}

function createReleaseSetup(
  options: CreateReleaseDetectorFixtureOptions,
): readonly FixtureSetupOperation[] {
  const operations: FixtureSetupOperation[] = [
    {
      content: createConfigSource(options),
      kind: 'write-file',
      overwrite: true,
      path: 'repo/limina.config.mts',
    },
    {
      content: stringifyJson({
        name: RELEASE_FIXTURE_WORKSPACE_PACKAGE,
        private: true,
      }),
      kind: 'write-file',
      path: 'repo/package.json',
    },
    {
      content: 'packages:\n  - packages/*\n',
      kind: 'write-file',
      path: 'repo/pnpm-workspace.yaml',
    },
    {
      content: stringifyJson(
        createRootSourceManifest(options.root?.sourceManifest),
      ),
      kind: 'write-file',
      path: `repo/${RELEASE_FIXTURE_ROOT_SOURCE_MANIFEST}`,
    },
    {
      content: 'export {};\n',
      kind: 'write-file',
      path: 'repo/packages/root/src/index.ts',
    },
  ];
  const rootOutputManifest = createRootOutputManifest(
    options.root?.outputManifest,
  );
  addFileOperations(
    operations,
    'packages/root/dist',
    mergeOutputFiles(rootOutputManifest, options.root?.outputFiles),
  );

  if (options.dependency !== false) {
    const dependency = options.dependency ?? {};
    operations.push(
      {
        content: stringifyJson(
          createDependencySourceManifest(dependency.sourceManifest),
        ),
        kind: 'write-file',
        path: `repo/${RELEASE_FIXTURE_DEPENDENCY_SOURCE_MANIFEST}`,
      },
      {
        content: 'export {};\n',
        kind: 'write-file',
        path: 'repo/packages/dependency/src/index.ts',
      },
    );
    addFileOperations(
      operations,
      'packages/dependency/dist',
      createReleaseDependencyOutputFiles(dependency),
    );
  }

  return operations;
}

export function createReleaseDetectorFixture(
  options: CreateReleaseDetectorFixtureOptions,
): DetectorFixtureDefinition {
  const tools = options.tools ?? [];

  return defineDetectorFixture({
    command: ['check', 'detector'],
    copyPolicy: {
      excludedNames: [],
      includeBuildInfoFiles: false,
      includeOutputDirectories: true,
    },
    expected: options.expected,
    id: options.id,
    kind:
      options.registry !== undefined || tools.length > 0
        ? 'external-tool'
        : 'filesystem',
    registry: options.registry,
    setup: createReleaseSetup(options),
    tools,
  });
}
