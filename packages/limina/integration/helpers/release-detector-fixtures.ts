import { createHash } from 'node:crypto';

import { LIMINA_CHECK_ISSUE_CODES } from '../../src/check-reporting/codes';
import type { ReleaseRegistryReason } from '../../src/package-check/release-findings';
import type {
  DetectorFixtureDefinition,
  DetectorFixtureExpectation,
  ExpectedEvidence,
  ExpectedIssue,
  LocalRegistryResponseBody,
  LocalRegistryScenario,
} from './detector-fixture-types';
import {
  createReleaseContentDiffEvidenceLine,
  createReleaseDependencyTarballFiles,
  createReleaseDetectorFixture,
  RELEASE_FIXTURE_DEPENDENCY_PACKAGE,
  RELEASE_FIXTURE_DEPENDENCY_SOURCE_MANIFEST,
  RELEASE_FIXTURE_METADATA_PATH,
  RELEASE_FIXTURE_ROOT_OUTPUT_MANIFEST,
  RELEASE_FIXTURE_ROOT_PACKAGE,
  RELEASE_FIXTURE_ROOT_SOURCE_MANIFEST,
  RELEASE_FIXTURE_ROOT_TARBALL,
  RELEASE_FIXTURE_TARBALL_PATH,
  type ReleaseFixturePackageOptions,
} from './release-detector-fixture';

const RELEASE_TASK = 'release:check' as const;
const ROOT_DEPENDENCY_SOURCE = {
  dependencies: {
    [RELEASE_FIXTURE_DEPENDENCY_PACKAGE]: 'workspace:*',
  },
};
const ROOT_DEPENDENCY_OUTPUT = {
  dependencies: {
    [RELEASE_FIXTURE_DEPENDENCY_PACKAGE]: '^1.0.0',
  },
};
const METADATA_REQUEST = {
  headers: { accept: 'application/json' },
  pathname: RELEASE_FIXTURE_METADATA_PATH,
} as const;
const TARBALL_REQUEST = {
  headers: { accept: 'application/octet-stream' },
  pathname: RELEASE_FIXTURE_TARBALL_PATH,
} as const;
const VALID_PLACEHOLDER_INTEGRITY = `sha512-${createHash('sha512')
  .update('release detector fixture placeholder')
  .digest('base64')}`;

function passExpectation(): DetectorFixtureExpectation {
  return {
    additionalCodes: [],
    exitCode: 0,
    issues: [],
  };
}

function failureExpectation(issue: ExpectedIssue): DetectorFixtureExpectation {
  return {
    additionalCodes: [],
    exitCode: 1,
    issues: [issue],
    primaryCode: issue.code,
  };
}

function packedOutputLocalSpecifierFixture(
  protocol: 'catalog' | 'file' | 'link' | 'workspace',
  specifier: string,
): DetectorFixtureDefinition {
  const id = `release/packed-output-${protocol}-specifier`;

  return createReleaseDetectorFixture({
    dependency: false,
    expected: failureExpectation({
      code: LIMINA_CHECK_ISSUE_CODES.releasePackedManifest,
      evidence: [
        { label: 'release reason', value: 'output-local-specifier' },
        {
          label: 'dependency',
          value: RELEASE_FIXTURE_DEPENDENCY_PACKAGE,
        },
        { label: 'dependency section', value: 'dependencies' },
        { label: 'dependency specifier', value: specifier },
        { label: 'package manifest' },
      ],
      filePath: RELEASE_FIXTURE_ROOT_OUTPUT_MANIFEST,
      packageManifestPath: RELEASE_FIXTURE_ROOT_OUTPUT_MANIFEST,
      packageName: RELEASE_FIXTURE_ROOT_PACKAGE,
      reason: 'output-local-specifier',
      task: RELEASE_TASK,
    }),
    id,
    root: {
      outputManifest: {
        dependencies: {
          [RELEASE_FIXTURE_DEPENDENCY_PACKAGE]: specifier,
        },
      },
    },
  });
}

function createRegistryScenario(options: {
  readonly expectedTarballRequest?: boolean;
  readonly metadataBody: LocalRegistryResponseBody;
  readonly metadataStatus?: number;
  readonly requestTimeoutMs?: number;
  readonly tarballBody?: LocalRegistryResponseBody;
  readonly tarballStatus?: number;
}): LocalRegistryScenario {
  return {
    expectedRequests: [
      METADATA_REQUEST,
      ...(options.expectedTarballRequest ? [TARBALL_REQUEST] : []),
    ],
    metadata: {
      body: options.metadataBody,
      status: options.metadataStatus,
    },
    packageName: RELEASE_FIXTURE_DEPENDENCY_PACKAGE,
    requestTimeoutMs: options.requestTimeoutMs,
    tarballs:
      options.tarballBody === undefined
        ? undefined
        : {
            [RELEASE_FIXTURE_TARBALL_PATH]: {
              body: options.tarballBody,
              status: options.tarballStatus,
            },
          },
  };
}

function packageMetadataBody(
  options: {
    readonly integrity?:
      | { readonly kind: 'actual' }
      | { readonly kind: 'mismatch' }
      | { readonly kind: 'omit' }
      | { readonly kind: 'value'; readonly value: unknown };
    readonly shasum?:
      | { readonly kind: 'actual' }
      | { readonly kind: 'mismatch' }
      | { readonly kind: 'omit' }
      | { readonly kind: 'value'; readonly value: unknown };
    readonly tarball?: boolean;
  } = {},
): LocalRegistryResponseBody {
  return {
    integrity: options.integrity ?? { kind: 'actual' },
    kind: 'package-metadata',
    shasum: options.shasum,
    tarballPath:
      options.tarball === false ? undefined : RELEASE_FIXTURE_TARBALL_PATH,
    version: '1.0.0',
  };
}

function validRegistryScenario(
  remoteDependency: ReleaseFixturePackageOptions = {},
): LocalRegistryScenario {
  return createRegistryScenario({
    expectedTarballRequest: true,
    metadataBody: packageMetadataBody(),
    tarballBody: {
      files: createReleaseDependencyTarballFiles(remoteDependency),
      kind: 'package-tarball',
    },
  });
}

function registryExpectedIssue(
  reason: ReleaseRegistryReason,
  evidence: readonly ExpectedEvidence[] = [],
): ExpectedIssue {
  return {
    code: LIMINA_CHECK_ISSUE_CODES.releaseRegistry,
    evidence: [
      { label: 'release reason', value: reason },
      { label: 'registry' },
      { label: 'dependency', value: RELEASE_FIXTURE_DEPENDENCY_PACKAGE },
      ...evidence,
    ],
    filePath: RELEASE_FIXTURE_DEPENDENCY_SOURCE_MANIFEST,
    packageManifestPath: RELEASE_FIXTURE_DEPENDENCY_SOURCE_MANIFEST,
    packageName: RELEASE_FIXTURE_DEPENDENCY_PACKAGE,
    reason,
    task: RELEASE_TASK,
  };
}

function registryFailureFixture(options: {
  readonly evidence?: readonly ExpectedEvidence[];
  readonly id: string;
  readonly reason: ReleaseRegistryReason;
  readonly scenario: LocalRegistryScenario;
}): DetectorFixtureDefinition {
  return createReleaseDetectorFixture({
    expected: failureExpectation(
      registryExpectedIssue(options.reason, options.evidence),
    ),
    id: options.id,
    registry: options.scenario,
    root: {
      outputManifest: ROOT_DEPENDENCY_OUTPUT,
      sourceManifest: ROOT_DEPENDENCY_SOURCE,
    },
  });
}

function contentHashIssue(options: {
  readonly evidence: readonly ExpectedEvidence[];
  readonly filePath: string;
  readonly reason?: 'config-invalid' | 'content-diff';
}): ExpectedIssue {
  const reason = options.reason ?? 'content-diff';

  return {
    code: LIMINA_CHECK_ISSUE_CODES.releaseContentHash,
    evidence: [
      { label: 'release reason', value: reason },
      { label: 'dependency', value: RELEASE_FIXTURE_DEPENDENCY_PACKAGE },
      {
        label: 'source manifest',
      },
      ...options.evidence,
    ],
    filePath: options.filePath,
    packageManifestPath: RELEASE_FIXTURE_DEPENDENCY_SOURCE_MANIFEST,
    packageName: RELEASE_FIXTURE_DEPENDENCY_PACKAGE,
    reason,
    task: RELEASE_TASK,
  };
}

const DEFAULT_REMOTE_DEPENDENCY_FILES = createReleaseDependencyTarballFiles();

const RELEASE_DETECTOR_FIXTURES = {
  'release/content-hash-builtin-ignore': createReleaseDetectorFixture({
    dependency: {
      outputFiles: {
        'docs/local-only.md': '# Generated docs\n',
      },
    },
    expected: passExpectation(),
    id: 'release/content-hash-builtin-ignore',
    registry: validRegistryScenario(),
    releaseConfigSource: '{ contentHash: { builtinIgnore: true } }',
    root: {
      outputManifest: ROOT_DEPENDENCY_OUTPUT,
      sourceManifest: ROOT_DEPENDENCY_SOURCE,
    },
  }),
  'release/content-hash-changed': createReleaseDetectorFixture({
    dependency: {
      outputFiles: {
        'index.js': 'export const value = 2;\n',
      },
    },
    expected: failureExpectation(
      contentHashIssue({
        evidence: [
          { label: 'baseline tag', value: 'latest' },
          { label: 'baseline version', value: '1.0.0' },
          {
            label: 'content hash diffs',
            lines: [
              createReleaseContentDiffEvidenceLine({
                kind: 'changed',
                localContent: 'export const value = 2;\n',
                path: 'index.js',
                remoteContent: 'export const value = 1;\n',
              }),
            ],
          },
        ],
        filePath: 'packages/dependency/dist/index.js',
      }),
    ),
    id: 'release/content-hash-changed',
    registry: validRegistryScenario(),
    root: {
      outputManifest: ROOT_DEPENDENCY_OUTPUT,
      sourceManifest: ROOT_DEPENDENCY_SOURCE,
    },
  }),
  'release/content-hash-config-invalid-baseline-tag':
    createReleaseDetectorFixture({
      expected: failureExpectation(
        contentHashIssue({
          evidence: [
            {
              label: 'config field',
              value: 'release.contentHash.baselineTag',
            },
          ],
          filePath: 'limina.config.mts',
          reason: 'config-invalid',
        }),
      ),
      id: 'release/content-hash-config-invalid-baseline-tag',
      releaseConfigSource: "{ contentHash: { baselineTag: () => '' } }",
      root: {
        outputManifest: ROOT_DEPENDENCY_OUTPUT,
        sourceManifest: ROOT_DEPENDENCY_SOURCE,
      },
    }),
  'release/content-hash-config-invalid-ignore': createReleaseDetectorFixture({
    expected: failureExpectation(
      contentHashIssue({
        evidence: [
          {
            label: 'config field',
            value: 'release.contentHash.ignore',
          },
        ],
        filePath: 'limina.config.mts',
        reason: 'config-invalid',
      }),
    ),
    id: 'release/content-hash-config-invalid-ignore',
    releaseConfigSource: '{ contentHash: { ignore: () => [123] } }',
    root: {
      outputManifest: ROOT_DEPENDENCY_OUTPUT,
      sourceManifest: ROOT_DEPENDENCY_SOURCE,
    },
  }),
  'release/content-hash-local-only': createReleaseDetectorFixture({
    dependency: {
      outputFiles: {
        'local-only.js': 'export const localOnly = true;\n',
      },
    },
    expected: failureExpectation(
      contentHashIssue({
        evidence: [
          {
            label: 'content hash diffs',
            lines: [
              createReleaseContentDiffEvidenceLine({
                kind: 'local-only',
                localContent: 'export const localOnly = true;\n',
                path: 'local-only.js',
              }),
            ],
          },
        ],
        filePath: 'packages/dependency/dist/local-only.js',
      }),
    ),
    id: 'release/content-hash-local-only',
    registry: validRegistryScenario(),
    root: {
      outputManifest: ROOT_DEPENDENCY_OUTPUT,
      sourceManifest: ROOT_DEPENDENCY_SOURCE,
    },
  }),
  'release/content-hash-remote-only': createReleaseDetectorFixture({
    expected: failureExpectation(
      contentHashIssue({
        evidence: [
          {
            label: 'content hash diffs',
            lines: [
              createReleaseContentDiffEvidenceLine({
                kind: 'remote-only',
                path: 'remote-only.js',
                remoteContent: 'export const remoteOnly = true;\n',
              }),
            ],
          },
        ],
        filePath: RELEASE_FIXTURE_DEPENDENCY_SOURCE_MANIFEST,
      }),
    ),
    id: 'release/content-hash-remote-only',
    registry: validRegistryScenario({
      outputFiles: {
        'remote-only.js': 'export const remoteOnly = true;\n',
      },
    }),
    root: {
      outputManifest: ROOT_DEPENDENCY_OUTPUT,
      sourceManifest: ROOT_DEPENDENCY_SOURCE,
    },
  }),
  'release/content-hash-user-ignore': createReleaseDetectorFixture({
    dependency: {
      outputFiles: {
        'generated.js': 'export const generated = true;\n',
      },
    },
    expected: passExpectation(),
    id: 'release/content-hash-user-ignore',
    registry: validRegistryScenario(),
    releaseConfigSource: "{ contentHash: { ignore: ['generated.js'] } }",
    root: {
      outputManifest: ROOT_DEPENDENCY_OUTPUT,
      sourceManifest: ROOT_DEPENDENCY_SOURCE,
    },
  }),
  'release/content-hash-user-ignore-non-match': createReleaseDetectorFixture({
    dependency: {
      outputFiles: {
        'visible.js': 'export const visible = true;\n',
      },
    },
    expected: failureExpectation(
      contentHashIssue({
        evidence: [
          {
            label: 'content hash diffs',
            lines: [
              createReleaseContentDiffEvidenceLine({
                kind: 'local-only',
                localContent: 'export const visible = true;\n',
                path: 'visible.js',
              }),
            ],
          },
        ],
        filePath: 'packages/dependency/dist/visible.js',
      }),
    ),
    id: 'release/content-hash-user-ignore-non-match',
    registry: validRegistryScenario(),
    releaseConfigSource: "{ contentHash: { ignore: ['generated.js'] } }",
    root: {
      outputManifest: ROOT_DEPENDENCY_OUTPUT,
      sourceManifest: ROOT_DEPENDENCY_SOURCE,
    },
  }),

  'release/packed-dependency-missing': createReleaseDetectorFixture({
    expected: failureExpectation({
      code: LIMINA_CHECK_ISSUE_CODES.releasePackedManifest,
      evidence: [
        { label: 'release reason', value: 'packed-dependency-missing' },
        {
          label: 'dependency',
          value: RELEASE_FIXTURE_DEPENDENCY_PACKAGE,
        },
        { label: 'dependency section', value: 'dependencies' },
        {
          label: 'packed manifest',
          value: `${RELEASE_FIXTURE_ROOT_TARBALL}#package.json`,
        },
      ],
      filePath: RELEASE_FIXTURE_ROOT_OUTPUT_MANIFEST,
      packageManifestPath: RELEASE_FIXTURE_ROOT_OUTPUT_MANIFEST,
      packageName: RELEASE_FIXTURE_ROOT_PACKAGE,
      reason: 'packed-dependency-missing',
      task: RELEASE_TASK,
    }),
    id: 'release/packed-dependency-missing',
    registry: validRegistryScenario(),
    root: {
      sourceManifest: ROOT_DEPENDENCY_SOURCE,
    },
  }),
  'release/packed-dependency-range-mismatch': createReleaseDetectorFixture({
    expected: failureExpectation({
      code: LIMINA_CHECK_ISSUE_CODES.releasePackedManifest,
      evidence: [
        {
          label: 'release reason',
          value: 'packed-dependency-range-mismatch',
        },
        {
          label: 'dependency',
          value: RELEASE_FIXTURE_DEPENDENCY_PACKAGE,
        },
        { label: 'dependency section', value: 'dependencies' },
        { label: 'expected version', value: '1.0.0' },
        { label: 'actual range', value: '^2.0.0' },
        {
          label: 'packed manifest',
          value: `${RELEASE_FIXTURE_ROOT_TARBALL}#package.json`,
        },
      ],
      filePath: RELEASE_FIXTURE_ROOT_OUTPUT_MANIFEST,
      packageManifestPath: RELEASE_FIXTURE_ROOT_OUTPUT_MANIFEST,
      packageName: RELEASE_FIXTURE_ROOT_PACKAGE,
      reason: 'packed-dependency-range-mismatch',
      task: RELEASE_TASK,
    }),
    id: 'release/packed-dependency-range-mismatch',
    registry: validRegistryScenario(),
    root: {
      outputManifest: {
        dependencies: {
          [RELEASE_FIXTURE_DEPENDENCY_PACKAGE]: '^2.0.0',
        },
      },
      sourceManifest: ROOT_DEPENDENCY_SOURCE,
    },
  }),
  'release/packed-manifest-lint': createReleaseDetectorFixture({
    dependency: false,
    expected: failureExpectation({
      code: LIMINA_CHECK_ISSUE_CODES.releasePackedManifest,
      evidence: [
        { label: 'release reason', value: 'manifest-lint-failed' },
        { label: 'external rule', value: 'require-license' },
        { label: 'lint node', value: 'license' },
        {
          label: 'packed manifest',
          value: `${RELEASE_FIXTURE_ROOT_TARBALL}#package.json`,
        },
      ],
      externalCode: 'require-license',
      filePath: RELEASE_FIXTURE_ROOT_OUTPUT_MANIFEST,
      packageManifestPath: RELEASE_FIXTURE_ROOT_OUTPUT_MANIFEST,
      packageName: RELEASE_FIXTURE_ROOT_PACKAGE,
      reason: 'manifest-lint-failed',
      task: RELEASE_TASK,
    }),
    id: 'release/packed-manifest-lint',
    releaseConfigSource: '{ npmPackageJsonLint: true }',
    root: {
      outputManifest: { license: undefined },
    },
    tools: ['npm-package-json-lint'],
  }),
  'release/packed-output-catalog-specifier': packedOutputLocalSpecifierFixture(
    'catalog',
    'catalog:default',
  ),
  'release/packed-output-file-specifier': packedOutputLocalSpecifierFixture(
    'file',
    'file:../dependency',
  ),
  'release/packed-output-link-specifier': packedOutputLocalSpecifierFixture(
    'link',
    'link:../dependency',
  ),
  'release/packed-output-workspace-specifier':
    packedOutputLocalSpecifierFixture('workspace', 'workspace:*'),
  'release/packed-source-link-dependency': createReleaseDetectorFixture({
    dependency: false,
    expected: failureExpectation({
      code: LIMINA_CHECK_ISSUE_CODES.releasePackedManifest,
      evidence: [
        { label: 'release reason', value: 'source-link-dependency' },
        {
          label: 'dependency',
          value: RELEASE_FIXTURE_DEPENDENCY_PACKAGE,
        },
        { label: 'dependency section', value: 'dependencies' },
        { label: 'dependency specifier', value: 'link:../dependency' },
        { label: 'source manifest' },
      ],
      filePath: RELEASE_FIXTURE_ROOT_SOURCE_MANIFEST,
      packageManifestPath: RELEASE_FIXTURE_ROOT_SOURCE_MANIFEST,
      packageName: RELEASE_FIXTURE_ROOT_PACKAGE,
      reason: 'source-link-dependency',
      task: RELEASE_TASK,
    }),
    id: 'release/packed-source-link-dependency',
    root: {
      outputManifest: ROOT_DEPENDENCY_OUTPUT,
      sourceManifest: {
        dependencies: {
          [RELEASE_FIXTURE_DEPENDENCY_PACKAGE]: 'link:../dependency',
        },
      },
    },
  }),
  'release/packed-source-private-dependency': createReleaseDetectorFixture({
    dependency: {
      sourceManifest: { private: true },
    },
    expected: failureExpectation({
      code: LIMINA_CHECK_ISSUE_CODES.releasePackedManifest,
      evidence: [
        { label: 'release reason', value: 'source-private-dependency' },
        {
          label: 'dependency',
          value: RELEASE_FIXTURE_DEPENDENCY_PACKAGE,
        },
        { label: 'dependency section', value: 'dependencies' },
        { label: 'dependency specifier', value: 'workspace:*' },
        { label: 'source manifest' },
        { label: 'target manifest' },
      ],
      filePath: RELEASE_FIXTURE_ROOT_SOURCE_MANIFEST,
      packageManifestPath: RELEASE_FIXTURE_ROOT_SOURCE_MANIFEST,
      packageName: RELEASE_FIXTURE_ROOT_PACKAGE,
      reason: 'source-private-dependency',
      task: RELEASE_TASK,
    }),
    id: 'release/packed-source-private-dependency',
    root: {
      outputManifest: ROOT_DEPENDENCY_OUTPUT,
      sourceManifest: ROOT_DEPENDENCY_SOURCE,
    },
  }),
  'release/packed-source-workspace-dependency-missing':
    createReleaseDetectorFixture({
      dependency: false,
      expected: failureExpectation({
        code: LIMINA_CHECK_ISSUE_CODES.releasePackedManifest,
        evidence: [
          {
            label: 'release reason',
            value: 'source-workspace-dependency-missing',
          },
          {
            label: 'dependency',
            value: RELEASE_FIXTURE_DEPENDENCY_PACKAGE,
          },
          { label: 'dependency section', value: 'dependencies' },
          { label: 'dependency specifier', value: 'workspace:*' },
          { label: 'source manifest' },
        ],
        filePath: RELEASE_FIXTURE_ROOT_SOURCE_MANIFEST,
        packageManifestPath: RELEASE_FIXTURE_ROOT_SOURCE_MANIFEST,
        packageName: RELEASE_FIXTURE_ROOT_PACKAGE,
        reason: 'source-workspace-dependency-missing',
        task: RELEASE_TASK,
      }),
      id: 'release/packed-source-workspace-dependency-missing',
      root: {
        outputManifest: ROOT_DEPENDENCY_OUTPUT,
        sourceManifest: ROOT_DEPENDENCY_SOURCE,
      },
    }),

  'release/registry-comparison-failed': registryFailureFixture({
    evidence: [
      { label: 'dist-tag', value: 'latest' },
      { label: 'version', value: '1.0.0' },
      { label: 'tarball' },
    ],
    id: 'release/registry-comparison-failed',
    reason: 'comparison-failed',
    scenario: createRegistryScenario({
      expectedTarballRequest: true,
      metadataBody: packageMetadataBody(),
      tarballBody: { kind: 'text', value: 'not a tar archive' },
    }),
  }),
  'release/registry-dist-tag-missing': registryFailureFixture({
    evidence: [{ label: 'dist-tag', value: 'latest' }],
    id: 'release/registry-dist-tag-missing',
    reason: 'dist-tag-missing',
    scenario: createRegistryScenario({
      metadataBody: { kind: 'json', value: { versions: {} } },
    }),
  }),
  'release/registry-integrity-invalid': registryFailureFixture({
    evidence: [
      { label: 'dist-tag', value: 'latest' },
      { label: 'version', value: '1.0.0' },
      { label: 'integrity field', value: 'integrity' },
      { label: 'registry integrity', value: 'invalid-sri' },
    ],
    id: 'release/registry-integrity-invalid',
    reason: 'integrity-invalid',
    scenario: createRegistryScenario({
      metadataBody: packageMetadataBody({
        integrity: { kind: 'value', value: 'invalid-sri' },
      }),
      tarballBody: {
        files: DEFAULT_REMOTE_DEPENDENCY_FILES,
        kind: 'package-tarball',
      },
    }),
  }),
  'release/registry-integrity-mismatch': registryFailureFixture({
    evidence: [
      { label: 'dist-tag', value: 'latest' },
      { label: 'version', value: '1.0.0' },
      { label: 'expected integrity' },
      { label: 'actual integrity' },
      { label: 'actual shasum' },
    ],
    id: 'release/registry-integrity-mismatch',
    reason: 'integrity-mismatch',
    scenario: createRegistryScenario({
      expectedTarballRequest: true,
      metadataBody: packageMetadataBody({
        integrity: { kind: 'mismatch' },
      }),
      tarballBody: {
        files: DEFAULT_REMOTE_DEPENDENCY_FILES,
        kind: 'package-tarball',
      },
    }),
  }),
  'release/registry-integrity-missing': registryFailureFixture({
    evidence: [
      { label: 'dist-tag', value: 'latest' },
      { label: 'version', value: '1.0.0' },
      { label: 'tarball' },
    ],
    id: 'release/registry-integrity-missing',
    reason: 'integrity-missing',
    scenario: createRegistryScenario({
      metadataBody: packageMetadataBody({ integrity: { kind: 'omit' } }),
      tarballBody: {
        files: DEFAULT_REMOTE_DEPENDENCY_FILES,
        kind: 'package-tarball',
      },
    }),
  }),
  'release/registry-integrity-priority': createReleaseDetectorFixture({
    expected: failureExpectation(
      registryExpectedIssue('integrity-invalid', [
        { label: 'integrity field', value: 'integrity' },
        { label: 'registry integrity', value: 'invalid-sri' },
        { label: 'registry shasum' },
      ]),
    ),
    id: 'release/registry-integrity-priority',
    registry: createRegistryScenario({
      metadataBody: packageMetadataBody({
        integrity: { kind: 'value', value: 'invalid-sri' },
        shasum: { kind: 'actual' },
      }),
      tarballBody: {
        files: DEFAULT_REMOTE_DEPENDENCY_FILES,
        kind: 'package-tarball',
      },
    }),
    root: {
      outputManifest: ROOT_DEPENDENCY_OUTPUT,
      sourceManifest: ROOT_DEPENDENCY_SOURCE,
    },
  }),
  'release/registry-metadata-body-read': registryFailureFixture({
    id: 'release/registry-metadata-body-read',
    reason: 'metadata-body-read',
    scenario: createRegistryScenario({
      metadataBody: { kind: 'incomplete-body', value: '{"dist-tags":' },
    }),
  }),
  'release/registry-metadata-http-status': registryFailureFixture({
    evidence: [{ label: 'http status', value: '500' }],
    id: 'release/registry-metadata-http-status',
    reason: 'metadata-http-status',
    scenario: createRegistryScenario({
      metadataBody: { kind: 'json', value: { error: 'fixture failure' } },
      metadataStatus: 500,
    }),
  }),
  'release/registry-metadata-invalid-json': registryFailureFixture({
    id: 'release/registry-metadata-invalid-json',
    reason: 'metadata-invalid-json',
    scenario: createRegistryScenario({
      metadataBody: { kind: 'text', value: '{' },
    }),
  }),
  'release/registry-metadata-invalid-object': registryFailureFixture({
    evidence: [{ label: 'http status', value: '200' }],
    id: 'release/registry-metadata-invalid-object',
    reason: 'metadata-invalid-object',
    scenario: createRegistryScenario({
      metadataBody: { kind: 'json', value: [] },
    }),
  }),
  'release/registry-metadata-request': registryFailureFixture({
    id: 'release/registry-metadata-request',
    reason: 'metadata-request',
    scenario: createRegistryScenario({
      metadataBody: { kind: 'close-connection' },
    }),
  }),
  'release/registry-metadata-timeout': registryFailureFixture({
    evidence: [{ label: 'timeout ms', value: '50' }],
    id: 'release/registry-metadata-timeout',
    reason: 'metadata-timeout',
    scenario: createRegistryScenario({
      metadataBody: {
        kind: 'delay',
        milliseconds: 250,
        next: { kind: 'json', value: {} },
      },
      requestTimeoutMs: 50,
    }),
  }),
  'release/registry-package-not-found': registryFailureFixture({
    evidence: [{ label: 'http status', value: '404' }],
    id: 'release/registry-package-not-found',
    reason: 'package-not-found',
    scenario: createRegistryScenario({
      metadataBody: { kind: 'json', value: { error: 'not found' } },
      metadataStatus: 404,
    }),
  }),
  'release/registry-shasum-invalid': createReleaseDetectorFixture({
    expected: failureExpectation(
      registryExpectedIssue('integrity-invalid', [
        { label: 'dist-tag', value: 'latest' },
        { label: 'version', value: '1.0.0' },
        { label: 'integrity field', value: 'shasum' },
        { label: 'registry shasum', value: 'invalid-shasum' },
      ]),
    ),
    id: 'release/registry-shasum-invalid',
    registry: createRegistryScenario({
      metadataBody: packageMetadataBody({
        integrity: { kind: 'omit' },
        shasum: { kind: 'value', value: 'invalid-shasum' },
      }),
      tarballBody: {
        files: DEFAULT_REMOTE_DEPENDENCY_FILES,
        kind: 'package-tarball',
      },
    }),
    root: {
      outputManifest: ROOT_DEPENDENCY_OUTPUT,
      sourceManifest: ROOT_DEPENDENCY_SOURCE,
    },
  }),
  'release/registry-shasum-mismatch': createReleaseDetectorFixture({
    expected: failureExpectation(
      registryExpectedIssue('integrity-mismatch', [
        { label: 'dist-tag', value: 'latest' },
        { label: 'version', value: '1.0.0' },
        { label: 'expected integrity' },
        { label: 'expected shasum' },
        { label: 'actual integrity' },
        { label: 'actual shasum' },
      ]),
    ),
    id: 'release/registry-shasum-mismatch',
    registry: createRegistryScenario({
      expectedTarballRequest: true,
      metadataBody: packageMetadataBody({
        integrity: { kind: 'omit' },
        shasum: { kind: 'mismatch' },
      }),
      tarballBody: {
        files: DEFAULT_REMOTE_DEPENDENCY_FILES,
        kind: 'package-tarball',
      },
    }),
    root: {
      outputManifest: ROOT_DEPENDENCY_OUTPUT,
      sourceManifest: ROOT_DEPENDENCY_SOURCE,
    },
  }),
  'release/registry-tarball-body-read': registryFailureFixture({
    evidence: [
      { label: 'dist-tag', value: 'latest' },
      { label: 'version', value: '1.0.0' },
      { label: 'tarball' },
    ],
    id: 'release/registry-tarball-body-read',
    reason: 'tarball-body-read',
    scenario: createRegistryScenario({
      expectedTarballRequest: true,
      metadataBody: packageMetadataBody({
        integrity: { kind: 'value', value: VALID_PLACEHOLDER_INTEGRITY },
      }),
      tarballBody: { kind: 'incomplete-body', value: 'partial tarball' },
    }),
  }),
  'release/registry-tarball-http-status': registryFailureFixture({
    evidence: [
      { label: 'dist-tag', value: 'latest' },
      { label: 'version', value: '1.0.0' },
      { label: 'http status', value: '503' },
      { label: 'tarball' },
    ],
    id: 'release/registry-tarball-http-status',
    reason: 'tarball-http-status',
    scenario: createRegistryScenario({
      expectedTarballRequest: true,
      metadataBody: packageMetadataBody(),
      tarballBody: {
        files: DEFAULT_REMOTE_DEPENDENCY_FILES,
        kind: 'package-tarball',
      },
      tarballStatus: 503,
    }),
  }),
  'release/registry-tarball-request': registryFailureFixture({
    evidence: [
      { label: 'dist-tag', value: 'latest' },
      { label: 'version', value: '1.0.0' },
      { label: 'tarball' },
    ],
    id: 'release/registry-tarball-request',
    reason: 'tarball-request',
    scenario: createRegistryScenario({
      expectedTarballRequest: true,
      metadataBody: packageMetadataBody({
        integrity: { kind: 'value', value: VALID_PLACEHOLDER_INTEGRITY },
      }),
      tarballBody: { kind: 'close-connection' },
    }),
  }),
  'release/registry-tarball-timeout': registryFailureFixture({
    evidence: [
      { label: 'dist-tag', value: 'latest' },
      { label: 'version', value: '1.0.0' },
      { label: 'tarball' },
      { label: 'timeout ms', value: '50' },
    ],
    id: 'release/registry-tarball-timeout',
    reason: 'tarball-timeout',
    scenario: createRegistryScenario({
      expectedTarballRequest: true,
      metadataBody: packageMetadataBody(),
      requestTimeoutMs: 50,
      tarballBody: {
        kind: 'delay',
        milliseconds: 250,
        next: {
          files: DEFAULT_REMOTE_DEPENDENCY_FILES,
          kind: 'package-tarball',
        },
      },
    }),
  }),
  'release/registry-tarball-url-missing': registryFailureFixture({
    evidence: [
      { label: 'dist-tag', value: 'latest' },
      { label: 'version', value: '1.0.0' },
    ],
    id: 'release/registry-tarball-url-missing',
    reason: 'tarball-url-missing',
    scenario: createRegistryScenario({
      metadataBody: packageMetadataBody({
        integrity: { kind: 'omit' },
        tarball: false,
      }),
    }),
  }),
  'release/registry-version-missing': registryFailureFixture({
    evidence: [
      { label: 'dist-tag', value: 'latest' },
      { label: 'version', value: '1.0.0' },
    ],
    id: 'release/registry-version-missing',
    reason: 'version-missing',
    scenario: createRegistryScenario({
      metadataBody: {
        kind: 'json',
        value: {
          'dist-tags': { latest: '1.0.0' },
          versions: {},
        },
      },
    }),
  }),

  'release/tarball-license-missing': createReleaseDetectorFixture({
    dependency: false,
    expected: failureExpectation({
      code: LIMINA_CHECK_ISSUE_CODES.releaseTarballHygiene,
      evidence: [
        { label: 'release reason', value: 'required-files-missing' },
        { label: 'tarball', value: RELEASE_FIXTURE_ROOT_TARBALL },
        { label: 'missing files', lines: ['LICENSE.md'] },
      ],
      filePath: RELEASE_FIXTURE_ROOT_OUTPUT_MANIFEST,
      packageManifestPath: RELEASE_FIXTURE_ROOT_OUTPUT_MANIFEST,
      packageName: RELEASE_FIXTURE_ROOT_PACKAGE,
      reason: 'required-files-missing',
      task: RELEASE_TASK,
    }),
    id: 'release/tarball-license-missing',
    root: { outputFiles: { 'LICENSE.md': null } },
  }),
  'release/tarball-output-private': createReleaseDetectorFixture({
    dependency: false,
    expected: failureExpectation({
      code: LIMINA_CHECK_ISSUE_CODES.releaseTarballHygiene,
      evidence: [
        { label: 'release reason', value: 'output-private' },
        { label: 'package manifest' },
      ],
      filePath: RELEASE_FIXTURE_ROOT_OUTPUT_MANIFEST,
      packageManifestPath: RELEASE_FIXTURE_ROOT_OUTPUT_MANIFEST,
      packageName: RELEASE_FIXTURE_ROOT_PACKAGE,
      reason: 'output-private',
      task: RELEASE_TASK,
    }),
    id: 'release/tarball-output-private',
    root: { outputManifest: { private: true } },
  }),
  'release/tarball-readme-missing': createReleaseDetectorFixture({
    dependency: false,
    expected: failureExpectation({
      code: LIMINA_CHECK_ISSUE_CODES.releaseTarballHygiene,
      evidence: [
        { label: 'release reason', value: 'required-files-missing' },
        { label: 'tarball', value: RELEASE_FIXTURE_ROOT_TARBALL },
        { label: 'missing files', lines: ['README.md'] },
      ],
      filePath: RELEASE_FIXTURE_ROOT_OUTPUT_MANIFEST,
      packageManifestPath: RELEASE_FIXTURE_ROOT_OUTPUT_MANIFEST,
      packageName: RELEASE_FIXTURE_ROOT_PACKAGE,
      reason: 'required-files-missing',
      task: RELEASE_TASK,
    }),
    id: 'release/tarball-readme-missing',
    root: { outputFiles: { 'README.md': null } },
  }),
  'release/tarball-source-map': createReleaseDetectorFixture({
    dependency: false,
    expected: failureExpectation({
      code: LIMINA_CHECK_ISSUE_CODES.releaseTarballHygiene,
      evidence: [
        { label: 'release reason', value: 'source-map-file' },
        { label: 'tarball', value: RELEASE_FIXTURE_ROOT_TARBALL },
        { label: 'archive entry', value: 'index.js.map' },
      ],
      filePath: 'packages/root/dist/index.js.map',
      packageManifestPath: RELEASE_FIXTURE_ROOT_OUTPUT_MANIFEST,
      packageName: RELEASE_FIXTURE_ROOT_PACKAGE,
      reason: 'source-map-file',
      task: RELEASE_TASK,
    }),
    id: 'release/tarball-source-map',
    root: { outputFiles: { 'index.js.map': '{}\n' } },
  }),
  'release/tarball-source-mapping-url': createReleaseDetectorFixture({
    dependency: false,
    expected: failureExpectation({
      code: LIMINA_CHECK_ISSUE_CODES.releaseTarballHygiene,
      evidence: [
        { label: 'release reason', value: 'source-mapping-url' },
        { label: 'tarball', value: RELEASE_FIXTURE_ROOT_TARBALL },
        { label: 'archive entry', value: 'index.js' },
      ],
      filePath: 'packages/root/dist/index.js',
      packageManifestPath: RELEASE_FIXTURE_ROOT_OUTPUT_MANIFEST,
      packageName: RELEASE_FIXTURE_ROOT_PACKAGE,
      reason: 'source-mapping-url',
      task: RELEASE_TASK,
    }),
    id: 'release/tarball-source-mapping-url',
    root: {
      outputFiles: {
        'index.js':
          'export const value = 1;\n//# sourceMappingURL=index.js.map\n',
      },
    },
  }),
  'release/tarball-valid': createReleaseDetectorFixture({
    dependency: false,
    expected: passExpectation(),
    id: 'release/tarball-valid',
  }),
} as const satisfies Readonly<Record<string, DetectorFixtureDefinition>>;

export type ReleaseDetectorFixtureId = keyof typeof RELEASE_DETECTOR_FIXTURES;

export function getReleaseDetectorFixture(
  id: ReleaseDetectorFixtureId,
): DetectorFixtureDefinition {
  return RELEASE_DETECTOR_FIXTURES[id];
}
