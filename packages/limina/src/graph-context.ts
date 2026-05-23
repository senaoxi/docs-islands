import { readFileSync } from 'node:fs';
import path from 'node:path';
import ts from 'typescript';
import type { ResolvedLiminaConfig } from './config';
import {
  getDtsCompanionConfigPath,
  getRawReferencePaths,
  isDtsConfigPath,
  readJsonConfig,
} from './tsconfig';
import {
  isPathInsideDirectory,
  normalizeAbsolutePath,
  toRelativePath,
} from './utils/path';
import {
  findPackageForSpecifier,
  type ImporterInfo,
  type WorkspacePackage,
} from './workspace';

export interface ProjectInfo {
  configPath: string;
  fileNames: string[];
  label: string | null;
  labelProblem: string | null;
  options: ts.CompilerOptions;
  references: Set<string>;
}

export interface ImportRecord {
  filePath: string;
  line: number;
  specifier: string;
}

export function isRelativeSpecifier(specifier: string): boolean {
  return (
    specifier === '.' ||
    specifier === '..' ||
    specifier.startsWith('./') ||
    specifier.startsWith('../')
  );
}

export function isDtsProjectConfig(configPath: string): boolean {
  return isDtsConfigPath(configPath);
}

export function getTypecheckConfigPath(dtsConfigPath: string): string {
  return getDtsCompanionConfigPath(dtsConfigPath);
}

function formatUnknownValue(value: unknown): string {
  if (value === undefined) {
    return 'undefined';
  }

  return JSON.stringify(value);
}

function readProjectLabel(
  config: ResolvedLiminaConfig,
  configPath: string,
): Pick<ProjectInfo, 'label' | 'labelProblem'> {
  if (!isDtsProjectConfig(configPath)) {
    return {
      label: null,
      labelProblem: null,
    };
  }

  const configObject = readJsonConfig(config, configPath);

  if (!Object.hasOwn(configObject, 'limina')) {
    return {
      label: null,
      labelProblem: null,
    };
  }

  const value = configObject.limina;

  if (typeof value === 'string' && value.trim()) {
    return {
      label: value.trim(),
      labelProblem: null,
    };
  }

  return {
    label: null,
    labelProblem: [
      'Invalid Limina graph label:',
      `  project: ${toRelativePath(config.rootDir, configPath)}`,
      `  field: limina`,
      `  value: ${formatUnknownValue(value)}`,
      '  reason: tsconfig*.dts.json may declare one non-empty string label with "limina".',
    ].join('\n'),
  };
}

export function parseProject(
  config: ResolvedLiminaConfig,
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

export function collectImportsFromFile(filePath: string): ImportRecord[] {
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

export function resolveInternalImport(
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

function chooseOwningProject(projectPaths: string[]): string {
  return [...projectPaths].sort((left, right) => {
    const directoryDepthDelta =
      path.dirname(right).length - path.dirname(left).length;

    return directoryDepthDelta === 0
      ? left.localeCompare(right)
      : directoryDepthDelta;
  })[0]!;
}

export function findPackageForFile(
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

export function isWorkspacePackageFile(
  filePath: string,
  packages: WorkspacePackage[],
): boolean {
  return packages.some((workspacePackage) =>
    isPathInsideDirectory(filePath, workspacePackage.directory),
  );
}

export function findImporterForFile(
  filePath: string,
  importers: ImporterInfo[],
): ImporterInfo | null {
  return (
    importers.find((importer) =>
      isPathInsideDirectory(filePath, importer.directory),
    ) ?? null
  );
}

export function shouldResolveThroughGraph(
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

export function formatArtifactDependencyPolicy(
  targetPackage: WorkspacePackage,
): string {
  return targetPackage.manifest.private === true
    ? 'private workspace packages cannot be consumed from a registry, so artifact consumers should use link: and should not keep a project reference.'
    : 'artifact consumers should use link: for local dist output, or catalog:/semver to consume the published production package, and should not keep a project reference.';
}

export function inferPackageProject(
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

export function createFileOwnerLookup(
  projects: ProjectInfo[],
): Map<string, string[]> {
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

export function findTargetProject(options: {
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
