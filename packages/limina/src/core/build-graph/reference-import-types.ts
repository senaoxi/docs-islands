import type { ResolvedLiminaConfig } from '#config/runner';
import type {
  ImportAnalysisContext,
  ImportRecord,
} from '#core/import-analysis/runner';
import type { DeclarationProviderResolution } from '../import-graph/declaration-provider';
import type { ManagedOutputDeclarationLookup } from '../import-graph/managed-output-provider';
import type { WorkspaceRegionPathIndex } from '../workspace/validated-context';
import type { GeneratedDependencyEdge, SourceProject } from './types';

export type ResolvedProvider = Extract<
  DeclarationProviderResolution,
  { kind: 'declaration' | 'source' }
>;

export interface ReferenceImportContext {
  activatedRegions: WorkspaceRegionPathIndex;
  config: ResolvedLiminaConfig;
  dtsProjectsBySourcePath: Map<string, SourceProject[]>;
  fileOwnerLookup: Map<string, string[]>;
  importAnalysis: ImportAnalysisContext;
  managedOutputLookup: ManagedOutputDeclarationLookup;
  problems: string[];
  dependencyEdgesByKey: Map<string, GeneratedDependencyEdge>;
}

export interface ReferenceImportOptions {
  context: ReferenceImportContext;
  fileName: string;
  importRecord: ImportRecord;
  project: SourceProject;
}

export interface ReferenceTarget {
  providerSourceFilePath: string;
  resolvedFilePath: string;
  targetSourceConfigPath: string;
}
