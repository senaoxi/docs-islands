import { createElapsedTimer } from 'logaria/helper';
import { existsSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'pathe';
import type ts from 'typescript';
import type { ResolvedLiminaConfig } from '../config';
import {
  collectDependencyGraph,
  type DependencyGraphDocument,
  type DependencyGraphView,
  stringifyDependencyGraph,
} from '../dependency-graph';
import type { LiminaFlowReporter } from '../flow';
import {
  type GeneratedTsconfigGraphResult,
  prepareGeneratedTsconfigGraph,
} from '../generated-graph';
import {
  collectImportsFromFile,
  createFileOwnerLookup,
  createImportAnalysisContext,
  findImporterForFile,
  findPackageForFile,
  findTargetProject,
  formatArtifactDependencyPolicy,
  formatImportRecordLocation,
  formatProjectLabels,
  getTypecheckConfigPath,
  type ImportRecord,
  inferPackageProject,
  isDtsProjectConfig,
  parseProject,
  type ProjectInfo,
  resolveInternalImport,
  shouldResolveThroughGraph,
} from '../graph-context';
import {
  getAllowedRefRule,
  getDeniedDepRuleForPackage,
  getDeniedDepRuleForSpecifier,
  getDeniedRefRule,
  type GraphRuleDepDeny,
  type GraphRuleRefDeny,
  type NormalizedGraphRules,
  normalizeGraphRules,
} from '../graph-rules';
import { clearCliScreen, formatErrorMessage, GraphLogger } from '../logger';
import {
  collectSourceGraphProjectExtensions,
  formatReferences,
} from '../tsconfig';
import { toRelativePath } from '../utils/path';
import {
  collectImporters,
  collectWorkspacePackages,
  findPackageForSpecifier,
  type ImporterInfo,
  type WorkspacePackage,
} from '../workspace';
import {
  createWorkspaceExportsResolutionIndex,
  type WorkspaceExportsResolutionIndex,
  type WorkspaceExportsResolutionProfile,
  type WorkspacePackageExportResolution,
} from '../workspace-exports';
import {
  addConditionDomainProblems,
  addDefaultCustomConditionProblems,
  createCustomConditionConsistencyContext,
} from './conditions';

export interface RunGraphCheckOptions {
  clearScreen?: boolean;
  flow?: LiminaFlowReporter;
  flowDepth?: number;
  generatedGraphProvider?: () => Promise<GeneratedTsconfigGraphResult>;
}

export interface RunGraphPrepareOptions {
  clearScreen?: boolean;
  flow?: LiminaFlowReporter;
  flowDepth?: number;
  generatedGraphProvider?: () => Promise<GeneratedTsconfigGraphResult>;
}

export interface RunGraphExportOptions {
  outputPath?: string;
  view?: DependencyGraphView;
}

const requiredDtsCompilerOptions: [keyof ts.CompilerOptions, unknown][] = [
  ['composite', true],
  ['incremental', true],
  ['noEmit', false],
  ['declaration', true],
];

const requiredDtsPathOptions: (keyof ts.CompilerOptions)[] = [
  'rootDir',
  'outDir',
  'tsBuildInfoFile',
];

const comparableTypecheckOptions: (keyof ts.CompilerOptions)[] = [
  'allowArbitraryExtensions',
  'allowImportingTsExtensions',
  'allowJs',
  'allowSyntheticDefaultImports',
  'baseUrl',
  'checkJs',
  'customConditions',
  'esModuleInterop',
  'exactOptionalPropertyTypes',
  'forceConsistentCasingInFileNames',
  'isolatedDeclarations',
  'isolatedModules',
  'jsx',
  'jsxImportSource',
  'lib',
  'module',
  'moduleDetection',
  'moduleResolution',
  'noFallthroughCasesInSwitch',
  'noImplicitAny',
  'noImplicitOverride',
  'noImplicitReturns',
  'noImplicitThis',
  'noPropertyAccessFromIndexSignature',
  'noUncheckedIndexedAccess',
  'paths',
  'resolveJsonModule',
  'skipLibCheck',
  'strict',
  'strictBindCallApply',
  'strictFunctionTypes',
  'strictNullChecks',
  'strictPropertyInitialization',
  'target',
  'useDefineForClassFields',
  'verbatimModuleSyntax',
];

function formatCompilerOptionValue(value: unknown): string {
  if (value === undefined) {
    return 'undefined';
  }

  return JSON.stringify(value);
}

function compilerOptionEquals(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function getGeneratedCheckerNamespace(configPath: string): string | null {
  const marker = '/.limina/tsconfig/checkers/';
  const markerIndex = configPath.indexOf(marker);

  if (markerIndex === -1) {
    return null;
  }

  const rest = configPath.slice(markerIndex + marker.length);
  const separatorIndex = rest.indexOf('/');

  return separatorIndex === -1 ? null : rest.slice(0, separatorIndex);
}

function isSameGeneratedCheckerNamespace(
  leftConfigPath: string,
  rightConfigPath: string,
): boolean {
  const leftChecker = getGeneratedCheckerNamespace(leftConfigPath);
  const rightChecker = getGeneratedCheckerNamespace(rightConfigPath);

  return !leftChecker || !rightChecker || leftChecker === rightChecker;
}

interface ReferenceExpectation {
  importRecords: ImportRecord[];
  targetProjectPath: string;
}

type ExpectedReferencesByProjectPath = Map<
  string,
  Map<string, ReferenceExpectation>
>;

interface ExpectedReferenceCollectionOptions {
  config: ResolvedLiminaConfig;
  fileOwnerLookup: Map<string, string[]>;
  generatedGraph: GeneratedTsconfigGraphResult;
  graphRules: NormalizedGraphRules;
  importers: ImporterInfo[];
  packages: WorkspacePackage[];
  problems: string[];
  projectPaths: string[];
  projects: ProjectInfo[];
  projectsByPath: Map<string, ProjectInfo>;
  selectedProjectPaths?: Set<string>;
  workspaceExports: WorkspaceExportsResolutionIndex;
}

interface ExpectedReferenceCollectionContext
  extends ExpectedReferenceCollectionOptions {
  expectedReferencesByProjectPath: ExpectedReferencesByProjectPath;
  importAnalysis: ReturnType<typeof createImportAnalysisContext>;
}

interface GraphImportResolution {
  graphResolvedFilePath: string;
  importer: ImporterInfo | null;
  resolvedFilePath: string;
  targetPackage: WorkspacePackage | null;
  targetPackageForGraph: WorkspacePackage | null;
  targetWorkspacePackageForResolved: WorkspacePackage | null;
  workspaceExportResolution: WorkspacePackageExportResolution | null;
}

function addDtsOptionProblems(
  config: ResolvedLiminaConfig,
  project: ProjectInfo,
  problems: string[],
): void {
  if (!isDtsProjectConfig(project.configPath)) {
    return;
  }

  for (const [optionName, expected] of requiredDtsCompilerOptions) {
    const actual = project.options[optionName];

    if (actual === expected) {
      continue;
    }

    problems.push(
      [
        'Invalid declaration leaf compiler option:',
        `  project: ${toRelativePath(config.rootDir, project.configPath)}`,
        `  option: compilerOptions.${optionName}`,
        `  expected: ${formatCompilerOptionValue(expected)}`,
        `  actual: ${formatCompilerOptionValue(actual)}`,
        '  reason: tsconfig*.dts.json projects are consumed by tsc -b and must emit declarations through composite incremental builds.',
      ].join('\n'),
    );
  }

  for (const optionName of requiredDtsPathOptions) {
    if (project.options[optionName]) {
      continue;
    }

    problems.push(
      [
        'Missing declaration leaf output option:',
        `  project: ${toRelativePath(config.rootDir, project.configPath)}`,
        `  option: compilerOptions.${optionName}`,
        '  reason: declaration leaves need explicit root/output state so declaration output and tsbuildinfo files do not collide.',
      ].join('\n'),
    );
  }
}

function addTypecheckParityProblems(
  config: ResolvedLiminaConfig,
  dtsProject: ProjectInfo,
  problems: string[],
): void {
  if (!isDtsProjectConfig(dtsProject.configPath)) {
    return;
  }

  const typecheckConfigPath = getTypecheckConfigPath(dtsProject.configPath);

  if (!existsSync(typecheckConfigPath)) {
    problems.push(
      [
        'Missing typecheck companion config:',
        `  declaration leaf: ${toRelativePath(config.rootDir, dtsProject.configPath)}`,
        `  expected typecheck config: ${toRelativePath(config.rootDir, typecheckConfigPath)}`,
        '  reason: every tsconfig*.dts.json project should have a matching tsconfig*.json file with the same typechecking semantics.',
      ].join('\n'),
    );
    return;
  }

  const typecheckProject = parseProject(
    config,
    typecheckConfigPath,
    dtsProject,
  );

  for (const optionName of comparableTypecheckOptions) {
    const buildValue = dtsProject.options[optionName];
    const typecheckValue = typecheckProject.options[optionName];

    if (compilerOptionEquals(buildValue, typecheckValue)) {
      continue;
    }

    problems.push(
      [
        'Typecheck option mismatch between declaration leaf and companion config:',
        `  declaration leaf: ${toRelativePath(config.rootDir, dtsProject.configPath)}`,
        `  typecheck config: ${toRelativePath(config.rootDir, typecheckConfigPath)}`,
        `  option: compilerOptions.${optionName}`,
        `  declaration value: ${formatCompilerOptionValue(buildValue)}`,
        `  typecheck value: ${formatCompilerOptionValue(typecheckValue)}`,
        '  reason: tsconfig*.dts.json should emit with the same typechecking semantics as its matching tsconfig*.json companion.',
      ].join('\n'),
    );
  }

  const typecheckFiles = new Set(typecheckProject.fileNames);
  const missingFiles = dtsProject.fileNames.filter(
    (fileName) => !typecheckFiles.has(fileName) && !fileName.endsWith('.d.ts'),
  );

  if (missingFiles.length === 0) {
    return;
  }

  problems.push(
    [
      'Declaration leaf includes files missing from its companion typecheck config:',
      `  declaration leaf: ${toRelativePath(config.rootDir, dtsProject.configPath)}`,
      `  typecheck config: ${toRelativePath(config.rootDir, typecheckConfigPath)}`,
      '  files:',
      ...missingFiles
        .slice(0, 10)
        .map((fileName) => `    - ${toRelativePath(config.rootDir, fileName)}`),
      ...(missingFiles.length > 10
        ? [`    ...and ${missingFiles.length - 10} more`]
        : []),
      '  reason: a declaration leaf must not emit declarations for files that are not covered by the matching typecheck target.',
    ].join('\n'),
  );
}

function addDeniedReferenceProblems(options: {
  config: ResolvedLiminaConfig;
  packages: WorkspacePackage[];
  problems: string[];
  project: ProjectInfo;
  projectsByPath: Map<string, ProjectInfo>;
  rules: NormalizedGraphRules;
}): void {
  if (options.project.labels.length === 0) {
    return;
  }

  for (const referencePath of options.project.references) {
    if (!options.projectsByPath.has(referencePath)) {
      continue;
    }

    const deniedRefRule = getDeniedRefRule(
      options.rules,
      options.project.labels,
      referencePath,
    );
    const targetPackage = findPackageForFile(referencePath, options.packages);
    const deniedDepRule = targetPackage
      ? getDeniedDepRuleForPackage(
          options.rules,
          options.project.labels,
          targetPackage.name,
        )
      : null;

    if (!deniedRefRule && !deniedDepRule) {
      continue;
    }

    const lines = [
      'Denied graph access:',
      `  rules: ${formatProjectLabels(options.project.labels)}`,
      `  referencing project: ${toRelativePath(options.config.rootDir, options.project.configPath)}`,
      `  referenced project: ${toRelativePath(options.config.rootDir, referencePath)}`,
    ];

    if (deniedDepRule) {
      lines.push(
        `  denied dependency: ${deniedDepRule.name}`,
        `  reason: ${deniedDepRule.reason}`,
      );
    } else if (deniedRefRule) {
      lines.push(
        `  denied ref: ${toRelativePath(options.config.rootDir, deniedRefRule.path)}`,
        `  reason: ${deniedRefRule.reason}`,
      );
    }

    options.problems.push(lines.join('\n'));
  }
}

function addDeniedDepImportProblem(options: {
  config: ResolvedLiminaConfig;
  importRecord: ImportRecord;
  project: ProjectInfo;
  problems: string[];
  rule: GraphRuleDepDeny;
}): void {
  options.problems.push(
    [
      'Denied graph access:',
      `  rules: ${formatProjectLabels(options.project.labels)}`,
      `  importing project: ${toRelativePath(options.config.rootDir, options.project.configPath)}`,
      `  file: ${formatImportRecordLocation(options.config.rootDir, options.importRecord)}`,
      `  imported specifier: ${options.importRecord.specifier}`,
      `  denied dependency: ${options.rule.name}`,
      `  reason: ${options.rule.reason}`,
    ].join('\n'),
  );
}

function addDeniedRefImportProblem(options: {
  config: ResolvedLiminaConfig;
  importRecord: ImportRecord;
  project: ProjectInfo;
  problems: string[];
  rule: GraphRuleRefDeny;
  targetProjectPath: string;
}): void {
  options.problems.push(
    [
      'Denied graph access:',
      `  rules: ${formatProjectLabels(options.project.labels)}`,
      `  importing project: ${toRelativePath(options.config.rootDir, options.project.configPath)}`,
      `  file: ${formatImportRecordLocation(options.config.rootDir, options.importRecord)}`,
      `  imported specifier: ${options.importRecord.specifier}`,
      `  target project: ${toRelativePath(options.config.rootDir, options.targetProjectPath)}`,
      `  denied ref: ${toRelativePath(options.config.rootDir, options.rule.path)}`,
      `  reason: ${options.rule.reason}`,
    ].join('\n'),
  );
}

function getNodeModulesPackageName(filePath: string): string | null {
  const parts = filePath.split('/');
  const nodeModulesIndex = parts.lastIndexOf('node_modules');

  if (nodeModulesIndex === -1) {
    return null;
  }

  const packageName = parts[nodeModulesIndex + 1];

  if (!packageName) {
    return null;
  }

  if (packageName.startsWith('@')) {
    const scopedName = parts[nodeModulesIndex + 2];

    return scopedName ? `${packageName}/${scopedName}` : null;
  }

  return packageName;
}

function getResolvedPackageName(
  filePath: string,
  packages: WorkspacePackage[],
): string | null {
  return (
    getNodeModulesPackageName(filePath) ??
    findPackageForFile(filePath, packages)?.name ??
    null
  );
}

function getResolvedWorkspacePackage(
  filePath: string,
  packages: WorkspacePackage[],
): WorkspacePackage | null {
  if (getNodeModulesPackageName(filePath)) {
    return null;
  }

  return findPackageForFile(filePath, packages);
}

function shouldUseWorkspaceExportResolution(options: {
  resolvedFilePath: string | null;
  targetPackage: WorkspacePackage | null;
}): boolean {
  if (!options.targetPackage) {
    return false;
  }

  return !options.resolvedFilePath;
}

function addWorkspaceReferenceDependencyProblems(
  config: ResolvedLiminaConfig,
  project: ProjectInfo,
  projectsByPath: Map<string, ProjectInfo>,
  packages: WorkspacePackage[],
  importers: ImporterInfo[],
  problems: string[],
): void {
  if (!isDtsProjectConfig(project.configPath)) {
    return;
  }

  const sourcePackage = findPackageForFile(project.configPath, packages);
  const importer = sourcePackage
    ? findImporterForFile(project.configPath, importers)
    : null;

  if (!sourcePackage) {
    return;
  }

  for (const referencePath of project.references) {
    if (!projectsByPath.has(referencePath)) {
      continue;
    }

    const targetPackage = findPackageForFile(referencePath, packages);

    if (!targetPackage || targetPackage.name === sourcePackage.name) {
      continue;
    }

    if (importer?.declaredWorkspaceDependencies.has(targetPackage.name)) {
      continue;
    }

    problems.push(
      [
        'Project reference crosses workspace packages without a declared dependency:',
        `  referencing project: ${toRelativePath(config.rootDir, project.configPath)}`,
        `  referenced project: ${toRelativePath(config.rootDir, referencePath)}`,
        `  referencing package: ${sourcePackage.name}`,
        `  referenced package: ${targetPackage.name}`,
        `  package manifest: ${toRelativePath(config.rootDir, path.join(sourcePackage.directory, 'package.json'))}`,
        `  reason: a cross-package project reference is a source dependency edge, so ${sourcePackage.name} must declare ${targetPackage.name} in dependencies, devDependencies, peerDependencies, or optionalDependencies.`,
        `  fix: declare "${targetPackage.name}" in the referencing package manifest. If this package intentionally consumes built artifacts, remove the project reference; ${formatArtifactDependencyPolicy(targetPackage)}`,
      ].join('\n'),
    );
  }
}

function getExpectedReferencesForProject(
  expectedReferencesByProjectPath: Map<
    string,
    Map<string, ReferenceExpectation>
  >,
  project: ProjectInfo,
): Map<string, ReferenceExpectation> {
  const expectedReferences =
    expectedReferencesByProjectPath.get(project.configPath) ?? new Map();

  expectedReferencesByProjectPath.set(project.configPath, expectedReferences);

  return expectedReferences;
}

function addExpectedReference(options: {
  expectedReferencesByProjectPath: Map<
    string,
    Map<string, ReferenceExpectation>
  >;
  importRecord: ImportRecord;
  project: ProjectInfo;
  targetProjectPath: string;
}): void {
  const expectedReferences = getExpectedReferencesForProject(
    options.expectedReferencesByProjectPath,
    options.project,
  );
  const expectation = expectedReferences.get(options.targetProjectPath) ?? {
    importRecords: [],
    targetProjectPath: options.targetProjectPath,
  };

  expectation.importRecords.push(options.importRecord);
  expectedReferences.set(options.targetProjectPath, expectation);
}

function formatImportRecordLines(
  config: ResolvedLiminaConfig,
  importRecords: ImportRecord[],
): string[] {
  return importRecords
    .slice(0, 5)
    .map(
      (importRecord) =>
        `    - ${formatImportRecordLocation(config.rootDir, importRecord)} imports ${importRecord.specifier}`,
    )
    .concat(
      importRecords.length > 5
        ? [`    ...and ${importRecords.length - 5} more`]
        : [],
    );
}

function addReferenceCompletenessProblems(options: {
  config: ResolvedLiminaConfig;
  expectedReferencesByProjectPath: Map<
    string,
    Map<string, ReferenceExpectation>
  >;
  generatedGraph: GeneratedTsconfigGraphResult;
  graphRules: NormalizedGraphRules;
  problems: string[];
  projects: ProjectInfo[];
  projectsByPath: Map<string, ProjectInfo>;
}): void {
  for (const project of options.projects) {
    if (!isDtsProjectConfig(project.configPath)) {
      continue;
    }

    const expectedReferences =
      options.expectedReferencesByProjectPath.get(project.configPath) ??
      new Map();

    for (const expectation of [...expectedReferences.values()].sort(
      (left, right) =>
        left.targetProjectPath.localeCompare(right.targetProjectPath),
    )) {
      if (project.references.has(expectation.targetProjectPath)) {
        continue;
      }

      if (
        hasProviderEdgeForReferenceExpectation({
          expectation,
          fromProjectPath: project.configPath,
          generatedGraph: options.generatedGraph,
        })
      ) {
        continue;
      }

      options.problems.push(
        [
          'Missing project reference for workspace import:',
          `  importing project: ${toRelativePath(options.config.rootDir, project.configPath)}`,
          `  expected reference: ${toRelativePath(options.config.rootDir, expectation.targetProjectPath)}`,
          `  current references: ${formatReferences(options.config.rootDir, project.references)}`,
          '  imports:',
          ...formatImportRecordLines(options.config, expectation.importRecords),
          '  fix: ensure both source tsconfig files are selected by checker.include, then run `limina graph prepare`.',
        ].join('\n'),
      );
    }

    if (project.fileNames.length === 0) {
      continue;
    }

    for (const referencePath of [...project.references].sort()) {
      if (project.configPath.endsWith('/tsconfig.dts.json')) {
        const generatedChecker = getGeneratedCheckerNamespace(
          project.configPath,
        );
        const checkerRootConfigPath = generatedChecker
          ? `/.limina/tsconfig/checkers/${generatedChecker}/projects/tsconfig.dts.json`
          : null;

        if (
          checkerRootConfigPath &&
          project.configPath.endsWith(checkerRootConfigPath)
        ) {
          continue;
        }
      }

      if (
        expectedReferences.has(referencePath) ||
        !options.projectsByPath.has(referencePath)
      ) {
        continue;
      }

      if (
        getGeneratedCheckerNamespace(project.configPath) &&
        isSameGeneratedCheckerNamespace(project.configPath, referencePath)
      ) {
        continue;
      }

      if (
        getAllowedRefRule(options.graphRules, project.labels, referencePath)
      ) {
        continue;
      }

      options.problems.push(
        [
          'Extra project reference not proven by static imports:',
          `  project: ${toRelativePath(options.config.rootDir, project.configPath)}`,
          `  extra reference: ${toRelativePath(options.config.rootDir, referencePath)}`,
          `  current references: ${formatReferences(options.config.rootDir, project.references)}`,
          '  reason: tsconfig*.dts.json references must match declaration leaves reached by static import/export analysis.',
          '  fix: remove the extra reference, import from the referenced project, or document the exception in graph.rules.<label>.allow.refs.',
        ].join('\n'),
      );
    }
  }
}

function hasProviderEdgeForReferenceExpectation(options: {
  expectation: ReferenceExpectation;
  fromProjectPath: string;
  generatedGraph: GeneratedTsconfigGraphResult;
}): boolean {
  const fromChecker = getGeneratedCheckerNamespace(options.fromProjectPath);
  const toChecker = getGeneratedCheckerNamespace(
    options.expectation.targetProjectPath,
  );
  const fromConfigPath = getGeneratedSourceConfigPath(
    options.generatedGraph,
    options.fromProjectPath,
  );
  const toConfigPath = getGeneratedSourceConfigPath(
    options.generatedGraph,
    options.expectation.targetProjectPath,
  );

  if (!fromChecker || !toChecker || !fromConfigPath || !toConfigPath) {
    return false;
  }

  return options.generatedGraph.providerEdges.some(
    (edge) =>
      edge.fromChecker === fromChecker &&
      edge.toChecker === toChecker &&
      edge.fromConfigPath === fromConfigPath &&
      edge.toConfigPath === toConfigPath,
  );
}

function createExpectedReferenceCollectionContext(
  options: ExpectedReferenceCollectionOptions,
): ExpectedReferenceCollectionContext {
  return {
    ...options,
    expectedReferencesByProjectPath: new Map(),
    importAnalysis: createImportAnalysisContext(),
  };
}

function collectExpectedReferences(
  options: ExpectedReferenceCollectionOptions,
): ExpectedReferencesByProjectPath {
  const context = createExpectedReferenceCollectionContext(options);

  for (const project of context.projects) {
    collectExpectedReferencesForProject(context, project);
  }

  return context.expectedReferencesByProjectPath;
}

function collectExpectedReferencesForProject(
  context: ExpectedReferenceCollectionContext,
  project: ProjectInfo,
): void {
  if (
    context.selectedProjectPaths &&
    !context.selectedProjectPaths.has(project.configPath)
  ) {
    return;
  }

  for (const filePath of project.ownedFileNames) {
    for (const importRecord of collectImportsFromFile(
      filePath,
      context.config.rootDir,
      context.importAnalysis,
    )) {
      collectExpectedReferenceForImport({
        context,
        filePath,
        importRecord,
        project,
      });
    }
  }
}

function collectExpectedReferenceForImport(options: {
  context: ExpectedReferenceCollectionContext;
  filePath: string;
  importRecord: ImportRecord;
  project: ProjectInfo;
}): void {
  const rawDeniedDepRule = getDeniedDepRuleForSpecifier(
    options.context.graphRules,
    options.project.labels,
    options.importRecord.specifier,
  );

  if (rawDeniedDepRule) {
    addDeniedDepImportProblem({
      config: options.context.config,
      importRecord: options.importRecord,
      problems: options.context.problems,
      project: options.project,
      rule: rawDeniedDepRule,
    });
    return;
  }

  const resolution = resolveImportForReferenceExpectation(options);

  if (!resolution) {
    return;
  }

  const targetProjectPath = findExpectedReferenceTargetProjectPath({
    context: options.context,
    importRecord: options.importRecord,
    project: options.project,
    resolution,
  });

  if (!targetProjectPath) {
    return;
  }

  addExpectedReferenceForTarget({
    context: options.context,
    importRecord: options.importRecord,
    project: options.project,
    resolution,
    targetProjectPath,
  });
}

function resolveImportForReferenceExpectation(options: {
  context: ExpectedReferenceCollectionContext;
  filePath: string;
  importRecord: ImportRecord;
  project: ProjectInfo;
}): GraphImportResolution | null {
  const targetPackage = findPackageForSpecifier(
    options.importRecord.specifier,
    options.context.packages,
  );
  const importer = findImporterForFile(
    options.importRecord.filePath,
    options.context.importers,
  );
  const workspaceExportResolution = getWorkspaceExportResolution({
    context: options.context,
    importRecord: options.importRecord,
    project: options.project,
    targetPackage,
  });
  const internalResolvedFilePath = resolveInternalImport(
    options.importRecord.specifier,
    options.filePath,
    options.project.options,
    options.project,
    options.context.importAnalysis,
  );
  const useWorkspaceExportResolution = shouldUseWorkspaceExportResolution({
    resolvedFilePath: internalResolvedFilePath,
    targetPackage,
  });
  const resolvedFilePath =
    (useWorkspaceExportResolution
      ? workspaceExportResolution?.oxcResolvedFileName
      : null) ?? internalResolvedFilePath;

  if (!resolvedFilePath) {
    addUnresolvedWorkspaceImportProblem({
      context: options.context,
      importRecord: options.importRecord,
      project: options.project,
      targetPackage,
      title: 'Unresolved workspace import:',
    });
    return null;
  }

  const graphResolvedFilePath =
    (useWorkspaceExportResolution
      ? workspaceExportResolution?.typeScriptResolvedFileName
      : null) ?? resolvedFilePath;

  if (!graphResolvedFilePath) {
    addUnresolvedWorkspaceImportProblem({
      context: options.context,
      importRecord: options.importRecord,
      project: options.project,
      targetPackage,
      title: 'Unresolved workspace import in TypeScript:',
    });
    return null;
  }

  const targetWorkspacePackageForResolved = getResolvedWorkspacePackage(
    graphResolvedFilePath,
    options.context.packages,
  );
  const targetPackageForGraph = getTargetPackageForGraph({
    targetPackage,
    targetWorkspacePackageForResolved,
    useWorkspaceExportResolution,
  });
  const deniedDepRule = getDeniedDepRuleForResolvedPackage({
    context: options.context,
    project: options.project,
    resolvedFilePath,
  });

  if (deniedDepRule) {
    addDeniedDepImportProblem({
      config: options.context.config,
      importRecord: options.importRecord,
      problems: options.context.problems,
      project: options.project,
      rule: deniedDepRule,
    });
    return null;
  }

  return {
    graphResolvedFilePath,
    importer,
    resolvedFilePath,
    targetPackage,
    targetPackageForGraph,
    targetWorkspacePackageForResolved,
    workspaceExportResolution,
  };
}

function getWorkspaceExportResolution(options: {
  context: ExpectedReferenceCollectionContext;
  importRecord: ImportRecord;
  project: ProjectInfo;
  targetPackage: WorkspacePackage | null;
}): WorkspacePackageExportResolution | null {
  if (
    !options.targetPackage ||
    !options.context.workspaceExports.hasExports(options.targetPackage.name)
  ) {
    return null;
  }

  return options.context.workspaceExports.get(
    options.project.configPath,
    options.importRecord.specifier,
  );
}

function getTargetPackageForGraph(options: {
  targetPackage: WorkspacePackage | null;
  targetWorkspacePackageForResolved: WorkspacePackage | null;
  useWorkspaceExportResolution: boolean;
}): WorkspacePackage | null {
  if (options.useWorkspaceExportResolution) {
    return options.targetPackage;
  }

  if (
    options.targetPackage &&
    options.targetWorkspacePackageForResolved?.name ===
      options.targetPackage.name
  ) {
    return options.targetPackage;
  }

  return null;
}

function getDeniedDepRuleForResolvedPackage(options: {
  context: ExpectedReferenceCollectionContext;
  project: ProjectInfo;
  resolvedFilePath: string;
}): GraphRuleDepDeny | null {
  const resolvedPackageName = getResolvedPackageName(
    options.resolvedFilePath,
    options.context.packages,
  );

  if (!resolvedPackageName) {
    return null;
  }

  return getDeniedDepRuleForPackage(
    options.context.graphRules,
    options.project.labels,
    resolvedPackageName,
  );
}

function addUnresolvedWorkspaceImportProblem(options: {
  context: ExpectedReferenceCollectionContext;
  importRecord: ImportRecord;
  project: ProjectInfo;
  targetPackage: WorkspacePackage | null;
  title: string;
}): void {
  if (!options.targetPackage) {
    return;
  }

  options.context.problems.push(
    [
      options.title,
      `  importing project: ${toRelativePath(options.context.config.rootDir, options.project.configPath)}`,
      `  file: ${formatImportRecordLocation(options.context.config.rootDir, options.importRecord)}`,
      `  imported specifier: ${options.importRecord.specifier}`,
      `  matched workspace package: ${options.targetPackage.name}`,
      `  current references: ${formatReferences(options.context.config.rootDir, options.project.references)}`,
    ].join('\n'),
  );
}

function findExpectedReferenceTargetProjectPath(options: {
  context: ExpectedReferenceCollectionContext;
  importRecord: ImportRecord;
  project: ProjectInfo;
  resolution: GraphImportResolution;
}): string | null {
  if (shouldSkipWorkspaceExportResolvedOutsideGraph(options)) {
    return null;
  }

  if (addBuildArtifactImportProblem(options)) {
    return null;
  }

  const targetProjectPath = findTargetProject({
    fileOwnerLookup: options.context.fileOwnerLookup,
    packages: options.context.packages,
    projectPaths: options.context.projectPaths,
    resolvedFilePath: options.resolution.graphResolvedFilePath,
    specifier: options.importRecord.specifier,
  });

  if (!targetProjectPath) {
    addUnmappedWorkspaceImportProblem(options);
    return null;
  }

  return getPreferredGeneratedTargetProjectPath({
    generatedGraph: options.context.generatedGraph,
    importingProjectPath: options.project.configPath,
    targetProjectPath,
  });
}

function shouldSkipWorkspaceExportResolvedOutsideGraph(options: {
  context: ExpectedReferenceCollectionContext;
  resolution: GraphImportResolution;
}): boolean {
  return Boolean(
    options.resolution.targetPackageForGraph &&
      shouldResolveThroughGraph(
        options.resolution.importer,
        options.resolution.targetPackageForGraph,
      ) &&
      options.resolution.workspaceExportResolution &&
      !options.context.fileOwnerLookup.has(
        options.resolution.graphResolvedFilePath,
      ),
  );
}

function addBuildArtifactImportProblem(options: {
  context: ExpectedReferenceCollectionContext;
  importRecord: ImportRecord;
  project: ProjectInfo;
  resolution: GraphImportResolution;
}): boolean {
  if (
    !options.resolution.targetPackageForGraph ||
    !shouldResolveThroughGraph(
      options.resolution.importer,
      options.resolution.targetPackageForGraph,
    ) ||
    options.resolution.workspaceExportResolution ||
    options.context.fileOwnerLookup.has(options.resolution.resolvedFilePath)
  ) {
    return false;
  }

  const referencedProjectPath = inferPackageProject(
    options.resolution.resolvedFilePath,
    options.resolution.targetPackageForGraph,
    options.context.projectPaths,
  );
  const hasProjectReference = Boolean(
    referencedProjectPath &&
      options.project.references.has(referencedProjectPath),
  );

  options.context.problems.push(
    [
      hasProjectReference
        ? 'Referenced workspace dependency resolves through package exports to a build artifact:'
        : 'Workspace source dependency resolved outside the source graph:',
      `  importing project: ${toRelativePath(options.context.config.rootDir, options.project.configPath)}`,
      ...(referencedProjectPath
        ? [
            `  referenced project: ${toRelativePath(options.context.config.rootDir, referencedProjectPath)}`,
            `  project reference present: ${hasProjectReference ? 'yes' : 'no'}`,
          ]
        : []),
      `  file: ${formatImportRecordLocation(options.context.config.rootDir, options.importRecord)}`,
      `  imported specifier: ${options.importRecord.specifier}`,
      `  resolved file: ${toRelativePath(options.context.config.rootDir, options.resolution.resolvedFilePath)}`,
      '  reason: this import resolved to a file not owned by the source graph, so it is not a source project-reference edge.',
      `  fix: point the dependency package export at source files, or treat this relationship as artifact consumption; ${formatArtifactDependencyPolicy(options.resolution.targetPackageForGraph)}`,
    ].join('\n'),
  );

  return true;
}

function addUnmappedWorkspaceImportProblem(options: {
  context: ExpectedReferenceCollectionContext;
  importRecord: ImportRecord;
  project: ProjectInfo;
  resolution: GraphImportResolution;
}): void {
  if (!options.resolution.targetPackageForGraph) {
    return;
  }

  if (options.resolution.graphResolvedFilePath.includes('/dist/')) {
    return;
  }

  if (!options.resolution.targetWorkspacePackageForResolved) {
    addOutsideWorkspaceGraphProblem(options);
    return;
  }

  options.context.problems.push(
    [
      'Unable to map workspace import to a graph project:',
      `  importing project: ${toRelativePath(options.context.config.rootDir, options.project.configPath)}`,
      `  file: ${formatImportRecordLocation(options.context.config.rootDir, options.importRecord)}`,
      `  imported specifier: ${options.importRecord.specifier}`,
      `  resolved file: ${toRelativePath(options.context.config.rootDir, options.resolution.graphResolvedFilePath)}`,
      `  current references: ${formatReferences(options.context.config.rootDir, options.project.references)}`,
    ].join('\n'),
  );
}

function addOutsideWorkspaceGraphProblem(options: {
  context: ExpectedReferenceCollectionContext;
  importRecord: ImportRecord;
  project: ProjectInfo;
  resolution: GraphImportResolution;
}): void {
  const targetPackage = options.resolution.targetPackageForGraph;

  if (
    !targetPackage ||
    !shouldResolveThroughGraph(options.resolution.importer, targetPackage)
  ) {
    return;
  }

  options.context.problems.push(
    [
      'Workspace source import resolved outside the workspace graph:',
      `  importing project: ${toRelativePath(options.context.config.rootDir, options.project.configPath)}`,
      `  file: ${formatImportRecordLocation(options.context.config.rootDir, options.importRecord)}`,
      `  imported specifier: ${options.importRecord.specifier}`,
      `  resolved file: ${toRelativePath(options.context.config.rootDir, options.resolution.graphResolvedFilePath)}`,
      `  reason: source dependency edges must resolve to files owned by the source graph; ${formatArtifactDependencyPolicy(targetPackage)}`,
    ].join('\n'),
  );
}

function addExpectedReferenceForTarget(options: {
  context: ExpectedReferenceCollectionContext;
  importRecord: ImportRecord;
  project: ProjectInfo;
  resolution: GraphImportResolution;
  targetProjectPath: string;
}): void {
  if (options.targetProjectPath === options.project.configPath) {
    return;
  }

  const deniedRefRule = getDeniedRefRule(
    options.context.graphRules,
    options.project.labels,
    options.targetProjectPath,
  );

  if (deniedRefRule) {
    addDeniedRefImportProblem({
      config: options.context.config,
      importRecord: options.importRecord,
      problems: options.context.problems,
      project: options.project,
      rule: deniedRefRule,
      targetProjectPath: options.targetProjectPath,
    });
    return;
  }

  if (
    options.resolution.targetPackageForGraph &&
    !shouldResolveThroughGraph(
      options.resolution.importer,
      options.resolution.targetPackageForGraph,
    )
  ) {
    return;
  }

  if (!options.context.projectsByPath.has(options.targetProjectPath)) {
    options.context.problems.push(
      [
        'Expected graph target is not reachable from any checker entry:',
        `  importing project: ${toRelativePath(options.context.config.rootDir, options.project.configPath)}`,
        `  file: ${formatImportRecordLocation(options.context.config.rootDir, options.importRecord)}`,
        `  imported specifier: ${options.importRecord.specifier}`,
        `  expected graph project: ${toRelativePath(options.context.config.rootDir, options.targetProjectPath)}`,
      ].join('\n'),
    );
    return;
  }

  addExpectedReference({
    expectedReferencesByProjectPath:
      options.context.expectedReferencesByProjectPath,
    importRecord: options.importRecord,
    project: options.project,
    targetProjectPath: options.targetProjectPath,
  });
}

function getGeneratedSourceConfigPath(
  generatedGraph: GeneratedTsconfigGraphResult,
  projectPath: string,
): string | undefined {
  for (const dtsToSource of generatedGraph.dtsToSource.values()) {
    const sourceConfigPath = dtsToSource.get(projectPath);

    if (sourceConfigPath) {
      return sourceConfigPath;
    }
  }

  return undefined;
}

function getPreferredGeneratedTargetProjectPath(options: {
  generatedGraph: GeneratedTsconfigGraphResult;
  importingProjectPath: string;
  targetProjectPath: string;
}): string {
  const importingChecker = getGeneratedCheckerNamespace(
    options.importingProjectPath,
  );

  if (!importingChecker) {
    return options.targetProjectPath;
  }

  const sourceConfigPath = getGeneratedSourceConfigPath(
    options.generatedGraph,
    options.targetProjectPath,
  );

  if (!sourceConfigPath) {
    return options.targetProjectPath;
  }

  return (
    options.generatedGraph.sourceToDts
      .get(importingChecker)
      ?.get(sourceConfigPath) ?? options.targetProjectPath
  );
}

function createWorkspaceExportsResolutionProfiles(
  projects: ProjectInfo[],
): WorkspaceExportsResolutionProfile[] {
  return projects.map((project) => ({
    checkerPresets: project.checkerPresets,
    configPath: project.configPath,
    extensions: project.extensions,
    options: project.options,
    resolverConfigPath: project.resolverConfigPath,
  }));
}

function createGeneratedGraphPathAliases(
  generatedGraph: GeneratedTsconfigGraphResult,
): Map<string, string> {
  return new Map(
    [...generatedGraph.sourceToDts.values()].flatMap((sourceToDts) => [
      ...sourceToDts.entries(),
    ]),
  );
}

async function runGraphCheckInternal(
  config: ResolvedLiminaConfig,
  options: {
    generatedGraphProvider?: () => Promise<GeneratedTsconfigGraphResult>;
    logSuccess?: boolean;
  } = {},
): Promise<boolean> {
  const generatedGraph = options.generatedGraphProvider
    ? await options.generatedGraphProvider()
    : await prepareGeneratedTsconfigGraph(config);
  const graphRoute = collectSourceGraphProjectExtensions(
    config,
    generatedGraph,
  );
  const projectPaths = [...graphRoute.projectExtensionsByPath.keys()].sort();
  const projects = projectPaths.map((projectPath) =>
    parseProject(
      config,
      projectPath,
      graphRoute.projectContextsByPath.get(projectPath),
    ),
  );
  const projectsByPath = new Map(
    projects.map((project) => [project.configPath, project]),
  );
  const fileOwnerLookup = createFileOwnerLookup(projects);
  const packages = await collectWorkspacePackages(config);
  const importers = collectImporters(config, packages);
  const problems: string[] = [...graphRoute.problems];
  const customConditionConsistencyContext =
    createCustomConditionConsistencyContext(projectsByPath);
  const workspaceExports = await createWorkspaceExportsResolutionIndex({
    config,
    packages,
    profiles: createWorkspaceExportsResolutionProfiles(projects),
  });

  problems.push(...workspaceExports.problems);

  const graphRules = normalizeGraphRules({
    config,
    include: {
      deps: true,
      refs: true,
    },
    packages,
    problems,
    projectPathAliases: createGeneratedGraphPathAliases(generatedGraph),
    projectPaths,
  });
  for (const project of projects) {
    if (project.labelProblem) {
      problems.push(project.labelProblem);
    }

    addDtsOptionProblems(config, project, problems);
    addTypecheckParityProblems(config, project, problems);
    addDeniedReferenceProblems({
      config,
      packages,
      problems,
      project,
      projectsByPath,
      rules: graphRules,
    });
    addWorkspaceReferenceDependencyProblems(
      config,
      project,
      projectsByPath,
      packages,
      importers,
      problems,
    );
  }

  addDefaultCustomConditionProblems({
    config,
    consistencyContext: customConditionConsistencyContext,
    problems,
    projects,
  });
  addConditionDomainProblems({
    config,
    consistencyContext: customConditionConsistencyContext,
    generatedGraph,
    problems,
    projectsByPath,
  });

  const expectedReferencesByProjectPath = collectExpectedReferences({
    config,
    fileOwnerLookup,
    generatedGraph,
    graphRules,
    importers,
    packages,
    problems,
    projectPaths,
    projects,
    projectsByPath,
    workspaceExports,
  });

  addReferenceCompletenessProblems({
    config,
    expectedReferencesByProjectPath,
    generatedGraph,
    graphRules,
    problems,
    projects,
    projectsByPath,
  });

  if (problems.length > 0) {
    GraphLogger.error(problems.join('\n\n'));
    return false;
  }

  if (options.logSuccess ?? true) {
    GraphLogger.success(
      `Checked ${projects.length} graph projects; references are valid.`,
    );
  }

  return true;
}

export async function runGraphPrepare(
  config: ResolvedLiminaConfig,
  options: RunGraphPrepareOptions = {},
): Promise<boolean> {
  if (options.clearScreen ?? true) {
    clearCliScreen();
  }

  const elapsed = createElapsedTimer();
  const task = options.flow?.start('graph prepare', {
    depth: options.flowDepth ?? 0,
  });

  GraphLogger.info('graph prepare started');

  try {
    const result = options.generatedGraphProvider
      ? await options.generatedGraphProvider()
      : await prepareGeneratedTsconfigGraph(config);

    if (!options.flow?.interactive) {
      GraphLogger.success(
        result.changed
          ? 'graph prepare generated files'
          : 'graph prepare found generated files up to date',
        elapsed(),
      );
    }

    task?.pass();
    return true;
  } catch (error) {
    GraphLogger.error(
      `graph prepare failed: ${formatErrorMessage(error)}`,
      elapsed(),
    );
    task?.fail('graph prepare failed', { error });
    throw error;
  }
}

export async function runGraphCheck(
  config: ResolvedLiminaConfig,
  options: RunGraphCheckOptions = {},
): Promise<boolean> {
  if (options.clearScreen ?? true) {
    clearCliScreen();
  }

  const elapsed = createElapsedTimer();
  const task = options.flow?.start('graph check', {
    depth: options.flowDepth ?? 0,
  });

  GraphLogger.info('graph check started');

  try {
    const logSuccess = !options.flow?.interactive;
    const passed = await runGraphCheckInternal(config, {
      generatedGraphProvider: options.generatedGraphProvider,
      logSuccess,
    });

    if (passed) {
      if (logSuccess) {
        GraphLogger.success('graph check finished', elapsed());
      }

      task?.pass();
    } else {
      GraphLogger.error('graph check finished with failures', elapsed());
      task?.fail('graph check finished with failures');
    }

    return passed;
  } catch (error) {
    GraphLogger.error(
      `graph check failed: ${formatErrorMessage(error)}`,
      elapsed(),
    );
    task?.fail('graph check failed', { error });
    throw error;
  }
}

export async function runGraphExport(
  config: ResolvedLiminaConfig,
  options: RunGraphExportOptions = {},
): Promise<DependencyGraphDocument> {
  const graph = await collectDependencyGraph(config, {
    view: options.view,
  });

  if (options.outputPath) {
    await mkdir(path.dirname(options.outputPath), { recursive: true });
    await writeFile(options.outputPath, stringifyDependencyGraph(graph));
  }

  return graph;
}
