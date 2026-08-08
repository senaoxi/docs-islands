import type { ResolvedLiminaConfig } from '#config/runner';
import type { GeneratedTsconfigGraphResult } from '#core/build-graph/runner';
import type { WorkspaceLookupIndex } from '../core/workspace/lookup';
import type { ProofFinding } from './findings';
import { collectGovernedSourceEntries } from './framework-governance-common';
import { addSupplementalCapabilityFindings } from './framework-governance-coverage';
import { addFrameworkProjectionFindings } from './framework-governance-projections';
import { addFrameworkSourceCoverageFindings } from './framework-governance-source-coverage';
import { addFrameworkTargetFindings } from './framework-governance-targets';

export function addFrameworkGovernanceFindings(options: {
  config: ResolvedLiminaConfig;
  findings: ProofFinding[];
  generatedGraph: GeneratedTsconfigGraphResult;
  workspaceLookup: WorkspaceLookupIndex;
}): number {
  const entries = collectGovernedSourceEntries(options.generatedGraph);
  addFrameworkSourceCoverageFindings({ ...options, entries });
  addSupplementalCapabilityFindings({ ...options, entries });
  addFrameworkTargetFindings(options);
  addFrameworkProjectionFindings({ ...options, entries });
  return entries.length;
}
