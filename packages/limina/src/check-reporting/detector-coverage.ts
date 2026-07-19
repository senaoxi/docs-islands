import { LIMINA_CHECK_ISSUE_CODES, type LiminaCheckIssueCode } from './codes';
import type { LiminaCheckTaskName } from './snapshot';

export type DetectorCoverageEntry = { readonly task: LiminaCheckTaskName } & (
  | {
      readonly kind: 'external-tool' | 'fixture' | 'integration' | 'unit';
      readonly producers: readonly string[];
      readonly tests: readonly string[];
    }
  | {
      readonly kind: 'fault-injection';
      readonly producers: readonly string[];
      readonly tests: readonly string[];
    }
  | {
      readonly kind: 'planned';
      readonly producers: readonly string[];
      readonly reason: string;
    }
  | {
      readonly kind: 'retired';
      readonly reason: string;
    }
);

export type DetectorCoverageRegistry = Readonly<
  Record<LiminaCheckIssueCode, DetectorCoverageEntry>
>;

const DIRECT_CODE_TASK_ASSERTION_PLANNED =
  'The production producer is reachable, but no current producer-focused test directly triggers this detector and asserts both its canonical code and task.';

const FALLBACK_CONTRACT_TEST =
  'packages/limina/src/__tests__/issue-code-contracts.spec.ts';

export const LIMINA_CHECK_ISSUE_DETECTOR_COVERAGE: DetectorCoverageRegistry = {
  [LIMINA_CHECK_ISSUE_CODES.checkerBuildFailed]: {
    kind: 'fault-injection',
    producers: [
      'packages/limina/src/check-reporting/codes.ts#DEFAULT_ISSUE_CODE_BY_TASK',
      'packages/limina/src/commands/typecheck.ts#createCheckerFailureIssues',
    ],
    task: 'checker:build',
    tests: [FALLBACK_CONTRACT_TEST],
  },
  [LIMINA_CHECK_ISSUE_CODES.checkerPeerDependencyMissing]: {
    kind: 'unit',
    producers: [
      'packages/limina/src/commands/typecheck.ts#createCheckerFailureIssues',
    ],
    task: 'checker:build',
    tests: ['packages/limina/src/__tests__/cli.spec.ts'],
  },
  [LIMINA_CHECK_ISSUE_CODES.checkerTargetSelectionFailed]: {
    kind: 'planned',
    producers: [
      'packages/limina/src/commands/typecheck.ts#createCheckerFailureIssues',
    ],
    reason: DIRECT_CODE_TASK_ASSERTION_PLANNED,
    task: 'checker:build',
  },
  [LIMINA_CHECK_ISSUE_CODES.checkerTypecheckFailed]: {
    kind: 'fault-injection',
    producers: [
      'packages/limina/src/check-reporting/codes.ts#DEFAULT_ISSUE_CODE_BY_TASK',
      'packages/limina/src/commands/typecheck.ts#createCheckerFailureIssues',
    ],
    task: 'checker:typecheck',
    tests: [FALLBACK_CONTRACT_TEST],
  },
  [LIMINA_CHECK_ISSUE_CODES.commandFailed]: {
    kind: 'fault-injection',
    producers: [
      'packages/limina/src/check-reporting/codes.ts#DEFAULT_ISSUE_CODE_BY_TASK',
      'packages/limina/src/pipeline/runner.ts#runCommandStep',
    ],
    task: 'command',
    tests: [
      FALLBACK_CONTRACT_TEST,
      'packages/limina/src/__tests__/pipeline.spec.ts',
    ],
  },
  [LIMINA_CHECK_ISSUE_CODES.graphAccessDenied]: {
    kind: 'fixture',
    producers: [
      'packages/limina/src/graph-check/runner.ts#addDeniedReferenceProblems',
      'packages/limina/src/graph-check/runner.ts#addDeniedDepImportProblem',
      'packages/limina/src/graph-check/runner.ts#addDeniedRefImportProblem',
    ],
    task: 'graph:check',
    tests: [
      'packages/limina/fixtures/detectors/graph/access-denied-import-dependency/case.mts',
      'packages/limina/fixtures/detectors/graph/access-denied-reference/case.mts',
      'packages/limina/integration/tests/detector-fixtures.spec.ts',
      'packages/limina/src/__tests__/graph-findings.spec.ts',
      'packages/limina/src/__tests__/graph.spec.ts',
    ],
  },
  [LIMINA_CHECK_ISSUE_CODES.graphCheckFailed]: {
    kind: 'fault-injection',
    producers: [
      'packages/limina/src/check-reporting/codes.ts#DEFAULT_ISSUE_CODE_BY_TASK',
      'packages/limina/src/commands/graph.ts#createGraphCheckErrorIssue',
    ],
    task: 'graph:check',
    tests: [FALLBACK_CONTRACT_TEST],
  },
  [LIMINA_CHECK_ISSUE_CODES.graphConditionDomainMismatch]: {
    kind: 'fixture',
    producers: [
      'packages/limina/src/graph-check/conditions.ts#collectCustomConditionSubtreeSummary',
      'packages/limina/src/graph-check/conditions.ts#addConditionDomainProblems',
    ],
    task: 'graph:check',
    tests: [
      'packages/limina/fixtures/detectors/graph/condition-domain-mismatch/case.mts',
      'packages/limina/fixtures/detectors/graph/condition-domain-reference-mismatch/case.mts',
      'packages/limina/integration/tests/detector-fixtures.spec.ts',
      'packages/limina/src/__tests__/graph-findings.spec.ts',
      'packages/limina/src/__tests__/graph.spec.ts',
    ],
  },
  [LIMINA_CHECK_ISSUE_CODES.graphConfigInvalid]: {
    kind: 'fixture',
    producers: [
      'packages/limina/src/graph-check/dts-options.ts#addDtsOptionProblems',
      'packages/limina/src/graph-check/dts-options.ts#addTypecheckParityProblems',
      'packages/limina/src/graph-check/conditions.ts#addConditionDomainShapeProblem',
      'packages/limina/src/graph-check/conditions.ts#addConditionDomainEntryProblem',
      'packages/limina/src/graph-check/rules.ts#getRulesRecord',
      'packages/limina/src/graph-check/rules.ts#addRuleEntryConfigFinding',
      'packages/limina/src/graph-check/runner.ts#createGraphCheckManagedOutputProjectContexts',
      'packages/limina/src/graph-check/runner.ts#runGraphCheckImpl',
    ],
    task: 'graph:check',
    tests: [
      'packages/limina/fixtures/detectors/graph/config-invalid-condition-domain/case.mts',
      'packages/limina/fixtures/detectors/graph/config-invalid-condition-domain-entry/case.mts',
      'packages/limina/fixtures/detectors/graph/config-invalid-rule/case.mts',
      'packages/limina/fixtures/detectors/graph/config-invalid-workspace-export/case.mts',
      'packages/limina/integration/tests/detector-fixtures.spec.ts',
      'packages/limina/src/__tests__/graph-findings.spec.ts',
      'packages/limina/src/__tests__/graph.spec.ts',
    ],
  },
  [LIMINA_CHECK_ISSUE_CODES.graphImportTargetUnmapped]: {
    kind: 'fixture',
    producers: [
      'packages/limina/src/graph-check/runner.ts#addUnmappedWorkspaceImportProblem',
    ],
    task: 'graph:check',
    tests: [
      'packages/limina/fixtures/detectors/graph/import-target-unmapped/case.mts',
      'packages/limina/integration/tests/detector-fixtures.spec.ts',
      'packages/limina/src/__tests__/graph-findings.spec.ts',
    ],
  },
  [LIMINA_CHECK_ISSUE_CODES.graphMaterializeFailed]: {
    kind: 'fault-injection',
    producers: [
      'packages/limina/src/check-reporting/codes.ts#DEFAULT_ISSUE_CODE_BY_TASK',
      'packages/limina/src/execution/executor.ts#createInfrastructureIssue',
    ],
    task: 'graph:materialize',
    tests: [
      FALLBACK_CONTRACT_TEST,
      'packages/limina/src/__tests__/execution.spec.ts',
    ],
  },
  [LIMINA_CHECK_ISSUE_CODES.graphPrepareFailed]: {
    kind: 'fault-injection',
    producers: [
      'packages/limina/src/check-reporting/codes.ts#DEFAULT_ISSUE_CODE_BY_TASK',
      'packages/limina/src/core/build-graph/runner.ts#createGraphPrepareIssue',
    ],
    task: 'graph:prepare',
    tests: [
      FALLBACK_CONTRACT_TEST,
      'packages/limina/src/__tests__/source.spec.ts',
    ],
  },
  [LIMINA_CHECK_ISSUE_CODES.graphReferenceCycle]: {
    kind: 'fixture',
    producers: [
      'packages/limina/src/graph-check/runner.ts#addGeneratedReferenceCycleProblems',
    ],
    task: 'graph:check',
    tests: [
      'packages/limina/fixtures/detectors/graph/reference-cycle-mutual/case.mts',
      'packages/limina/integration/tests/detector-fixtures.spec.ts',
      'packages/limina/src/__tests__/graph-findings.spec.ts',
      'packages/limina/src/__tests__/graph.spec.ts',
    ],
  },
  [LIMINA_CHECK_ISSUE_CODES.graphReferenceExtra]: {
    kind: 'unit',
    producers: [
      'packages/limina/src/graph-check/runner.ts#addReferenceCompletenessProblems',
    ],
    task: 'graph:check',
    tests: ['packages/limina/src/__tests__/graph-findings.spec.ts'],
  },
  [LIMINA_CHECK_ISSUE_CODES.graphReferenceMissing]: {
    kind: 'unit',
    producers: [
      'packages/limina/src/graph-check/runner.ts#addReferenceCompletenessProblems',
    ],
    task: 'graph:check',
    tests: [
      'packages/limina/src/__tests__/graph-findings.spec.ts',
      'packages/limina/src/__tests__/graph.spec.ts',
    ],
  },
  [LIMINA_CHECK_ISSUE_CODES.graphTargetUnreachable]: {
    kind: 'unit',
    producers: [
      'packages/limina/src/graph-check/runner.ts#addExpectedReferenceForTarget',
    ],
    task: 'graph:check',
    tests: ['packages/limina/src/__tests__/graph-findings.spec.ts'],
  },
  [LIMINA_CHECK_ISSUE_CODES.graphWorkspaceDependencyUndeclared]: {
    kind: 'unit',
    producers: [
      'packages/limina/src/graph-check/runner.ts#addWorkspaceReferenceDependencyProblems',
    ],
    task: 'graph:check',
    tests: ['packages/limina/src/__tests__/graph-findings.spec.ts'],
  },
  [LIMINA_CHECK_ISSUE_CODES.graphWorkspaceImportOutsideGraph]: {
    kind: 'fixture',
    producers: [
      'packages/limina/src/graph-check/runner.ts#addBuildArtifactImportProblem',
      'packages/limina/src/graph-check/runner.ts#addOutsideWorkspaceGraphProblem',
    ],
    task: 'graph:check',
    tests: [
      'packages/limina/fixtures/detectors/graph/workspace-import-outside-graph/case.mts',
      'packages/limina/integration/tests/detector-fixtures.spec.ts',
      'packages/limina/src/__tests__/graph-findings.spec.ts',
    ],
  },
  [LIMINA_CHECK_ISSUE_CODES.graphWorkspaceImportUnresolved]: {
    kind: 'fixture',
    producers: [
      'packages/limina/src/graph-check/runner.ts#addWorkspacePackageExportWithoutTypeEntryProblem',
      'packages/limina/src/graph-check/runner.ts#addUnresolvedWorkspaceImportProblem',
      'packages/limina/src/graph-check/runner.ts#addOxcOnlyDeclarationProviderProblem',
    ],
    task: 'graph:check',
    tests: [
      'packages/limina/fixtures/detectors/graph/workspace-import-missing-type-entry/case.mts',
      'packages/limina/fixtures/detectors/graph/workspace-import-unresolved/case.mts',
      'packages/limina/integration/tests/detector-fixtures.spec.ts',
      'packages/limina/src/__tests__/graph-findings.spec.ts',
    ],
  },
  [LIMINA_CHECK_ISSUE_CODES.graphWorkspacePackageNameMissing]: {
    kind: 'unit',
    producers: [
      'packages/limina/src/graph-check/runner.ts#addNamelessWorkspaceReferenceProblem',
    ],
    task: 'graph:check',
    tests: ['packages/limina/src/__tests__/graph-findings.spec.ts'],
  },
  [LIMINA_CHECK_ISSUE_CODES.packageAttw]: {
    kind: 'planned',
    producers: ['packages/limina/src/package-check/runner.ts#runAttwCheck'],
    reason: DIRECT_CODE_TASK_ASSERTION_PLANNED,
    task: 'package:check',
  },
  [LIMINA_CHECK_ISSUE_CODES.packageBoundary]: {
    kind: 'planned',
    producers: ['packages/limina/src/package-check/runner.ts#runBoundaryCheck'],
    reason: DIRECT_CODE_TASK_ASSERTION_PLANNED,
    task: 'package:check',
  },
  [LIMINA_CHECK_ISSUE_CODES.packageCheckFailed]: {
    kind: 'fault-injection',
    producers: [
      'packages/limina/src/check-reporting/codes.ts#DEFAULT_ISSUE_CODE_BY_TASK',
      'packages/limina/src/commands/package.ts#createPackageCheckErrorIssues',
    ],
    task: 'package:check',
    tests: [FALLBACK_CONTRACT_TEST],
  },
  [LIMINA_CHECK_ISSUE_CODES.packageManifestInvalid]: {
    kind: 'planned',
    producers: [
      'packages/limina/src/package-check/runner.ts#runPackageCheckEntry',
    ],
    reason: DIRECT_CODE_TASK_ASSERTION_PLANNED,
    task: 'package:check',
  },
  [LIMINA_CHECK_ISSUE_CODES.packagePublint]: {
    kind: 'external-tool',
    producers: ['packages/limina/src/package-check/runner.ts#runPublintCheck'],
    task: 'package:check',
    tests: ['packages/limina/src/__tests__/package.spec.ts'],
  },
  [LIMINA_CHECK_ISSUE_CODES.pipelineCommandFailed]: {
    kind: 'retired',
    reason:
      'Released legacy alias with no independent producer; historical readers accept it, while new issue creators and snapshot writers reject it.',
    task: 'command',
  },
  [LIMINA_CHECK_ISSUE_CODES.proofAllowlistInvalid]: {
    kind: 'unit',
    producers: [
      'packages/limina/src/proof/allowlist.ts#collectConfiguredAllowlistEntries',
      'packages/limina/src/proof/allowlist.ts#addAllowlistFindings',
    ],
    task: 'proof:check',
    tests: [
      'packages/limina/src/__tests__/proof-findings.spec.ts',
      'packages/limina/src/__tests__/proof.spec.ts',
    ],
  },
  [LIMINA_CHECK_ISSUE_CODES.proofCheckerCoverageInvalid]: {
    kind: 'unit',
    producers: [
      'packages/limina/src/proof/runner.ts#createProofCheckerRouteFinding',
      'packages/limina/src/proof/runner.ts#collectCheckerCoverageTargets',
      'packages/limina/src/proof/runner.ts#addDtsConfigFindings',
      'packages/limina/src/proof/runner.ts#addBuildGraphConfigFindings',
      'packages/limina/src/proof/runner.ts#addSourceReferenceRoleFindings',
    ],
    task: 'proof:check',
    tests: [
      'packages/limina/src/__tests__/proof-findings.spec.ts',
      'packages/limina/src/__tests__/proof.spec.ts',
    ],
  },
  [LIMINA_CHECK_ISSUE_CODES.proofCheckFailed]: {
    kind: 'fault-injection',
    producers: [
      'packages/limina/src/check-reporting/codes.ts#DEFAULT_ISSUE_CODE_BY_TASK',
      'packages/limina/src/commands/proof.ts#runProofCheck',
    ],
    task: 'proof:check',
    tests: [FALLBACK_CONTRACT_TEST],
  },
  [LIMINA_CHECK_ISSUE_CODES.proofDefaultTsconfigInvalid]: {
    kind: 'unit',
    producers: [
      'packages/limina/src/proof/runner.ts#addDefaultTsconfigShapeFindings',
      'packages/limina/src/proof/runner.ts#addDefaultTsconfigEnvironmentFindings',
    ],
    task: 'proof:check',
    tests: [
      'packages/limina/src/__tests__/proof-findings.spec.ts',
      'packages/limina/src/__tests__/proof.spec.ts',
    ],
  },
  [LIMINA_CHECK_ISSUE_CODES.proofDuplicateGraphCoverage]: {
    kind: 'unit',
    producers: [
      'packages/limina/src/proof/runner.ts#addDuplicateGraphCoverageFindings',
    ],
    task: 'proof:check',
    tests: [
      'packages/limina/src/__tests__/proof-findings.spec.ts',
      'packages/limina/src/__tests__/proof.spec.ts',
    ],
  },
  [LIMINA_CHECK_ISSUE_CODES.proofDuplicateSourceOwner]: {
    kind: 'unit',
    producers: [
      'packages/limina/src/proof/runner.ts#addDuplicateTypecheckOwnershipFindings',
    ],
    task: 'proof:check',
    tests: [
      'packages/limina/src/__tests__/proof-findings.spec.ts',
      'packages/limina/src/__tests__/proof.spec.ts',
    ],
  },
  [LIMINA_CHECK_ISSUE_CODES.proofSourceBoundaryMismatch]: {
    kind: 'unit',
    producers: [
      'packages/limina/src/proof/runner.ts#addSourceBoundaryMismatchFindings',
    ],
    task: 'proof:check',
    tests: [
      'packages/limina/src/__tests__/proof-findings.spec.ts',
      'packages/limina/src/__tests__/proof.spec.ts',
    ],
  },
  [LIMINA_CHECK_ISSUE_CODES.proofUncoveredSourceFile]: {
    kind: 'unit',
    producers: [
      'packages/limina/src/proof/runner.ts#addUncoveredSourceFindings',
    ],
    task: 'proof:check',
    tests: [
      'packages/limina/src/__tests__/proof-findings.spec.ts',
      'packages/limina/src/__tests__/proof.spec.ts',
    ],
  },
  [LIMINA_CHECK_ISSUE_CODES.releaseCheckFailed]: {
    kind: 'fault-injection',
    producers: [
      'packages/limina/src/check-reporting/codes.ts#DEFAULT_ISSUE_CODE_BY_TASK',
      'packages/limina/src/commands/release.ts#createReleaseCheckErrorIssues',
    ],
    task: 'release:check',
    tests: [FALLBACK_CONTRACT_TEST],
  },
  [LIMINA_CHECK_ISSUE_CODES.releaseConsistency]: {
    kind: 'planned',
    producers: [
      'packages/limina/src/check-reporting/codes.ts#releaseConsistency',
    ],
    reason:
      'Registered planned compatibility code; current typed Release producers intentionally do not emit it.',
    task: 'release:check',
  },
  [LIMINA_CHECK_ISSUE_CODES.releaseContentHash]: {
    kind: 'unit',
    producers: [
      'packages/limina/src/package-check/release-consistency.ts#addContentHashFinding',
      'packages/limina/src/package-check/release-consistency.ts#verifyWorkspacePackagePublished',
    ],
    task: 'release:check',
    tests: [
      'packages/limina/src/__tests__/release-findings.spec.ts',
      'packages/limina/src/__tests__/package.spec.ts',
    ],
  },
  [LIMINA_CHECK_ISSUE_CODES.releasePackedManifest]: {
    kind: 'unit',
    producers: [
      'packages/limina/src/commands/release.ts#collectOutputManifestFindings',
      'packages/limina/src/package-check/release-consistency.ts#addPackedManifestFinding',
      'packages/limina/src/package-check/release-consistency.ts#visitWorkspacePackageDependencies',
      'packages/limina/src/package-check/release-consistency.ts#validatePackedManifestLint',
      'packages/limina/src/package-check/release-consistency.ts#validatePackedManifest',
    ],
    task: 'release:check',
    tests: [
      'packages/limina/src/__tests__/release-findings.spec.ts',
      'packages/limina/src/__tests__/package.spec.ts',
    ],
  },
  [LIMINA_CHECK_ISSUE_CODES.releaseRegistry]: {
    kind: 'unit',
    producers: [
      'packages/limina/src/package-check/release-consistency.ts#addRegistryFinding',
      'packages/limina/src/package-check/release-consistency.ts#fetchRegistryPackageMetadata',
      'packages/limina/src/package-check/release-consistency.ts#fetchRegistryTarball',
      'packages/limina/src/package-check/release-consistency.ts#verifyWorkspacePackagePublished',
    ],
    task: 'release:check',
    tests: [
      'packages/limina/src/__tests__/release-findings.spec.ts',
      'packages/limina/src/__tests__/package.spec.ts',
    ],
  },
  [LIMINA_CHECK_ISSUE_CODES.releaseTarballHygiene]: {
    kind: 'unit',
    producers: [
      'packages/limina/src/commands/release.ts#runReleaseCheckEntry',
      'packages/limina/src/package-check/release-consistency.ts#addTarballHygieneFinding',
      'packages/limina/src/package-check/release-consistency.ts#readPackedPackageJson',
      'packages/limina/src/package-check/release-consistency.ts#validateReleaseTarballHygiene',
    ],
    task: 'release:check',
    tests: [
      'packages/limina/src/__tests__/release-findings.spec.ts',
      'packages/limina/src/__tests__/package.spec.ts',
    ],
  },
  [LIMINA_CHECK_ISSUE_CODES.sourceCheckFailed]: {
    kind: 'fault-injection',
    producers: [
      'packages/limina/src/check-reporting/codes.ts#DEFAULT_ISSUE_CODE_BY_TASK',
      'packages/limina/src/commands/source.ts#runSourceCheck',
    ],
    task: 'source:check',
    tests: [FALLBACK_CONTRACT_TEST],
  },
  [LIMINA_CHECK_ISSUE_CODES.sourceAmbientDeclarationConfigInvalid]: {
    kind: 'unit',
    producers: [
      'packages/limina/src/source-check/ambient-declarations.ts#createConfigIssue',
    ],
    task: 'source:check',
    tests: ['packages/limina/src/__tests__/ambient-declarations.spec.ts'],
  },
  [LIMINA_CHECK_ISSUE_CODES.sourceAmbientDeclarationSharedUnauthorized]: {
    kind: 'unit',
    producers: [
      'packages/limina/src/source-check/runner.ts#addTsconfigGovernanceProblems',
    ],
    task: 'source:check',
    tests: [
      'packages/limina/src/__tests__/source-findings.spec.ts',
      'packages/limina/src/__tests__/source.spec.ts',
    ],
  },
  [LIMINA_CHECK_ISSUE_CODES.sourceAmbientDeclarationReferenceUnauthorized]: {
    kind: 'unit',
    producers: [
      'packages/limina/src/source-check/runner.ts#addRelativeImportProblems',
    ],
    task: 'source:check',
    tests: [
      'packages/limina/src/__tests__/source-findings.spec.ts',
      'packages/limina/src/__tests__/source.spec.ts',
    ],
  },
  [LIMINA_CHECK_ISSUE_CODES.sourceCrossGovernanceBoundary]: {
    kind: 'unit',
    producers: [
      'packages/limina/src/source-check/runner.ts#addSourceCrossGovernanceBoundaryProblem',
    ],
    task: 'source:check',
    tests: ['packages/limina/src/__tests__/source-findings.spec.ts'],
  },
  [LIMINA_CHECK_ISSUE_CODES.sourceImportAuthorityInvalid]: {
    kind: 'unit',
    producers: [
      'packages/limina/src/source-check/runner.ts#addImportAuthorityConfigFinding',
    ],
    task: 'source:check',
    tests: ['packages/limina/src/__tests__/source-findings.spec.ts'],
  },
  [LIMINA_CHECK_ISSUE_CODES.sourceKnipBuildScriptUnsupported]: {
    kind: 'unit',
    producers: [
      'packages/limina/src/source-check/runner.ts#addKnipBackedSourceProblems',
    ],
    task: 'source:check',
    tests: [
      'packages/limina/src/__tests__/source-findings.spec.ts',
      'packages/limina/src/__tests__/source.spec.ts',
    ],
  },
  [LIMINA_CHECK_ISSUE_CODES.sourceKnipConfigInvalid]: {
    kind: 'unit',
    producers: [
      'packages/limina/src/source-check/findings.ts#createSourceKnipConfigFinding',
    ],
    task: 'source:check',
    tests: [
      'packages/limina/src/__tests__/source-findings.spec.ts',
      'packages/limina/src/__tests__/source.spec.ts',
    ],
  },
  [LIMINA_CHECK_ISSUE_CODES.sourceOwnerInvalid]: {
    kind: 'unit',
    producers: [
      'packages/limina/src/source-check/runner.ts#addProjectOwnerProblems',
      'packages/limina/src/source-check/runner.ts#addSourceImportOutsideActivatedRegionProblem',
      'packages/limina/src/source-check/runner.ts#addTsconfigGovernanceProblems',
    ],
    task: 'source:check',
    tests: [
      'packages/limina/src/__tests__/source-findings.spec.ts',
      'packages/limina/src/__tests__/source.spec.ts',
    ],
  },
  [LIMINA_CHECK_ISSUE_CODES.sourcePackageImportInvalid]: {
    kind: 'unit',
    producers: [
      'packages/limina/src/source-check/runner.ts#addPackageImportProblem',
    ],
    task: 'source:check',
    tests: [
      'packages/limina/src/__tests__/source-findings.spec.ts',
      'packages/limina/src/__tests__/source.spec.ts',
    ],
  },
  [LIMINA_CHECK_ISSUE_CODES.sourcePackageImportUnauthorized]: {
    kind: 'unit',
    producers: [
      'packages/limina/src/source-check/runner.ts#addPackageImportAuthorizationProblem',
    ],
    task: 'source:check',
    tests: [
      'packages/limina/src/__tests__/source-findings.spec.ts',
      'packages/limina/src/__tests__/source.spec.ts',
    ],
  },
  [LIMINA_CHECK_ISSUE_CODES.sourceRelativeImportEscapesScope]: {
    kind: 'unit',
    producers: [
      'packages/limina/src/source-check/runner.ts#addRelativeImportOwnerProblem',
    ],
    task: 'source:check',
    tests: [
      'packages/limina/src/__tests__/source-findings.spec.ts',
      'packages/limina/src/__tests__/source.spec.ts',
    ],
  },
  [LIMINA_CHECK_ISSUE_CODES.sourceTsconfigGovernance]: {
    kind: 'unit',
    producers: [
      'packages/limina/src/source-check/runner.ts#addTsconfigGovernanceProblems',
      'packages/limina/src/source-check/runner.ts#runSourceCheckImpl',
    ],
    task: 'source:check',
    tests: [
      'packages/limina/src/__tests__/source-findings.spec.ts',
      'packages/limina/src/__tests__/source.spec.ts',
    ],
  },
  [LIMINA_CHECK_ISSUE_CODES.sourceUnusedModule]: {
    kind: 'unit',
    producers: [
      'packages/limina/src/source-check/runner.ts#addUnusedModuleProblems',
    ],
    task: 'source:check',
    tests: [
      'packages/limina/src/__tests__/source-findings.spec.ts',
      'packages/limina/src/__tests__/source.spec.ts',
    ],
  },
  [LIMINA_CHECK_ISSUE_CODES.sourceUnusedWorkspaceDependency]: {
    kind: 'unit',
    producers: [
      'packages/limina/src/source-check/runner.ts#addUnusedDependencyProblems',
    ],
    task: 'source:check',
    tests: ['packages/limina/src/__tests__/source-findings.spec.ts'],
  },
  [LIMINA_CHECK_ISSUE_CODES.workspaceRegionOverlap]: {
    kind: 'fixture',
    producers: [
      'packages/limina/src/core/workspace/validated-context.ts#createWorkspaceIssue',
    ],
    task: 'workspace:validate',
    tests: [
      'packages/limina/fixtures/detectors/workspace/region-overlap/case.mts',
      'packages/limina/integration/tests/detector-fixtures.spec.ts',
      'packages/limina/src/__tests__/source.spec.ts',
      'packages/limina/src/__tests__/workspace.spec.ts',
    ],
  },
  [LIMINA_CHECK_ISSUE_CODES.workspaceValidationFailed]: {
    kind: 'fault-injection',
    producers: [
      'packages/limina/src/check-reporting/codes.ts#DEFAULT_ISSUE_CODE_BY_TASK',
      'packages/limina/src/pipeline/runner.ts#createWorkspaceValidationTask',
    ],
    task: 'workspace:validate',
    tests: [FALLBACK_CONTRACT_TEST],
  },
  [LIMINA_CHECK_ISSUE_CODES.workspaceOutputCycle]: {
    kind: 'fixture',
    producers: [
      'packages/limina/src/core/workspace/validated-context.ts#createWorkspaceIssue',
    ],
    task: 'workspace:validate',
    tests: [
      'packages/limina/fixtures/detectors/workspace/output-cycle-mutual/case.mts',
      'packages/limina/fixtures/detectors/workspace/output-cycle-self/case.mts',
      'packages/limina/integration/tests/detector-fixtures.spec.ts',
      'packages/limina/src/__tests__/workspace-validation.spec.ts',
    ],
  },
  [LIMINA_CHECK_ISSUE_CODES.workspaceOutputRootInvalid]: {
    kind: 'fixture',
    producers: [
      'packages/limina/src/core/workspace/validated-context.ts#createWorkspaceIssue',
    ],
    task: 'workspace:validate',
    tests: [
      'packages/limina/fixtures/detectors/workspace/output-root-canonical-alias/case.mts',
      'packages/limina/fixtures/detectors/workspace/output-root-repository/case.mts',
      'packages/limina/integration/tests/detector-fixtures.spec.ts',
      'packages/limina/src/__tests__/workspace-validation.spec.ts',
    ],
  },
  [LIMINA_CHECK_ISSUE_CODES.workspacePackageIdentityConflict]: {
    kind: 'fixture',
    producers: [
      'packages/limina/src/core/workspace/validated-context.ts#createWorkspaceIssue',
    ],
    task: 'workspace:validate',
    tests: [
      'packages/limina/fixtures/detectors/workspace/package-identity-conflict/case.mts',
      'packages/limina/integration/tests/detector-fixtures.spec.ts',
      'packages/limina/src/__tests__/workspace-validation.spec.ts',
    ],
  },
} satisfies DetectorCoverageRegistry;
