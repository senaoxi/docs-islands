import {
  lstat,
  mkdir,
  mkdtemp,
  readdir,
  readFile,
  realpath,
  rm,
  symlink,
  utimes,
  writeFile,
} from 'node:fs/promises';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { toPortablePath } from '../../src/__tests__/helpers/path';
import {
  DEFAULT_ISSUE_CODE_BY_TASK,
  LIMINA_CHECK_ISSUE_CODES,
} from '../../src/check-reporting/codes';
import {
  CHECK_ISSUE_SNAPSHOT_VERSION,
  getCheckIssueSnapshotPath,
  type LiminaCheckIssue,
} from '../../src/check-reporting/snapshot';
import { createDetectorInvocationEnvironment } from '../helpers/detector-environment';
import {
  discoverDetectorFixtures,
  validateDetectorFixtureDefinition,
} from '../helpers/detector-fixture-discovery';
import type {
  DetectorFixtureDefinition,
  DetectorFixtureExpectation,
  ExpectedIssue,
} from '../helpers/detector-fixture-types';
import {
  assertNoPreexistingCheckSnapshot,
  readDetectorCheckSnapshot,
} from '../helpers/detector-snapshot';
import { validatePortableRelativePath } from '../helpers/fixture-paths';
import {
  applyFixtureMutations,
  applyFixtureSetup,
  assertTreeSnapshotUnchanged,
  captureTreeSnapshot,
  cleanupDetectorSandbox,
  copyFixtureRepository,
  createDetectorSandbox,
  DEFAULT_SANDBOX_IGNORED_PATH_PREFIXES,
  finishFixtureCleanup,
  pathExists,
  SANDBOX_CLEANUP_MAX_RETRIES,
  SANDBOX_CLEANUP_RETRY_DELAY_MS,
} from '../helpers/fixture-sandbox';
import { assertDetectorIssues } from '../helpers/issue-assertions';
import { createLiminaSpawnSpec, liminaBinPath } from '../helpers/run-limina';
import { createFixtureToolBridges } from '../helpers/tool-bridge';

const temporaryRoots: string[] = [];

async function createTemporaryRoot(prefix: string): Promise<string> {
  const rootDir = await realpath(
    await mkdtemp(path.join(tmpdir(), `limina-detector-${prefix}-`)),
  );
  temporaryRoots.push(rootDir);
  return rootDir;
}

async function writeText(filePath: string, content = ''): Promise<void> {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, content, 'utf8');
}

function validFailingDefinition(
  id = 'proof/example-case',
): DetectorFixtureDefinition {
  return {
    command: ['check', 'detector'],
    expected: {
      additionalCodes: [],
      exitCode: 1,
      issues: [
        {
          code: LIMINA_CHECK_ISSUE_CODES.proofUncoveredSourceFile,
          filePath: 'packages/pkg/uncovered.ts',
          task: 'proof:check',
        },
      ],
      primaryCode: LIMINA_CHECK_ISSUE_CODES.proofUncoveredSourceFile,
    },
    id,
    kind: 'filesystem',
    tools: ['typescript'],
  };
}

function expectedFailure(
  issues: readonly ExpectedIssue[],
  overrides: Partial<DetectorFixtureExpectation> = {},
): DetectorFixtureExpectation {
  return {
    additionalCodes: [],
    exitCode: 1,
    issues,
    primaryCode: LIMINA_CHECK_ISSUE_CODES.proofUncoveredSourceFile,
    ...overrides,
  };
}

function actualIssue(
  overrides: Partial<LiminaCheckIssue> = {},
): LiminaCheckIssue {
  return {
    code: LIMINA_CHECK_ISSUE_CODES.proofUncoveredSourceFile,
    filePath: 'packages/pkg/uncovered.ts',
    id: 'unstable-id',
    packageName: '@fixture/pkg',
    reason: 'presentation reason',
    task: 'proof:check',
    title: 'presentation title',
    ...overrides,
  };
}

function validSnapshot(command = 'limina check detector') {
  const createdAt = new Date().toISOString();
  return {
    command,
    createdAt,
    issues: [],
    run: {
      command,
      completedAt: createdAt,
      createdAt,
      durationMs: 0,
      pipeline: 'detector',
      result: 'passed' as const,
      startedAt: createdAt,
      tasks: [
        {
          completedAt: createdAt,
          durationMs: 0,
          generation: 0,
          id: 'task:proof',
          issueTask: 'proof:check' as const,
          kind: 'task' as const,
          label: 'proof:check',
          startedAt: createdAt,
          state: 'passed' as const,
        },
      ],
    },
    status: 'completed' as const,
    version: CHECK_ISSUE_SNAPSHOT_VERSION,
  };
}

async function writeSnapshot(
  rootDir: string,
  snapshot: unknown,
): Promise<string> {
  const snapshotPath = getCheckIssueSnapshotPath(rootDir);
  await writeText(snapshotPath, `${JSON.stringify(snapshot, null, 2)}\n`);
  return snapshotPath;
}

async function createDiscoveryFixture(
  detectorRoot: string,
  id: string,
): Promise<string> {
  const fixtureRoot = path.join(detectorRoot, ...id.split('/'));
  await mkdir(path.join(fixtureRoot, 'repo'), { recursive: true });
  const casePath = path.join(fixtureRoot, 'case.mts');
  await writeText(casePath, 'export default {};\n');
  return casePath;
}

afterEach(async () => {
  vi.restoreAllMocks();
  await Promise.all(
    temporaryRoots.splice(0).map((rootDir) =>
      rm(rootDir, {
        force: true,
        maxRetries: 5,
        recursive: true,
        retryDelay: 50,
      }),
    ),
  );
});

describe('detector fixture declaration and discovery', () => {
  it('applies strict expectation defaults to a valid declaration', () => {
    const definition = validateDetectorFixtureDefinition(
      validFailingDefinition(),
      {
        casePath: '/fixtures/proof/example-case/case.mts',
        expectedId: 'proof/example-case',
      },
    );

    expect(definition.expected.additionalCodes).toEqual([]);
    expect(definition.expected.allowUnexpectedIssues).toBe(false);
  });

  it.each([
    '../proof/example',
    '/proof/example',
    'proof\\example',
    'proof//example',
    'proof/./example',
    'Proof/example',
  ])('rejects invalid fixture ID %s', (id) => {
    expect(() =>
      validateDetectorFixtureDefinition(validFailingDefinition(id), {
        casePath: '/fixtures/case.mts',
      }),
    ).toThrow(/id|portable|relative|segments/iu);
  });

  it('reports the case path, declared ID, and expected directory ID', () => {
    expect(() =>
      validateDetectorFixtureDefinition(validFailingDefinition('proof/wrong'), {
        casePath: '/fixtures/proof/right/case.mts',
        expectedId: 'proof/right',
      }),
    ).toThrow(
      'declaration in /fixtures/proof/right/case.mts has an ID/directory mismatch: declared "proof/wrong", expected "proof/right"',
    );
  });

  it('rejects empty commands and invalid exit codes', () => {
    expect(() =>
      validateDetectorFixtureDefinition(
        { ...validFailingDefinition(), command: [] },
        { casePath: '/fixtures/case.mts' },
      ),
    ).toThrow('command must contain at least one');
    expect(() =>
      validateDetectorFixtureDefinition(
        {
          ...validFailingDefinition(),
          expected: { ...validFailingDefinition().expected, exitCode: 1.5 },
        },
        { casePath: '/fixtures/case.mts' },
      ),
    ).toThrow('exitCode must be an integer');
  });

  it('rejects unknown codes, fallback primary codes, and missing primary issues', () => {
    const base = validFailingDefinition();
    expect(() =>
      validateDetectorFixtureDefinition(
        {
          ...base,
          expected: {
            ...base.expected,
            issues: [
              {
                code: 'LIMINA_NOT_REAL',
                task: 'proof:check',
              },
            ],
            primaryCode: 'LIMINA_NOT_REAL',
          },
        },
        { casePath: '/fixtures/case.mts' },
      ),
    ).toThrow('not a canonical Limina issue code');
    expect(() =>
      validateDetectorFixtureDefinition(
        {
          ...base,
          expected: {
            ...base.expected,
            issues: [
              {
                code: DEFAULT_ISSUE_CODE_BY_TASK['proof:check'],
                task: 'proof:check',
              },
            ],
            primaryCode: DEFAULT_ISSUE_CODE_BY_TASK['proof:check'],
          },
        },
        { casePath: '/fixtures/case.mts' },
      ),
    ).toThrow('not a task fallback code');
    expect(() =>
      validateDetectorFixtureDefinition(
        {
          ...base,
          expected: { ...base.expected, issues: [] },
        },
        { casePath: '/fixtures/case.mts' },
      ),
    ).toThrow('must be represented');
  });

  it('rejects a primary code on a passing fixture and duplicate expectations', () => {
    const base = validFailingDefinition();
    expect(() =>
      validateDetectorFixtureDefinition(
        {
          ...base,
          expected: { ...base.expected, exitCode: 0 },
        },
        { casePath: '/fixtures/case.mts' },
      ),
    ).toThrow('not allowed for a passing fixture');
    expect(() =>
      validateDetectorFixtureDefinition(
        {
          ...base,
          expected: {
            ...base.expected,
            issues: [base.expected.issues[0]!, base.expected.issues[0]!],
          },
        },
        { casePath: '/fixtures/case.mts' },
      ),
    ).toThrow('indistinguishable duplicate');
  });

  it('rejects safety environment overrides and over-broad generated paths', () => {
    expect(() =>
      validateDetectorFixtureDefinition(
        { ...validFailingDefinition(), environment: { PATH: '/unsafe' } },
        { casePath: '/fixtures/case.mts' },
      ),
    ).toThrow('cannot override harness variable PATH');
    expect(() =>
      validateDetectorFixtureDefinition(
        { ...validFailingDefinition(), allowedGeneratedPaths: ['**/*'] },
        { casePath: '/fixtures/case.mts' },
      ),
    ).toThrow('over-broad pattern');
  });

  it('discovers fixtures in portable sorted order', async () => {
    const rootDir = await createTemporaryRoot('discovery-order');
    const detectorRoot = path.join(rootDir, 'detectors');
    const zCase = await createDiscoveryFixture(detectorRoot, 'proof/z-case');
    const aCase = await createDiscoveryFixture(detectorRoot, 'graph/a-case');
    const fixtures = await discoverDetectorFixtures({
      caseModules: new Map([
        [zCase, { default: validFailingDefinition('proof/z-case') }],
        [aCase, { default: validFailingDefinition('graph/a-case') }],
      ]),
      detectorRoot,
    });

    expect(fixtures.map((fixture) => fixture.id)).toEqual([
      'graph/a-case',
      'proof/z-case',
    ]);
  });

  it('rejects duplicate declared IDs before directory mismatch', async () => {
    const rootDir = await createTemporaryRoot('discovery-duplicate');
    const detectorRoot = path.join(rootDir, 'detectors');
    const firstCase = await createDiscoveryFixture(detectorRoot, 'proof/one');
    const secondCase = await createDiscoveryFixture(detectorRoot, 'proof/two');

    await expect(
      discoverDetectorFixtures({
        caseModules: new Map([
          [firstCase, { default: validFailingDefinition('proof/shared') }],
          [secondCase, { default: validFailingDefinition('proof/shared') }],
        ]),
        detectorRoot,
      }),
    ).rejects.toThrow('Duplicate detector fixture ID: proof/shared');
  });

  it('rejects missing case.mts, missing repo, and unloaded declarations', async () => {
    const missingCaseRoot = await createTemporaryRoot('missing-case');
    const missingCaseDetectors = path.join(missingCaseRoot, 'detectors');
    await mkdir(path.join(missingCaseDetectors, 'proof/example/repo'), {
      recursive: true,
    });
    await expect(
      discoverDetectorFixtures({
        caseModules: new Map(),
        detectorRoot: missingCaseDetectors,
      }),
    ).rejects.toThrow('exactly one case.mts');

    const missingRepoRoot = await createTemporaryRoot('missing-repo');
    const missingRepoDetectors = path.join(missingRepoRoot, 'detectors');
    const missingRepoCase = path.join(
      missingRepoDetectors,
      'proof/example/case.mts',
    );
    await writeText(missingRepoCase, 'export default {};\n');
    await expect(
      discoverDetectorFixtures({
        caseModules: new Map([
          [missingRepoCase, { default: validFailingDefinition() }],
        ]),
        detectorRoot: missingRepoDetectors,
      }),
    ).rejects.toThrow('real repo directory');

    const unloadedRoot = await createTemporaryRoot('unloaded-case');
    const unloadedDetectors = path.join(unloadedRoot, 'detectors');
    const unloadedCase = await createDiscoveryFixture(
      unloadedDetectors,
      'proof/example-case',
    );
    await expect(
      discoverDetectorFixtures({
        caseModules: new Map(),
        detectorRoot: unloadedDetectors,
      }),
    ).rejects.toThrow(`not loaded by the test runner: ${unloadedCase}`);
  });
});

describe('detector fixture copy policy', () => {
  it('keeps permanent exclusions and makes dist/build-info opt-in', async () => {
    const rootDir = await createTemporaryRoot('copy-policy');
    const sourceRoot = path.join(rootDir, 'source');
    await Promise.all([
      writeText(path.join(sourceRoot, '.limina/secret.json'), 'secret'),
      writeText(path.join(sourceRoot, 'node_modules/pkg/index.js'), 'module'),
      writeText(path.join(sourceRoot, 'coverage/report.json'), 'coverage'),
      writeText(path.join(sourceRoot, 'dist/index.js'), 'dist'),
      writeText(path.join(sourceRoot, 'cache.tsbuildinfo'), 'build-info'),
      writeText(path.join(sourceRoot, 'src/index.ts'), 'source'),
    ]);
    const defaultDestination = path.join(rootDir, 'default-copy');
    await copyFixtureRepository({
      destinationRoot: defaultDestination,
      sourceRoot,
    });

    expect(await readdir(defaultDestination)).toEqual(['src']);

    const outputDestination = path.join(rootDir, 'output-copy');
    await copyFixtureRepository({
      destinationRoot: outputDestination,
      policy: {
        includeBuildInfoFiles: true,
        includeOutputDirectories: true,
      },
      sourceRoot,
    });
    expect(
      await pathExists(path.join(outputDestination, 'dist/index.js')),
    ).toBe(true);
    expect(
      await pathExists(path.join(outputDestination, 'cache.tsbuildinfo')),
    ).toBe(true);
    for (const permanentName of ['.limina', 'node_modules', 'coverage']) {
      expect(
        await pathExists(path.join(outputDestination, permanentName)),
      ).toBe(false);
    }
  });

  it('applies exact custom entry-name exclusions', async () => {
    const rootDir = await createTemporaryRoot('copy-custom');
    const sourceRoot = path.join(rootDir, 'source');
    await writeText(path.join(sourceRoot, 'keep/file.ts'), 'keep');
    await writeText(path.join(sourceRoot, 'omit/file.ts'), 'omit');
    const destinationRoot = path.join(rootDir, 'destination');
    await copyFixtureRepository({
      destinationRoot,
      policy: { excludedNames: ['omit'] },
      sourceRoot,
    });

    expect(await pathExists(path.join(destinationRoot, 'keep/file.ts'))).toBe(
      true,
    );
    expect(await pathExists(path.join(destinationRoot, 'omit'))).toBe(false);
  });

  it('rejects fixture source links with source and destination diagnostics', async () => {
    const rootDir = await createTemporaryRoot('copy-link');
    const sourceRoot = path.join(rootDir, 'source');
    const externalRoot = path.join(rootDir, 'external');
    await mkdir(sourceRoot, { recursive: true });
    await mkdir(externalRoot, { recursive: true });
    const linkedPath = path.join(sourceRoot, 'linked');
    await symlink(
      externalRoot,
      linkedPath,
      process.platform === 'win32' ? 'junction' : 'dir',
    );
    const destinationRoot = path.join(rootDir, 'destination');
    const error = await copyFixtureRepository({
      destinationRoot,
      sourceRoot,
    }).catch((error_: unknown) => error_);

    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toContain(linkedPath);
    expect(toPortablePath((error as Error).message)).toContain(
      toPortablePath(path.join(destinationRoot, 'linked')),
    );
    expect((error as Error).message).toContain(
      'fixture source links are not supported',
    );
  });
});

describe('controlled setup and mutation operations', () => {
  it.each(['../outside', '/absolute', 'repo\\windows', 'repo//empty'])(
    'rejects unsafe portable path %s',
    (candidate) => {
      expect(() =>
        validatePortableRelativePath(candidate, { label: 'test path' }),
      ).toThrow();
    },
  );

  it('writes UTF-8 files in declaration order and refuses implicit overwrite', async () => {
    const sandboxRoot = await createTemporaryRoot('setup-write');
    await mkdir(path.join(sandboxRoot, 'repo'), { recursive: true });
    await applyFixtureSetup({
      fixtureId: 'proof/setup',
      operations: [
        {
          content: 'first',
          kind: 'write-file',
          path: 'repo/generated/value.txt',
        },
        {
          kind: 'remove-path',
          path: 'repo/generated/value.txt',
        },
        {
          content: 'second',
          kind: 'write-file',
          path: 'repo/generated/value.txt',
        },
      ],
      sandboxRoot,
    });
    expect(
      await readFile(
        path.join(sandboxRoot, 'repo/generated/value.txt'),
        'utf8',
      ),
    ).toBe('second');
    await expect(
      applyFixtureSetup({
        fixtureId: 'proof/setup',
        operations: [
          {
            content: 'overwrite',
            kind: 'write-file',
            path: 'repo/generated/value.txt',
          },
        ],
        sandboxRoot,
      }),
    ).rejects.toThrow('target already exists');
  });

  it('does not follow an existing link while writing', async () => {
    const sandboxRoot = await createTemporaryRoot('setup-link-escape');
    const externalRoot = await createTemporaryRoot('setup-link-external');
    await mkdir(path.join(sandboxRoot, 'repo'), { recursive: true });
    await symlink(
      externalRoot,
      path.join(sandboxRoot, 'repo/linked'),
      process.platform === 'win32' ? 'junction' : 'dir',
    );

    await expect(
      applyFixtureSetup({
        fixtureId: 'proof/setup-link',
        operations: [
          {
            content: 'unsafe',
            kind: 'write-file',
            path: 'repo/linked/outside.txt',
          },
        ],
        sandboxRoot,
      }),
    ).rejects.toThrow('traverses a link');
    expect(await pathExists(path.join(externalRoot, 'outside.txt'))).toBe(
      false,
    );
  });

  it('creates a canonical directory link using the platform strategy', async () => {
    const sandboxRoot = await createTemporaryRoot('setup-directory-link');
    await mkdir(path.join(sandboxRoot, 'repo/target'), { recursive: true });
    await applyFixtureSetup({
      fixtureId: 'proof/setup-link',
      operations: [
        {
          kind: 'directory-link',
          path: 'repo/linked',
          target: 'repo/target',
        },
      ],
      sandboxRoot,
    });
    const linkPath = path.join(sandboxRoot, 'repo/linked');
    expect((await lstat(linkPath)).isSymbolicLink()).toBe(true);
    expect(toPortablePath(await realpath(linkPath))).toBe(
      toPortablePath(await realpath(path.join(sandboxRoot, 'repo/target'))),
    );
  });

  it('removes a directory link without deleting its target', async () => {
    const sandboxRoot = await createTemporaryRoot('setup-remove-link');
    await mkdir(path.join(sandboxRoot, 'repo/target'), { recursive: true });
    await applyFixtureSetup({
      fixtureId: 'proof/remove-link',
      operations: [
        {
          kind: 'directory-link',
          path: 'repo/linked',
          target: 'repo/target',
        },
        { kind: 'remove-path', path: 'repo/linked' },
      ],
      sandboxRoot,
    });

    expect(await pathExists(path.join(sandboxRoot, 'repo/linked'))).toBe(false);
    expect(await pathExists(path.join(sandboxRoot, 'repo/target'))).toBe(true);
  });

  it('protects repo and tool roots and includes operation context in failures', async () => {
    const sandboxRoot = await createTemporaryRoot('setup-protected');
    await mkdir(path.join(sandboxRoot, 'repo'), { recursive: true });
    await expect(
      applyFixtureSetup({
        fixtureId: 'proof/protected',
        operations: [{ kind: 'remove-path', path: 'repo' }],
        sandboxRoot,
      }),
    ).rejects.toThrow(
      'Detector fixture proof/protected setup operation 0 (remove-path) failed',
    );
    await expect(
      applyFixtureSetup({
        fixtureId: 'proof/protected',
        operations: [
          {
            content: 'unsafe',
            kind: 'write-file',
            path: 'repo/node_modules/unsafe.txt',
          },
        ],
        sandboxRoot,
      }),
    ).rejects.toThrow('harness-managed path repo/node_modules');
  });

  it('requires replace-text matches to exist and be unique by default', async () => {
    const sandboxRoot = await createTemporaryRoot('mutation-replace');
    await writeText(path.join(sandboxRoot, 'repo/value.txt'), 'one one');
    await expect(
      applyFixtureMutations({
        fixtureId: 'proof/mutation',
        mutations: [
          {
            kind: 'replace-text',
            path: 'repo/value.txt',
            replacement: 'two',
            search: 'missing',
          },
        ],
        sandboxRoot,
      }),
    ).rejects.toThrow('search was not found');
    await expect(
      applyFixtureMutations({
        fixtureId: 'proof/mutation',
        mutations: [
          {
            kind: 'replace-text',
            path: 'repo/value.txt',
            replacement: 'two',
            search: 'one',
          },
        ],
        sandboxRoot,
      }),
    ).rejects.toThrow('expected one match but found 2');

    await applyFixtureMutations({
      fixtureId: 'proof/mutation',
      mutations: [
        {
          all: true,
          kind: 'replace-text',
          path: 'repo/value.txt',
          replacement: 'two',
          search: 'one',
        },
      ],
      sandboxRoot,
    });
    expect(
      await readFile(path.join(sandboxRoot, 'repo/value.txt'), 'utf8'),
    ).toBe('two two');
  });

  it('treats a completed mutation state as the next explicit baseline', async () => {
    const sandboxRoot = await createTemporaryRoot('mutation-baseline');
    await writeText(path.join(sandboxRoot, 'repo/value.txt'), 'before');
    await applyFixtureMutations({
      fixtureId: 'proof/mutation-baseline',
      mutations: [
        {
          content: 'after',
          kind: 'write-file',
          path: 'repo/value.txt',
        },
      ],
      sandboxRoot,
    });
    const before = await captureTreeSnapshot({ rootDir: sandboxRoot });
    const after = await captureTreeSnapshot({ rootDir: sandboxRoot });
    expect(() =>
      assertTreeSnapshotUnchanged({
        after,
        before,
        label: 'mutation baseline',
      }),
    ).not.toThrow();
  });
});

describe('minimal tool bridge and invocation boundary', () => {
  it('bridges only declared TypeScript package metadata and executables', async () => {
    const rootDir = await createTemporaryRoot('tool-bridge');
    const repoRoot = path.join(rootDir, 'repo');
    await writeText(path.join(repoRoot, 'package.json'), '{"private":true}\n');
    const bridge = await createFixtureToolBridges({
      fixtureId: 'proof/tool',
      repoRoot,
      tools: ['typescript'],
    });
    const fixtureRequire = createRequire(path.join(repoRoot, 'package.json'));
    expect(
      toPortablePath(
        await realpath(fixtureRequire.resolve('typescript/package.json')),
      ),
    ).toBe(
      toPortablePath(
        await realpath(
          path.join(repoRoot, 'node_modules/typescript/package.json'),
        ),
      ),
    );
    expect(await pathExists(path.join(bridge.binDirectory, 'tsc'))).toBe(true);
    expect(await pathExists(path.join(bridge.binDirectory, 'tsc.cmd'))).toBe(
      true,
    );
    expect(await readdir(path.join(repoRoot, 'node_modules'))).toEqual([
      '.bin',
      'typescript',
    ]);
    expect(await pathExists(path.join(repoRoot, 'node_modules/vue-tsc'))).toBe(
      false,
    );
  });

  it('reports missing and unsupported tools with fixture context', async () => {
    const rootDir = await createTemporaryRoot('tool-errors');
    const repoRoot = path.join(rootDir, 'repo');
    await writeText(path.join(repoRoot, 'package.json'), '{"private":true}\n');
    await expect(
      createFixtureToolBridges({
        fixtureId: 'proof/missing-tool',
        repoRoot,
        resolvePackageJson: () => {
          throw new Error('/missing/typescript/package.json');
        },
        tools: ['typescript'],
      }),
    ).rejects.toThrow(
      'Detector fixture proof/missing-tool could not resolve tool typescript',
    );
    await expect(
      createFixtureToolBridges({
        fixtureId: 'proof/unsupported-tool',
        repoRoot,
        tools: ['vue-tsc'],
      }),
    ).rejects.toThrow('Only typescript is implemented');
  });

  it('does not expose an undeclared tool or create a bridge implicitly', async () => {
    const rootDir = await createTemporaryRoot('tool-empty');
    const repoRoot = path.join(rootDir, 'repo');
    await writeText(path.join(repoRoot, 'package.json'), '{"private":true}\n');
    const bridge = await createFixtureToolBridges({
      fixtureId: 'proof/no-tools',
      repoRoot,
      tools: [],
    });

    expect(bridge.bridgedTools).toEqual([]);
    expect(await pathExists(path.join(repoRoot, 'node_modules'))).toBe(false);
  });

  it('builds a no-shell executable/argv spawn spec with isolated env', () => {
    const parentPath = process.env.PATH;
    const spec = createLiminaSpawnSpec({
      args: ['--config', '/fixture/config.mts', 'check', 'detector'],
      cwd: '/fixture/repo',
      env: { ONLY_FOR_CHILD: 'yes' },
      fixtureName: 'proof/invocation',
      inheritParentEnv: false,
    });

    expect(spec.executable).toBe(process.execPath);
    expect(spec.args).toEqual([
      liminaBinPath,
      '--config',
      '/fixture/config.mts',
      'check',
      'detector',
    ]);
    expect(spec.options.cwd).toBe('/fixture/repo');
    expect(spec.options.shell).toBe(false);
    expect(spec.options.env).toMatchObject({
      CI: 'true',
      FORCE_COLOR: '0',
      ONLY_FOR_CHILD: 'yes',
    });
    expect((spec.options.env as NodeJS.ProcessEnv).npm_config_user_agent).toBe(
      undefined,
    );
    expect(process.env.PATH).toBe(parentPath);
  });

  it('isolates HOME/cache and rejects PATH overrides without mutating process.env', async () => {
    const sandboxRoot = await createTemporaryRoot('invocation-env');
    const parentEnvironment = { ...process.env };
    const environment = await createDetectorInvocationEnvironment({
      fixtureEnvironment: { FIXTURE_FLAG: 'enabled' },
      sandboxRoot,
      toolBinDirectory: path.join(sandboxRoot, 'repo/node_modules/.bin'),
    });

    expect(toPortablePath(environment.HOME ?? '')).toBe(
      toPortablePath(path.join(sandboxRoot, 'home')),
    );
    expect(toPortablePath(environment.XDG_CACHE_HOME ?? '')).toBe(
      toPortablePath(path.join(sandboxRoot, 'cache')),
    );
    expect(environment.FIXTURE_FLAG).toBe('enabled');
    expect(environment.NODE_PATH).toBeUndefined();
    expect(process.env).toEqual(parentEnvironment);
    await expect(
      createDetectorInvocationEnvironment({
        fixtureEnvironment: { PATH: '/unsafe' },
        sandboxRoot,
        toolBinDirectory: path.join(sandboxRoot, 'repo/node_modules/.bin'),
      }),
    ).rejects.toThrow('cannot override harness variable PATH');
  });
});

describe('formal structured snapshot reader', () => {
  it('reads a current completed snapshot through the product reader', async () => {
    const repoRoot = await createTemporaryRoot('snapshot-valid');
    const startedAt = Date.now() - 10;
    await writeSnapshot(repoRoot, validSnapshot());

    await expect(
      readDetectorCheckSnapshot({
        command: ['check', 'detector'],
        fixtureId: 'proof/snapshot',
        invocationStartedAtMs: startedAt,
        repoRoot,
      }),
    ).resolves.toMatchObject({
      command: 'limina check detector',
      status: 'completed',
      version: CHECK_ISSUE_SNAPSHOT_VERSION,
    });
  });

  it('distinguishes missing, invalid JSON, and invalid schema snapshots', async () => {
    const missingRoot = await createTemporaryRoot('snapshot-missing');
    await expect(
      readDetectorCheckSnapshot({
        command: ['check', 'detector'],
        fixtureId: 'proof/missing',
        invocationStartedAtMs: Date.now(),
        repoRoot: missingRoot,
      }),
    ).rejects.toThrow('did not produce structured snapshot');

    const invalidJsonRoot = await createTemporaryRoot('snapshot-json');
    await writeText(getCheckIssueSnapshotPath(invalidJsonRoot), '{invalid');
    await expect(
      readDetectorCheckSnapshot({
        command: ['check', 'detector'],
        fixtureId: 'proof/json',
        invocationStartedAtMs: Date.now(),
        repoRoot: invalidJsonRoot,
      }),
    ).rejects.toThrow('produced invalid JSON');

    const invalidSchemaRoot = await createTemporaryRoot('snapshot-schema');
    await writeSnapshot(invalidSchemaRoot, {
      ...validSnapshot(),
      version: 999,
    });
    await expect(
      readDetectorCheckSnapshot({
        command: ['check', 'detector'],
        fixtureId: 'proof/schema',
        invocationStartedAtMs: Date.now(),
        repoRoot: invalidSchemaRoot,
      }),
    ).rejects.toThrow('formal current check schema');
  });

  it('rejects preexisting, stale, and wrong-command snapshots', async () => {
    const staleRoot = await createTemporaryRoot('snapshot-stale');
    await writeSnapshot(staleRoot, validSnapshot());
    await expect(assertNoPreexistingCheckSnapshot(staleRoot)).rejects.toThrow(
      'stale structured snapshot before invocation',
    );
    await expect(
      readDetectorCheckSnapshot({
        command: ['check', 'detector'],
        fixtureId: 'proof/stale',
        invocationStartedAtMs: Date.now() + 5000,
        repoRoot: staleRoot,
      }),
    ).rejects.toThrow('structured snapshot is stale');

    const commandRoot = await createTemporaryRoot('snapshot-command');
    await writeSnapshot(commandRoot, validSnapshot('limina check other'));
    await expect(
      readDetectorCheckSnapshot({
        command: ['check', 'detector'],
        fixtureId: 'proof/command',
        invocationStartedAtMs: Date.now() - 10,
        repoRoot: commandRoot,
      }),
    ).rejects.toThrow('snapshot command mismatch');
  });
});

describe('strict structured issue assertion', () => {
  const firstExpected: ExpectedIssue = {
    code: LIMINA_CHECK_ISSUE_CODES.proofUncoveredSourceFile,
    filePath: 'packages/pkg/first.ts',
    task: 'proof:check',
  };
  const secondExpected: ExpectedIssue = {
    code: LIMINA_CHECK_ISSUE_CODES.proofUncoveredSourceFile,
    filePath: 'packages/pkg/second.ts',
    task: 'proof:check',
  };

  it('matches out of order and distinguishes identical codes by path', () => {
    expect(() =>
      assertDetectorIssues({
        actualIssues: [
          actualIssue({ filePath: 'packages/pkg/second.ts' }),
          actualIssue({ filePath: 'packages/pkg/first.ts' }),
        ],
        expected: expectedFailure([firstExpected, secondExpected]),
        fixtureId: 'proof/issues',
        repoRoot: '/repo',
      }),
    ).not.toThrow();
  });

  it('rejects missing, unexpected, reused, and ambiguous issues', () => {
    expect(() =>
      assertDetectorIssues({
        actualIssues: [],
        expected: expectedFailure([firstExpected]),
        fixtureId: 'proof/missing',
        repoRoot: '/repo',
      }),
    ).toThrow('missing an expected issue');
    expect(() =>
      assertDetectorIssues({
        actualIssues: [
          actualIssue({ filePath: 'packages/pkg/first.ts' }),
          actualIssue({
            code: LIMINA_CHECK_ISSUE_CODES.graphReferenceMissing,
            filePath: 'packages/pkg/tsconfig.json',
            task: 'graph:check',
          }),
        ],
        expected: expectedFailure([firstExpected]),
        fixtureId: 'proof/unexpected',
        repoRoot: '/repo',
      }),
    ).toThrow('produced undeclared issues');
    expect(() =>
      assertDetectorIssues({
        actualIssues: [actualIssue({ filePath: 'packages/pkg/first.ts' })],
        expected: expectedFailure([firstExpected, firstExpected]),
        fixtureId: 'proof/reused',
        repoRoot: '/repo',
      }),
    ).toThrow('missing an expected issue');
    expect(() =>
      assertDetectorIssues({
        actualIssues: [actualIssue(), actualIssue({ id: 'other-id' })],
        expected: expectedFailure([
          {
            code: LIMINA_CHECK_ISSUE_CODES.proofUncoveredSourceFile,
            task: 'proof:check',
          },
        ]),
        fixtureId: 'proof/ambiguous',
        repoRoot: '/repo',
      }),
    ).toThrow('ambiguous expected issue');
  });

  it('normalizes Windows paths and ignores title and issue ID', () => {
    expect(() =>
      assertDetectorIssues({
        actualIssues: [
          actualIssue({
            filePath: String.raw`packages\pkg\uncovered.ts`,
            id: 'changed-id',
            title: 'rewritten presentation',
          }),
        ],
        expected: expectedFailure([
          {
            code: LIMINA_CHECK_ISSUE_CODES.proofUncoveredSourceFile,
            filePath: 'packages/pkg/uncovered.ts',
            task: 'proof:check',
          },
        ]),
        fixtureId: 'proof/portable',
        repoRoot: '/repo',
      }),
    ).not.toThrow();
  });

  it('matches structured external codes and evidence subsets', () => {
    expect(() =>
      assertDetectorIssues({
        actualIssues: [
          actualIssue({
            evidence: [
              { label: 'source', value: 'packages/pkg/uncovered.ts' },
              { label: 'extra', value: 'ignored' },
            ],
            external: { code: 'TS9999', tool: 'typescript' },
          }),
        ],
        expected: expectedFailure([
          {
            code: LIMINA_CHECK_ISSUE_CODES.proofUncoveredSourceFile,
            evidence: [{ label: 'source', value: 'packages/pkg/uncovered.ts' }],
            externalCode: 'TS9999',
            filePath: 'packages/pkg/uncovered.ts',
            task: 'proof:check',
          },
        ]),
        fixtureId: 'proof/evidence',
        repoRoot: '/repo',
      }),
    ).not.toThrow();
  });

  it('allows only declared additional codes and reports truncated leftovers', () => {
    const cascade = actualIssue({
      code: LIMINA_CHECK_ISSUE_CODES.graphReferenceMissing,
      filePath: 'packages/pkg/tsconfig.json',
      task: 'graph:check',
    });
    expect(() =>
      assertDetectorIssues({
        actualIssues: [actualIssue(), cascade],
        expected: expectedFailure(
          [
            {
              code: LIMINA_CHECK_ISSUE_CODES.proofUncoveredSourceFile,
              filePath: 'packages/pkg/uncovered.ts',
              task: 'proof:check',
            },
          ],
          { additionalCodes: [LIMINA_CHECK_ISSUE_CODES.graphReferenceMissing] },
        ),
        fixtureId: 'proof/additional',
        repoRoot: '/repo',
      }),
    ).not.toThrow();

    const leftovers = Array.from({ length: 22 }, (_, index) =>
      actualIssue({ filePath: `packages/pkg/extra-${index}.ts` }),
    );
    expect(() =>
      assertDetectorIssues({
        actualIssues: leftovers,
        expected: expectedFailure([], {
          primaryCode: undefined,
        }),
        fixtureId: 'proof/truncated',
        repoRoot: '/repo',
      }),
    ).toThrow('2 more issues omitted');
  });
});

describe('source invariant and cleanup', () => {
  it('detects modified, added, and deleted inputs without using mtime', async () => {
    const rootDir = await createTemporaryRoot('invariant');
    const filePath = path.join(rootDir, 'source.ts');
    await writeText(filePath, 'original');
    const before = await captureTreeSnapshot({ rootDir });

    await utimes(filePath, new Date(), new Date(Date.now() + 1000));
    const afterMtime = await captureTreeSnapshot({ rootDir });
    expect(() =>
      assertTreeSnapshotUnchanged({
        after: afterMtime,
        before,
        label: 'mtime invariant',
      }),
    ).not.toThrow();

    await writeText(filePath, 'modified');
    await writeText(path.join(rootDir, 'added.ts'), 'added');
    const afterModified = await captureTreeSnapshot({ rootDir });
    expect(() =>
      assertTreeSnapshotUnchanged({
        after: afterModified,
        before,
        label: 'modified invariant',
      }),
    ).toThrow(/modified source\.ts[\s\S]*added added\.ts/u);

    await rm(filePath);
    const afterDeleted = await captureTreeSnapshot({ rootDir });
    expect(() =>
      assertTreeSnapshotUnchanged({
        after: afterDeleted,
        before,
        label: 'deleted invariant',
      }),
    ).toThrow('deleted source.ts');
  });

  it('allows generated additions without masking input modifications', async () => {
    const rootDir = await createTemporaryRoot('invariant-allowed');
    await writeText(path.join(rootDir, 'repo/source.ts'), 'original');
    const before = await captureTreeSnapshot({ rootDir });
    await writeText(path.join(rootDir, 'repo/dist/output.js'), 'generated');
    const generatedAfter = await captureTreeSnapshot({ rootDir });
    expect(() =>
      assertTreeSnapshotUnchanged({
        after: generatedAfter,
        allowedAddedPaths: ['repo/dist/**'],
        before,
        label: 'allowed generated output',
      }),
    ).not.toThrow();

    await writeText(path.join(rootDir, 'repo/source.ts'), 'modified');
    const modifiedAfter = await captureTreeSnapshot({ rootDir });
    expect(() =>
      assertTreeSnapshotUnchanged({
        after: modifiedAfter,
        allowedAddedPaths: ['repo/**'],
        before,
        label: 'allowed generated output',
      }),
    ).toThrow('modified repo/source.ts');
  });

  it('ignores only harness-owned .limina and tool bridge paths', async () => {
    const rootDir = await createTemporaryRoot('invariant-managed');
    await writeText(path.join(rootDir, 'repo/source.ts'), 'source');
    const before = await captureTreeSnapshot({
      ignoredPathPrefixes: DEFAULT_SANDBOX_IGNORED_PATH_PREFIXES,
      rootDir,
    });
    await writeText(path.join(rootDir, 'repo/.limina/check/result.json'), '{}');
    await writeText(path.join(rootDir, 'repo/node_modules/.bin/tsc'), 'shim');
    const after = await captureTreeSnapshot({
      ignoredPathPrefixes: DEFAULT_SANDBOX_IGNORED_PATH_PREFIXES,
      rootDir,
    });
    expect(() =>
      assertTreeSnapshotUnchanged({
        after,
        before,
        label: 'managed output invariant',
      }),
    ).not.toThrow();
  });

  it('copies without writing back to the source fixture', async () => {
    const rootDir = await createTemporaryRoot('source-unchanged');
    const sourceRoot = path.join(rootDir, 'source');
    await writeText(path.join(sourceRoot, 'source.ts'), 'source');
    const before = await captureTreeSnapshot({ rootDir: sourceRoot });
    await copyFixtureRepository({
      destinationRoot: path.join(rootDir, 'destination'),
      sourceRoot,
    });
    const after = await captureTreeSnapshot({ rootDir: sourceRoot });
    expect(() =>
      assertTreeSnapshotUnchanged({
        after,
        before,
        label: 'fixture source',
      }),
    ).not.toThrow();
  });

  it('creates unique parallel sandboxes and cleans only contained paths', async () => {
    const tempRoot = await createTemporaryRoot('cleanup-unique');
    const first = await createDetectorSandbox({
      fixtureId: 'proof/parallel',
      tempRoot,
    });
    const second = await createDetectorSandbox({
      fixtureId: 'proof/parallel',
      tempRoot,
    });
    expect(first.sandboxRoot).not.toBe(second.sandboxRoot);
    expect(path.basename(first.sandboxRoot)).toContain('proof-parallel');
    await cleanupDetectorSandbox(first);
    expect(await pathExists(first.sandboxRoot)).toBe(false);
    expect(await pathExists(second.sandboxRoot)).toBe(true);

    const outsideRoot = await createTemporaryRoot('cleanup-outside');
    await expect(
      cleanupDetectorSandbox({
        sandboxRoot: outsideRoot,
        tempRoot,
      }),
    ).rejects.toThrow('outside the integration temp root');
  });

  it('preserves on request and passes bounded Windows retry options', async () => {
    const tempRoot = await createTemporaryRoot('cleanup-preserve');
    const preserved = await createDetectorSandbox({
      fixtureId: 'proof/preserve',
      tempRoot,
    });
    await expect(
      cleanupDetectorSandbox({ ...preserved, preserve: true }),
    ).resolves.toBe(false);
    expect(await pathExists(preserved.sandboxRoot)).toBe(true);

    const retrySandbox = await createDetectorSandbox({
      fixtureId: 'proof/retry',
      tempRoot,
    });
    const remove = vi.fn(async () => {});
    await cleanupDetectorSandbox(retrySandbox, { remove });
    expect(remove).toHaveBeenCalledWith(retrySandbox.sandboxRoot, {
      force: true,
      maxRetries: SANDBOX_CLEANUP_MAX_RETRIES,
      recursive: true,
      retryDelay: SANDBOX_CLEANUP_RETRY_DELAY_MS,
    });
  });

  it('does not follow a sandbox link while recursively cleaning', async () => {
    const tempRoot = await createTemporaryRoot('cleanup-link');
    const externalRoot = await createTemporaryRoot('cleanup-link-target');
    await writeText(path.join(externalRoot, 'sentinel.txt'), 'keep');
    const sandbox = await createDetectorSandbox({
      fixtureId: 'proof/cleanup-link',
      tempRoot,
    });
    await symlink(
      externalRoot,
      path.join(sandbox.sandboxRoot, 'external-link'),
      process.platform === 'win32' ? 'junction' : 'dir',
    );
    await cleanupDetectorSandbox(sandbox);

    expect(await pathExists(path.join(externalRoot, 'sentinel.txt'))).toBe(
      true,
    );
  });

  it('keeps primary failure precedence and fails on cleanup-only errors', async () => {
    await expect(
      finishFixtureCleanup({
        cleanup: async () => {
          throw new Error('cleanup detail');
        },
        primaryError: new Error('primary detail'),
      }),
    ).rejects.toThrow(/primary detail[\s\S]*Cleanup failure: cleanup detail/u);
    await expect(
      finishFixtureCleanup({
        cleanup: async () => {
          throw new Error('cleanup only');
        },
      }),
    ).rejects.toThrow('cleanup only');
  });
});
