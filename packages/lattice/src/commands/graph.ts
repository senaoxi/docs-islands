import { createElapsedTimer } from '@docs-islands/logger/helper';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import ts from 'typescript';
import type { ResolvedLatticeConfig } from '../config';
import type { LatticeFlowReporter } from '../flow';
import { GraphLogger, clearCliScreen, formatErrorMessage } from '../logger';
import {
  collectGraphProjectRoute,
  formatReferences,
  getDtsCompanionConfigPath,
  getRawReferencePaths,
  isDtsConfigPath,
  readJsonConfig,
} from '../tsconfig';
import {
  isPathInsideDirectory,
  normalizeAbsolutePath,
  toRelativePath,
} from '../utils/path';
import {
  collectImporters,
  collectWorkspacePackages,
  findPackageForSpecifier,
  type ImporterInfo,
  type WorkspacePackage,
} from '../workspace';

interface ProjectInfo {
  configPath: string;
  fileNames: string[];
  label: string | null;
  labelProblem: string | null;
  options: ts.CompilerOptions;
  references: Set<string>;
}

interface ImportRecord {
  filePath: string;
  line: number;
  specifier: string;
}

export interface RunGraphCheckOptions {
  clearScreen?: boolean;
  flow?: LatticeFlowReporter;
  flowDepth?: number;
}

interface GraphRuleRefDeny {
  path: string;
  reason: string;
}

interface GraphRuleDepDeny {
  name: string;
  reason: string;
}

interface NormalizedGraphRules {
  depsByLabel: Map<string, Map<string, GraphRuleDepDeny>>;
  refsByLabel: Map<string, Map<string, GraphRuleRefDeny>>;
}

const requiredDtsCompilerOptions: [keyof ts.CompilerOptions, unknown][] = [
  ['composite', true],
  ['incremental', true],
  ['noEmit', false],
  ['declaration', true],
  ['emitDeclarationOnly', true],
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
  'resolveJsonModule',
  'skipLibCheck',
  'strict',
  'strictBindCallApply',
  'strictFunctionTypes',
  'strictNullChecks',
  'strictPropertyInitialization',
  'target',
  'typeRoots',
  'types',
  'useDefineForClassFields',
  'verbatimModuleSyntax',
];

function isRelativeSpecifier(specifier: string): boolean {
  return (
    specifier === '.' ||
    specifier === '..' ||
    specifier.startsWith('./') ||
    specifier.startsWith('../')
  );
}

function isDtsProjectConfig(configPath: string): boolean {
  return isDtsConfigPath(configPath);
}

function getTypecheckConfigPath(dtsConfigPath: string): string {
  return getDtsCompanionConfigPath(dtsConfigPath);
}

function formatUnknownValue(value: unknown): string {
  if (value === undefined) {
    return 'undefined';
  }

  return JSON.stringify(value);
}

function readProjectLabel(
  config: ResolvedLatticeConfig,
  configPath: string,
): Pick<ProjectInfo, 'label' | 'labelProblem'> {
  if (!isDtsProjectConfig(configPath)) {
    return {
      label: null,
      labelProblem: null,
    };
  }

  const configObject = readJsonConfig(config, configPath);

  if (!Object.hasOwn(configObject, 'lattice')) {
    return {
      label: null,
      labelProblem: null,
    };
  }

  const value = configObject.lattice;

  if (typeof value === 'string' && value.trim()) {
    return {
      label: value.trim(),
      labelProblem: null,
    };
  }

  return {
    label: null,
    labelProblem: [
      'Invalid Lattice graph label:',
      `  project: ${toRelativePath(config.rootDir, configPath)}`,
      `  field: lattice`,
      `  value: ${formatUnknownValue(value)}`,
      '  reason: tsconfig*.dts.json may declare one non-empty string label with "lattice".',
    ].join('\n'),
  };
}

function parseProject(
  config: ResolvedLatticeConfig,
  configPath: string,
): ProjectInfo {
  const diagnostics: ts.Diagnostic[] = [];
  const parsed = ts.getParsedCommandLineOfConfigFile(
    configPath,
    {},
    {
      ...ts.sys,
      onUnRecoverableConfigFileDiagnostic: (diagnostic) => {
        diagnostics.push(diagnostic);
      },
    },
  );

  if (!parsed) {
    throw new Error(
      ts.formatDiagnosticsWithColorAndContext(diagnostics, {
        getCanonicalFileName: (fileName) => fileName,
        getCurrentDirectory: () => config.rootDir,
        getNewLine: () => '\n',
      }),
    );
  }

  if (parsed.errors.length > 0) {
    throw new Error(
      ts.formatDiagnosticsWithColorAndContext(parsed.errors, {
        getCanonicalFileName: (fileName) => fileName,
        getCurrentDirectory: () => config.rootDir,
        getNewLine: () => '\n',
      }),
    );
  }

  const labelInfo = readProjectLabel(config, configPath);

  return {
    configPath: normalizeAbsolutePath(configPath),
    fileNames: parsed.fileNames
      .filter((fileName) => /\.(?:[cm]?tsx?|d\.[cm]?ts)$/u.test(fileName))
      .map(normalizeAbsolutePath),
    label: labelInfo.label,
    labelProblem: labelInfo.labelProblem,
    options: parsed.options,
    references: new Set(getRawReferencePaths(config, configPath)),
  };
}

function formatCompilerOptionValue(value: unknown): string {
  if (value === undefined) {
    return 'undefined';
  }

  return JSON.stringify(value);
}

function compilerOptionEquals(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function getRulesRecord(
  config: ResolvedLatticeConfig,
  problems: string[],
): Record<string, unknown> {
  const rules = config.graph?.rules;

  if (rules === undefined) {
    return {};
  }

  if (!isPlainRecord(rules)) {
    problems.push(
      [
        'Invalid graph rules config:',
        '  field: graph.rules',
        `  value: ${formatUnknownValue(rules)}`,
        '  reason: graph.rules must be an object keyed by Lattice labels.',
      ].join('\n'),
    );
    return {};
  }

  return rules;
}

function addRuleEntryConfigProblem(
  problems: string[],
  details: string[],
): void {
  problems.push(['Invalid graph rule config:', ...details].join('\n'));
}

function addNormalizedRuleRef(options: {
  config: ResolvedLatticeConfig;
  entry: unknown;
  index: number;
  label: string;
  problems: string[];
  projectPathSet: Set<string>;
  refsByLabel: Map<string, Map<string, GraphRuleRefDeny>>;
}): void {
  const field = `graph.rules.${options.label}.deny.refs[${options.index}]`;

  if (!isPlainRecord(options.entry)) {
    addRuleEntryConfigProblem(options.problems, [
      `  field: ${field}`,
      `  value: ${formatUnknownValue(options.entry)}`,
      '  reason: deny.refs entries must be objects with non-empty path and reason fields.',
    ]);
    return;
  }

  const pathValue = options.entry.path;
  const reasonValue = options.entry.reason;

  if (!isNonEmptyString(pathValue)) {
    addRuleEntryConfigProblem(options.problems, [
      `  field: ${field}.path`,
      `  value: ${formatUnknownValue(pathValue)}`,
      '  reason: deny.refs path is required and must be a non-empty string.',
    ]);
    return;
  }

  if (!isNonEmptyString(reasonValue)) {
    addRuleEntryConfigProblem(options.problems, [
      `  field: ${field}.reason`,
      `  value: ${formatUnknownValue(reasonValue)}`,
      '  reason: deny.refs reason is required and must be a non-empty string.',
    ]);
    return;
  }

  const refPath = normalizeAbsolutePath(
    path.resolve(options.config.rootDir, pathValue),
  );

  if (!options.projectPathSet.has(refPath)) {
    addRuleEntryConfigProblem(options.problems, [
      `  field: ${field}.path`,
      `  path: ${pathValue}`,
      '  reason: deny.refs path must point to a project reachable from a checker entry.',
    ]);
    return;
  }

  if (!isDtsProjectConfig(refPath)) {
    addRuleEntryConfigProblem(options.problems, [
      `  field: ${field}.path`,
      `  path: ${pathValue}`,
      '  reason: deny.refs path must point to a tsconfig*.dts.json declaration leaf.',
    ]);
    return;
  }

  const refs = options.refsByLabel.get(options.label) ?? new Map();

  refs.set(refPath, {
    path: refPath,
    reason: reasonValue.trim(),
  });
  options.refsByLabel.set(options.label, refs);
}

function addNormalizedRuleDep(options: {
  depsByLabel: Map<string, Map<string, GraphRuleDepDeny>>;
  entry: unknown;
  index: number;
  label: string;
  packageNames: Set<string>;
  problems: string[];
}): void {
  const field = `graph.rules.${options.label}.deny.deps[${options.index}]`;

  if (!isPlainRecord(options.entry)) {
    addRuleEntryConfigProblem(options.problems, [
      `  field: ${field}`,
      `  value: ${formatUnknownValue(options.entry)}`,
      '  reason: deny.deps entries must be objects with non-empty name and reason fields.',
    ]);
    return;
  }

  const nameValue = options.entry.name;
  const reasonValue = options.entry.reason;

  if (!isNonEmptyString(nameValue)) {
    addRuleEntryConfigProblem(options.problems, [
      `  field: ${field}.name`,
      `  value: ${formatUnknownValue(nameValue)}`,
      '  reason: deny.deps name is required and must be a non-empty string.',
    ]);
    return;
  }

  if (!isNonEmptyString(reasonValue)) {
    addRuleEntryConfigProblem(options.problems, [
      `  field: ${field}.reason`,
      `  value: ${formatUnknownValue(reasonValue)}`,
      '  reason: deny.deps reason is required and must be a non-empty string.',
    ]);
    return;
  }

  const packageName = nameValue.trim();

  if (!options.packageNames.has(packageName)) {
    addRuleEntryConfigProblem(options.problems, [
      `  field: ${field}.name`,
      `  name: ${packageName}`,
      '  reason: deny.deps name must match a discovered workspace package.',
    ]);
    return;
  }

  const deps = options.depsByLabel.get(options.label) ?? new Map();

  deps.set(packageName, {
    name: packageName,
    reason: reasonValue.trim(),
  });
  options.depsByLabel.set(options.label, deps);
}

function normalizeGraphRules(options: {
  config: ResolvedLatticeConfig;
  packages: WorkspacePackage[];
  problems: string[];
  projectPaths: string[];
}): NormalizedGraphRules {
  const refsByLabel = new Map<string, Map<string, GraphRuleRefDeny>>();
  const depsByLabel = new Map<string, Map<string, GraphRuleDepDeny>>();
  const projectPathSet = new Set(options.projectPaths);
  const packageNames = new Set(
    options.packages.map((workspacePackage) => workspacePackage.name),
  );

  for (const [rawLabel, rawRule] of Object.entries(
    getRulesRecord(options.config, options.problems),
  )) {
    const label = rawLabel.trim();

    if (!label) {
      addRuleEntryConfigProblem(options.problems, [
        '  field: graph.rules',
        '  reason: graph.rules keys must be non-empty labels.',
      ]);
      continue;
    }

    if (!isPlainRecord(rawRule)) {
      addRuleEntryConfigProblem(options.problems, [
        `  field: graph.rules.${rawLabel}`,
        `  value: ${formatUnknownValue(rawRule)}`,
        '  reason: each graph rule must be an object.',
      ]);
      continue;
    }

    if (rawRule.deny === undefined) {
      continue;
    }

    if (!isPlainRecord(rawRule.deny)) {
      addRuleEntryConfigProblem(options.problems, [
        `  field: graph.rules.${label}.deny`,
        `  value: ${formatUnknownValue(rawRule.deny)}`,
        '  reason: graph rule deny must be an object.',
      ]);
      continue;
    }

    const refs = rawRule.deny.refs;

    if (refs !== undefined) {
      if (!Array.isArray(refs)) {
        addRuleEntryConfigProblem(options.problems, [
          `  field: graph.rules.${label}.deny.refs`,
          `  value: ${formatUnknownValue(refs)}`,
          '  reason: deny.refs must be an array.',
        ]);
      } else {
        refs.forEach((entry, index) => {
          addNormalizedRuleRef({
            config: options.config,
            entry,
            index,
            label,
            problems: options.problems,
            projectPathSet,
            refsByLabel,
          });
        });
      }
    }

    const deps = rawRule.deny.deps;

    if (deps !== undefined) {
      if (!Array.isArray(deps)) {
        addRuleEntryConfigProblem(options.problems, [
          `  field: graph.rules.${label}.deny.deps`,
          `  value: ${formatUnknownValue(deps)}`,
          '  reason: deny.deps must be an array.',
        ]);
      } else {
        deps.forEach((entry, index) => {
          addNormalizedRuleDep({
            depsByLabel,
            entry,
            index,
            label,
            packageNames,
            problems: options.problems,
          });
        });
      }
    }
  }

  return {
    depsByLabel,
    refsByLabel,
  };
}

function addDtsOptionProblems(
  config: ResolvedLatticeConfig,
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
  config: ResolvedLatticeConfig,
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

  const typecheckProject = parseProject(config, typecheckConfigPath);

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
    (fileName) => !typecheckFiles.has(fileName),
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

function getSourceFileKind(filePath: string): ts.ScriptKind {
  if (filePath.endsWith('.tsx')) {
    return ts.ScriptKind.TSX;
  }

  if (filePath.endsWith('.jsx')) {
    return ts.ScriptKind.JSX;
  }

  return ts.ScriptKind.TS;
}

function stringLiteralValue(node: ts.Node | undefined): string | null {
  return node && ts.isStringLiteralLike(node) ? node.text : null;
}

function collectImportsFromFile(filePath: string): ImportRecord[] {
  const sourceText = readFileSync(filePath, 'utf8');
  const sourceFile = ts.createSourceFile(
    filePath,
    sourceText,
    ts.ScriptTarget.Latest,
    true,
    getSourceFileKind(filePath),
  );
  const imports: ImportRecord[] = [];
  const addImport = (specifier: string, node: ts.Node): void => {
    const location = sourceFile.getLineAndCharacterOfPosition(
      node.getStart(sourceFile),
    );

    imports.push({
      filePath,
      line: location.line + 1,
      specifier,
    });
  };
  const visit = (node: ts.Node): void => {
    if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) {
      const specifier = stringLiteralValue(node.moduleSpecifier);

      if (specifier) {
        addImport(specifier, node);
      }
    } else if (ts.isImportTypeNode(node)) {
      const specifier = ts.isLiteralTypeNode(node.argument)
        ? stringLiteralValue(node.argument.literal)
        : null;

      if (specifier) {
        addImport(specifier, node);
      }
    } else if (
      ts.isCallExpression(node) &&
      node.expression.kind === ts.SyntaxKind.ImportKeyword
    ) {
      const specifier = stringLiteralValue(node.arguments[0]);

      if (specifier) {
        addImport(specifier, node);
      }
    }

    ts.forEachChild(node, visit);
  };

  visit(sourceFile);

  return imports;
}

function resolveInternalImport(
  specifier: string,
  containingFile: string,
  options: ts.CompilerOptions,
): string | null {
  const resolved = ts.resolveModuleName(
    specifier,
    containingFile,
    options,
    ts.sys,
  ).resolvedModule;

  return resolved?.resolvedFileName
    ? normalizeAbsolutePath(resolved.resolvedFileName)
    : null;
}

function getDeniedRefRule(
  rules: NormalizedGraphRules,
  label: string | null,
  targetProjectPath: string,
): GraphRuleRefDeny | null {
  if (!label) {
    return null;
  }

  return rules.refsByLabel.get(label)?.get(targetProjectPath) ?? null;
}

function getDeniedDepRule(
  rules: NormalizedGraphRules,
  label: string | null,
  targetPackageName: string,
): GraphRuleDepDeny | null {
  if (!label) {
    return null;
  }

  return rules.depsByLabel.get(label)?.get(targetPackageName) ?? null;
}

function chooseOwningProject(projectPaths: string[]): string {
  return [...projectPaths].sort((left, right) => {
    const directoryDepthDelta =
      path.dirname(right).length - path.dirname(left).length;

    return directoryDepthDelta === 0
      ? left.localeCompare(right)
      : directoryDepthDelta;
  })[0]!;
}

function findPackageForFile(
  filePath: string,
  packages: WorkspacePackage[],
): WorkspacePackage | null {
  return (
    [...packages]
      .sort((left, right) => right.directory.length - left.directory.length)
      .find((workspacePackage) =>
        isPathInsideDirectory(filePath, workspacePackage.directory),
      ) ?? null
  );
}

function isWorkspacePackageFile(
  filePath: string,
  packages: WorkspacePackage[],
): boolean {
  return packages.some((workspacePackage) =>
    isPathInsideDirectory(filePath, workspacePackage.directory),
  );
}

function findImporterForFile(
  filePath: string,
  importers: ImporterInfo[],
): ImporterInfo | null {
  return (
    importers.find((importer) =>
      isPathInsideDirectory(filePath, importer.directory),
    ) ?? null
  );
}

function shouldResolveThroughGraph(
  importer: ImporterInfo | null,
  targetPackage: WorkspacePackage | null,
): boolean {
  if (!importer || !targetPackage) {
    return false;
  }

  return (
    importer.name === targetPackage.name ||
    importer.workspaceDependencies.has(targetPackage.name)
  );
}

function formatArtifactDependencyPolicy(
  targetPackage: WorkspacePackage,
): string {
  return targetPackage.manifest.private === true
    ? 'private workspace packages cannot be consumed from a registry, so artifact consumers should use link: and should not keep a project reference.'
    : 'artifact consumers should use link: for local dist output, or catalog:/semver to consume the published production package, and should not keep a project reference.';
}

function inferPackageProject(
  resolvedFilePath: string,
  workspacePackage: WorkspacePackage,
  projectPaths: string[],
): string | null {
  if (!isPathInsideDirectory(resolvedFilePath, workspacePackage.directory)) {
    return null;
  }

  return (
    projectPaths.find((projectPath) => {
      return (
        projectPath.startsWith(`${workspacePackage.directory}/`) &&
        projectPath.endsWith('/tsconfig.lib.dts.json')
      );
    }) ?? null
  );
}

function createFileOwnerLookup(projects: ProjectInfo[]): Map<string, string[]> {
  const ownerLookup = new Map<string, string[]>();

  for (const project of projects) {
    for (const fileName of project.fileNames) {
      const owners = ownerLookup.get(fileName) ?? [];

      owners.push(project.configPath);
      ownerLookup.set(fileName, owners);
    }
  }

  return ownerLookup;
}

function findTargetProject(options: {
  fileOwnerLookup: Map<string, string[]>;
  packages: WorkspacePackage[];
  projectPaths: string[];
  resolvedFilePath: string;
  specifier: string;
}): string | null {
  const ownerProjects = options.fileOwnerLookup.get(options.resolvedFilePath);

  if (ownerProjects && ownerProjects.length > 0) {
    return chooseOwningProject(ownerProjects);
  }

  const workspacePackage = findPackageForSpecifier(
    options.specifier,
    options.packages,
  );

  if (!workspacePackage) {
    return null;
  }

  return inferPackageProject(
    options.resolvedFilePath,
    workspacePackage,
    options.projectPaths,
  );
}

function addDeniedReferenceProblems(options: {
  config: ResolvedLatticeConfig;
  packages: WorkspacePackage[];
  problems: string[];
  project: ProjectInfo;
  projectsByPath: Map<string, ProjectInfo>;
  rules: NormalizedGraphRules;
}): void {
  if (!options.project.label) {
    return;
  }

  for (const referencePath of options.project.references) {
    if (!options.projectsByPath.has(referencePath)) {
      continue;
    }

    const deniedRefRule = getDeniedRefRule(
      options.rules,
      options.project.label,
      referencePath,
    );
    const targetPackage = findPackageForFile(referencePath, options.packages);
    const deniedDepRule = targetPackage
      ? getDeniedDepRule(
          options.rules,
          options.project.label,
          targetPackage.name,
        )
      : null;

    if (!deniedRefRule && !deniedDepRule) {
      continue;
    }

    const lines = [
      'Denied graph access:',
      `  rule: ${options.project.label}`,
      `  referencing project: ${toRelativePath(options.config.rootDir, options.project.configPath)}`,
      `  referenced project: ${toRelativePath(options.config.rootDir, referencePath)}`,
    ];

    if (deniedRefRule) {
      lines.push(
        `  denied ref: ${toRelativePath(options.config.rootDir, deniedRefRule.path)}`,
        `  reason: ${deniedRefRule.reason}`,
      );
    } else if (deniedDepRule) {
      lines.push(
        `  denied dependency: ${deniedDepRule.name}`,
        `  reason: ${deniedDepRule.reason}`,
      );
    }

    options.problems.push(lines.join('\n'));
  }
}

function addDeniedPackageImportProblem(options: {
  config: ResolvedLatticeConfig;
  importRecord: ImportRecord;
  project: ProjectInfo;
  problems: string[];
  rule: GraphRuleDepDeny;
}): void {
  options.problems.push(
    [
      'Denied graph access:',
      `  rule: ${options.project.label}`,
      `  importing project: ${toRelativePath(options.config.rootDir, options.project.configPath)}`,
      `  file: ${toRelativePath(options.config.rootDir, options.importRecord.filePath)}:${options.importRecord.line}`,
      `  imported specifier: ${options.importRecord.specifier}`,
      `  denied dependency: ${options.rule.name}`,
      `  reason: ${options.rule.reason}`,
    ].join('\n'),
  );
}

function addDeniedRefImportProblem(options: {
  config: ResolvedLatticeConfig;
  importRecord: ImportRecord;
  project: ProjectInfo;
  problems: string[];
  rule: GraphRuleRefDeny;
  targetProjectPath: string;
}): void {
  options.problems.push(
    [
      'Denied graph access:',
      `  rule: ${options.project.label}`,
      `  importing project: ${toRelativePath(options.config.rootDir, options.project.configPath)}`,
      `  file: ${toRelativePath(options.config.rootDir, options.importRecord.filePath)}:${options.importRecord.line}`,
      `  imported specifier: ${options.importRecord.specifier}`,
      `  target project: ${toRelativePath(options.config.rootDir, options.targetProjectPath)}`,
      `  denied ref: ${toRelativePath(options.config.rootDir, options.rule.path)}`,
      `  reason: ${options.rule.reason}`,
    ].join('\n'),
  );
}

function addWorkspaceReferenceDependencyProblems(
  config: ResolvedLatticeConfig,
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

    if (importer?.workspaceDependencies.has(targetPackage.name)) {
      continue;
    }

    problems.push(
      [
        'Project reference crosses workspace packages without a workspace:* dependency:',
        `  referencing project: ${toRelativePath(config.rootDir, project.configPath)}`,
        `  referenced project: ${toRelativePath(config.rootDir, referencePath)}`,
        `  referencing package: ${sourcePackage.name}`,
        `  referenced package: ${targetPackage.name}`,
        `  package manifest: ${toRelativePath(config.rootDir, path.join(sourcePackage.directory, 'package.json'))}`,
        `  reason: a cross-package tsconfig*.dts.json reference is a source dependency edge, so ${sourcePackage.name} must declare ${targetPackage.name} with the workspace: protocol.`,
        `  fix: add "${targetPackage.name}": "workspace:*" to dependencies, devDependencies, peerDependencies, or optionalDependencies in the referencing package manifest. If this package intentionally consumes built artifacts, remove the project reference; ${formatArtifactDependencyPolicy(targetPackage)}`,
      ].join('\n'),
    );
  }
}

async function runGraphCheckInternal(
  config: ResolvedLatticeConfig,
  options: { logSuccess?: boolean } = {},
): Promise<boolean> {
  const graphRoute = collectGraphProjectRoute(config);
  const projectPaths = graphRoute.projectPaths;
  const projects = projectPaths.map((projectPath) =>
    parseProject(config, projectPath),
  );
  const projectsByPath = new Map(
    projects.map((project) => [project.configPath, project]),
  );
  const fileOwnerLookup = createFileOwnerLookup(projects);
  const packages = await collectWorkspacePackages(config);
  const importers = collectImporters(config, packages);
  const problems: string[] = [...graphRoute.problems];
  const graphRules = normalizeGraphRules({
    config,
    packages,
    problems,
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

    for (const filePath of project.fileNames) {
      for (const importRecord of collectImportsFromFile(filePath)) {
        const resolvedFilePath = resolveInternalImport(
          importRecord.specifier,
          filePath,
          project.options,
        );
        const targetPackage = findPackageForSpecifier(
          importRecord.specifier,
          packages,
        );
        const importer = targetPackage
          ? findImporterForFile(importRecord.filePath, importers)
          : null;
        const unresolvedDeniedDepRule = targetPackage
          ? getDeniedDepRule(graphRules, project.label, targetPackage.name)
          : null;

        if (!resolvedFilePath) {
          if (unresolvedDeniedDepRule) {
            addDeniedPackageImportProblem({
              config,
              importRecord,
              problems,
              project,
              rule: unresolvedDeniedDepRule,
            });
            continue;
          }

          if (!targetPackage) {
            continue;
          }

          problems.push(
            [
              'Unresolved workspace import:',
              `  importing project: ${toRelativePath(config.rootDir, project.configPath)}`,
              `  file: ${toRelativePath(config.rootDir, importRecord.filePath)}:${importRecord.line}`,
              `  imported specifier: ${importRecord.specifier}`,
              `  matched workspace package: ${targetPackage.name}`,
              `  current references: ${formatReferences(config.rootDir, project.references)}`,
            ].join('\n'),
          );
          continue;
        }

        const targetWorkspacePackageForResolved = findPackageForFile(
          resolvedFilePath,
          packages,
        );
        const deniedDepRule =
          (targetPackage
            ? getDeniedDepRule(graphRules, project.label, targetPackage.name)
            : null) ??
          (targetWorkspacePackageForResolved
            ? getDeniedDepRule(
                graphRules,
                project.label,
                targetWorkspacePackageForResolved.name,
              )
            : null);

        if (deniedDepRule) {
          addDeniedPackageImportProblem({
            config,
            importRecord,
            problems,
            project,
            rule: deniedDepRule,
          });
          continue;
        }

        if (isRelativeSpecifier(importRecord.specifier)) {
          const sourcePackage = findPackageForFile(
            importRecord.filePath,
            packages,
          );

          if (
            sourcePackage &&
            targetWorkspacePackageForResolved &&
            sourcePackage.name !== targetWorkspacePackageForResolved.name
          ) {
            problems.push(
              [
                'Cross-package relative import:',
                `  importing project: ${toRelativePath(config.rootDir, project.configPath)}`,
                `  file: ${toRelativePath(config.rootDir, importRecord.filePath)}:${importRecord.line}`,
                `  imported specifier: ${importRecord.specifier}`,
                `  source package: ${sourcePackage.name}`,
                `  target package: ${targetWorkspacePackageForResolved.name}`,
                `  resolved file: ${toRelativePath(config.rootDir, resolvedFilePath)}`,
                '  reason: workspace packages must depend through package exports.',
              ].join('\n'),
            );
            continue;
          }
        }

        if (
          targetPackage &&
          !shouldResolveThroughGraph(importer, targetPackage)
        ) {
          continue;
        }

        if (
          targetPackage &&
          shouldResolveThroughGraph(importer, targetPackage) &&
          !fileOwnerLookup.has(resolvedFilePath)
        ) {
          const referencedProjectPath = inferPackageProject(
            resolvedFilePath,
            targetPackage,
            projectPaths,
          );
          const hasProjectReference =
            referencedProjectPath &&
            project.references.has(referencedProjectPath);

          problems.push(
            [
              hasProjectReference
                ? 'Referenced workspace dependency resolves through package exports to a build artifact:'
                : 'Workspace source dependency resolved outside the source graph:',
              `  importing project: ${toRelativePath(config.rootDir, project.configPath)}`,
              ...(referencedProjectPath
                ? [
                    `  referenced project: ${toRelativePath(config.rootDir, referencedProjectPath)}`,
                    `  project reference present: ${hasProjectReference ? 'yes' : 'no'}`,
                  ]
                : []),
              `  file: ${toRelativePath(config.rootDir, importRecord.filePath)}:${importRecord.line}`,
              `  imported specifier: ${importRecord.specifier}`,
              `  resolved file: ${toRelativePath(config.rootDir, resolvedFilePath)}`,
              '  reason: workspace:* dependencies are source dependencies, but TypeScript resolved this package export to a file not owned by the source graph. tsc -b does not rewrite package exports through project references.',
              `  fix: expose source files from the dependency package exports, add a source paths config to this declaration leaf extends, or stop using workspace:* plus project references for artifact consumption; ${formatArtifactDependencyPolicy(targetPackage)}`,
              '  hint: run `lattice paths generate` to create a compatibility paths file, then manually add it to the first position of the listed tsconfig*.dts.json extends array.',
            ].join('\n'),
          );
          continue;
        }

        const targetProjectPath = findTargetProject({
          fileOwnerLookup,
          packages,
          projectPaths,
          resolvedFilePath,
          specifier: importRecord.specifier,
        });

        if (!targetProjectPath) {
          if (!targetPackage) {
            continue;
          }

          if (!isWorkspacePackageFile(resolvedFilePath, packages)) {
            if (
              targetPackage &&
              shouldResolveThroughGraph(importer, targetPackage)
            ) {
              problems.push(
                [
                  'Workspace source import resolved outside the workspace graph:',
                  `  importing project: ${toRelativePath(config.rootDir, project.configPath)}`,
                  `  file: ${toRelativePath(config.rootDir, importRecord.filePath)}:${importRecord.line}`,
                  `  imported specifier: ${importRecord.specifier}`,
                  `  resolved file: ${toRelativePath(config.rootDir, resolvedFilePath)}`,
                  `  reason: workspace:* dependencies are source dependency edges and must resolve to files owned by the source graph; ${formatArtifactDependencyPolicy(targetPackage)}`,
                ].join('\n'),
              );
            }
            continue;
          }

          problems.push(
            [
              'Unable to map workspace import to a graph project:',
              `  importing project: ${toRelativePath(config.rootDir, project.configPath)}`,
              `  file: ${toRelativePath(config.rootDir, importRecord.filePath)}:${importRecord.line}`,
              `  imported specifier: ${importRecord.specifier}`,
              `  resolved file: ${toRelativePath(config.rootDir, resolvedFilePath)}`,
              `  current references: ${formatReferences(config.rootDir, project.references)}`,
            ].join('\n'),
          );
          continue;
        }

        if (targetProjectPath === project.configPath) {
          continue;
        }

        const deniedRefRule = getDeniedRefRule(
          graphRules,
          project.label,
          targetProjectPath,
        );

        if (deniedRefRule) {
          addDeniedRefImportProblem({
            config,
            importRecord,
            problems,
            project,
            rule: deniedRefRule,
            targetProjectPath,
          });
          continue;
        }

        if (!projectsByPath.has(targetProjectPath)) {
          problems.push(
            [
              'Expected graph target is not reachable from any checker entry:',
              `  importing project: ${toRelativePath(config.rootDir, project.configPath)}`,
              `  file: ${toRelativePath(config.rootDir, importRecord.filePath)}:${importRecord.line}`,
              `  imported specifier: ${importRecord.specifier}`,
              `  expected graph project: ${toRelativePath(config.rootDir, targetProjectPath)}`,
            ].join('\n'),
          );
          continue;
        }

        if (!project.references.has(targetProjectPath)) {
          problems.push(
            [
              'Missing project reference for workspace import:',
              `  importing project: ${toRelativePath(config.rootDir, project.configPath)}`,
              `  file: ${toRelativePath(config.rootDir, importRecord.filePath)}:${importRecord.line}`,
              `  imported specifier: ${importRecord.specifier}`,
              `  expected reference: ${toRelativePath(config.rootDir, targetProjectPath)}`,
              `  current references: ${formatReferences(config.rootDir, project.references)}`,
            ].join('\n'),
          );
        }
      }
    }
  }

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

export async function runGraphCheck(
  config: ResolvedLatticeConfig,
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
    const passed = await runGraphCheckInternal(config, { logSuccess });

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
