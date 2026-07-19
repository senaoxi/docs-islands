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
    kind: 'unit',
    producers: [
      'packages/limina/src/graph-check/runner.ts#createGraphCheckIssue',
    ],
    task: 'graph:check',
    tests: ['packages/limina/src/__tests__/graph.spec.ts'],
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
    kind: 'planned',
    producers: [
      'packages/limina/src/graph-check/runner.ts#createGraphCheckIssue',
    ],
    reason: DIRECT_CODE_TASK_ASSERTION_PLANNED,
    task: 'graph:check',
  },
  [LIMINA_CHECK_ISSUE_CODES.graphConfigInvalid]: {
    kind: 'unit',
    producers: [
      'packages/limina/src/graph-check/runner.ts#createGraphCheckIssue',
    ],
    task: 'graph:check',
    tests: ['packages/limina/src/__tests__/graph.spec.ts'],
  },
  [LIMINA_CHECK_ISSUE_CODES.graphImportTargetUnmapped]: {
    kind: 'planned',
    producers: [
      'packages/limina/src/graph-check/runner.ts#createGraphCheckIssue',
    ],
    reason: DIRECT_CODE_TASK_ASSERTION_PLANNED,
    task: 'graph:check',
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
    kind: 'unit',
    producers: [
      'packages/limina/src/graph-check/runner.ts#createGraphCheckIssue',
    ],
    task: 'graph:check',
    tests: ['packages/limina/src/__tests__/graph.spec.ts'],
  },
  [LIMINA_CHECK_ISSUE_CODES.graphReferenceExtra]: {
    kind: 'planned',
    producers: [
      'packages/limina/src/graph-check/runner.ts#createGraphCheckIssue',
    ],
    reason: DIRECT_CODE_TASK_ASSERTION_PLANNED,
    task: 'graph:check',
  },
  [LIMINA_CHECK_ISSUE_CODES.graphReferenceMissing]: {
    kind: 'unit',
    producers: [
      'packages/limina/src/graph-check/runner.ts#createGraphCheckIssue',
    ],
    task: 'graph:check',
    tests: ['packages/limina/src/__tests__/graph.spec.ts'],
  },
  [LIMINA_CHECK_ISSUE_CODES.graphTargetUnreachable]: {
    kind: 'planned',
    producers: [
      'packages/limina/src/graph-check/runner.ts#createGraphCheckIssue',
    ],
    reason: DIRECT_CODE_TASK_ASSERTION_PLANNED,
    task: 'graph:check',
  },
  [LIMINA_CHECK_ISSUE_CODES.graphWorkspaceDependencyUndeclared]: {
    kind: 'planned',
    producers: [
      'packages/limina/src/graph-check/runner.ts#createGraphCheckIssue',
    ],
    reason: DIRECT_CODE_TASK_ASSERTION_PLANNED,
    task: 'graph:check',
  },
  [LIMINA_CHECK_ISSUE_CODES.graphWorkspaceImportOutsideGraph]: {
    kind: 'planned',
    producers: [
      'packages/limina/src/graph-check/runner.ts#createGraphCheckIssue',
    ],
    reason: DIRECT_CODE_TASK_ASSERTION_PLANNED,
    task: 'graph:check',
  },
  [LIMINA_CHECK_ISSUE_CODES.graphWorkspaceImportUnresolved]: {
    kind: 'planned',
    producers: [
      'packages/limina/src/graph-check/runner.ts#createGraphCheckIssue',
    ],
    reason: DIRECT_CODE_TASK_ASSERTION_PLANNED,
    task: 'graph:check',
  },
  [LIMINA_CHECK_ISSUE_CODES.graphWorkspacePackageNameMissing]: {
    kind: 'planned',
    producers: [
      'packages/limina/src/graph-check/runner.ts#createGraphCheckIssue',
    ],
    reason: DIRECT_CODE_TASK_ASSERTION_PLANNED,
    task: 'graph:check',
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
    kind: 'planned',
    producers: ['packages/limina/src/proof/runner.ts#createProofCheckIssue'],
    reason: DIRECT_CODE_TASK_ASSERTION_PLANNED,
    task: 'proof:check',
  },
  [LIMINA_CHECK_ISSUE_CODES.proofCheckerCoverageInvalid]: {
    kind: 'planned',
    producers: ['packages/limina/src/proof/runner.ts#createProofCheckIssue'],
    reason: DIRECT_CODE_TASK_ASSERTION_PLANNED,
    task: 'proof:check',
  },
  [LIMINA_CHECK_ISSUE_CODES.proofCheckFailed]: {
    kind: 'fault-injection',
    producers: [
      'packages/limina/src/check-reporting/codes.ts#DEFAULT_ISSUE_CODE_BY_TASK',
      'packages/limina/src/proof/runner.ts#createProofCheckIssue',
    ],
    task: 'proof:check',
    tests: [FALLBACK_CONTRACT_TEST],
  },
  [LIMINA_CHECK_ISSUE_CODES.proofDefaultTsconfigInvalid]: {
    kind: 'unit',
    producers: ['packages/limina/src/proof/runner.ts#createProofCheckIssue'],
    task: 'proof:check',
    tests: ['packages/limina/src/__tests__/cli.spec.ts'],
  },
  [LIMINA_CHECK_ISSUE_CODES.proofDuplicateGraphCoverage]: {
    kind: 'unit',
    producers: ['packages/limina/src/proof/runner.ts#createProofCheckIssue'],
    task: 'proof:check',
    tests: ['packages/limina/src/__tests__/proof.spec.ts'],
  },
  [LIMINA_CHECK_ISSUE_CODES.proofDuplicateSourceOwner]: {
    kind: 'unit',
    producers: ['packages/limina/src/proof/runner.ts#createProofCheckIssue'],
    task: 'proof:check',
    tests: ['packages/limina/src/__tests__/proof.spec.ts'],
  },
  [LIMINA_CHECK_ISSUE_CODES.proofSourceBoundaryMismatch]: {
    kind: 'planned',
    producers: ['packages/limina/src/proof/runner.ts#createProofCheckIssue'],
    reason: DIRECT_CODE_TASK_ASSERTION_PLANNED,
    task: 'proof:check',
  },
  [LIMINA_CHECK_ISSUE_CODES.proofUncoveredSourceFile]: {
    kind: 'unit',
    producers: [
      'packages/limina/src/proof/runner.ts#addUncoveredSourceProblems',
    ],
    task: 'proof:check',
    tests: ['packages/limina/src/__tests__/proof.spec.ts'],
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
      'packages/limina/src/commands/release.ts#createReleaseConsistencyIssues',
    ],
    reason: DIRECT_CODE_TASK_ASSERTION_PLANNED,
    task: 'release:check',
  },
  [LIMINA_CHECK_ISSUE_CODES.releaseContentHash]: {
    kind: 'planned',
    producers: [
      'packages/limina/src/commands/release.ts#createReleaseConsistencyIssues',
    ],
    reason: DIRECT_CODE_TASK_ASSERTION_PLANNED,
    task: 'release:check',
  },
  [LIMINA_CHECK_ISSUE_CODES.releasePackedManifest]: {
    kind: 'planned',
    producers: [
      'packages/limina/src/commands/release.ts#createReleaseConsistencyIssues',
    ],
    reason: DIRECT_CODE_TASK_ASSERTION_PLANNED,
    task: 'release:check',
  },
  [LIMINA_CHECK_ISSUE_CODES.releaseRegistry]: {
    kind: 'planned',
    producers: [
      'packages/limina/src/commands/release.ts#createReleaseConsistencyIssues',
    ],
    reason: DIRECT_CODE_TASK_ASSERTION_PLANNED,
    task: 'release:check',
  },
  [LIMINA_CHECK_ISSUE_CODES.releaseTarballHygiene]: {
    kind: 'planned',
    producers: [
      'packages/limina/src/commands/release.ts#createReleaseConsistencyIssues',
    ],
    reason: DIRECT_CODE_TASK_ASSERTION_PLANNED,
    task: 'release:check',
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
      'packages/limina/src/source-check/runner.ts#createStructuredSourceIssueFromProblem',
    ],
    task: 'source:check',
    tests: ['packages/limina/src/__tests__/source.spec.ts'],
  },
  [LIMINA_CHECK_ISSUE_CODES.sourceAmbientDeclarationReferenceUnauthorized]: {
    kind: 'unit',
    producers: [
      'packages/limina/src/source-check/runner.ts#createStructuredSourceIssueFromProblem',
    ],
    task: 'source:check',
    tests: ['packages/limina/src/__tests__/source.spec.ts'],
  },
  [LIMINA_CHECK_ISSUE_CODES.sourceCrossGovernanceBoundary]: {
    kind: 'planned',
    producers: [
      'packages/limina/src/source-check/runner.ts#createStructuredSourceIssueFromProblem',
    ],
    reason: DIRECT_CODE_TASK_ASSERTION_PLANNED,
    task: 'source:check',
  },
  [LIMINA_CHECK_ISSUE_CODES.sourceImportAuthorityInvalid]: {
    kind: 'planned',
    producers: [
      'packages/limina/src/source-check/runner.ts#createStructuredSourceIssueFromProblem',
    ],
    reason: DIRECT_CODE_TASK_ASSERTION_PLANNED,
    task: 'source:check',
  },
  [LIMINA_CHECK_ISSUE_CODES.sourceKnipBuildScriptUnsupported]: {
    kind: 'planned',
    producers: [
      'packages/limina/src/source-check/runner.ts#createStructuredSourceIssueFromProblem',
    ],
    reason: DIRECT_CODE_TASK_ASSERTION_PLANNED,
    task: 'source:check',
  },
  [LIMINA_CHECK_ISSUE_CODES.sourceKnipConfigInvalid]: {
    kind: 'planned',
    producers: [
      'packages/limina/src/source-check/runner.ts#createStructuredSourceIssueFromProblem',
    ],
    reason: DIRECT_CODE_TASK_ASSERTION_PLANNED,
    task: 'source:check',
  },
  [LIMINA_CHECK_ISSUE_CODES.sourceOwnerInvalid]: {
    kind: 'planned',
    producers: [
      'packages/limina/src/source-check/runner.ts#createStructuredSourceIssueFromProblem',
    ],
    reason: DIRECT_CODE_TASK_ASSERTION_PLANNED,
    task: 'source:check',
  },
  [LIMINA_CHECK_ISSUE_CODES.sourcePackageImportInvalid]: {
    kind: 'planned',
    producers: [
      'packages/limina/src/source-check/runner.ts#createStructuredSourceIssueFromProblem',
    ],
    reason: DIRECT_CODE_TASK_ASSERTION_PLANNED,
    task: 'source:check',
  },
  [LIMINA_CHECK_ISSUE_CODES.sourcePackageImportUnauthorized]: {
    kind: 'unit',
    producers: [
      'packages/limina/src/source-check/runner.ts#createStructuredSourceIssueFromProblem',
    ],
    task: 'source:check',
    tests: ['packages/limina/src/__tests__/source.spec.ts'],
  },
  [LIMINA_CHECK_ISSUE_CODES.sourceRelativeImportEscapesScope]: {
    kind: 'unit',
    producers: [
      'packages/limina/src/source-check/runner.ts#createStructuredSourceIssueFromProblem',
    ],
    task: 'source:check',
    tests: ['packages/limina/src/__tests__/source.spec.ts'],
  },
  [LIMINA_CHECK_ISSUE_CODES.sourceTsconfigGovernance]: {
    kind: 'unit',
    producers: [
      'packages/limina/src/source-check/runner.ts#createStructuredSourceIssueFromProblem',
    ],
    task: 'source:check',
    tests: ['packages/limina/src/__tests__/cli.spec.ts'],
  },
  [LIMINA_CHECK_ISSUE_CODES.sourceUnusedModule]: {
    kind: 'unit',
    producers: [
      'packages/limina/src/source-check/snapshot.ts#createSourceCheckIssue',
    ],
    task: 'source:check',
    tests: ['packages/limina/src/__tests__/cli.spec.ts'],
  },
  [LIMINA_CHECK_ISSUE_CODES.sourceUnusedWorkspaceDependency]: {
    kind: 'planned',
    producers: [
      'packages/limina/src/source-check/snapshot.ts#createSourceCheckIssue',
    ],
    reason: DIRECT_CODE_TASK_ASSERTION_PLANNED,
    task: 'source:check',
  },
  [LIMINA_CHECK_ISSUE_CODES.workspaceRegionOverlap]: {
    kind: 'unit',
    producers: [
      'packages/limina/src/core/workspace/validated-context.ts#createWorkspaceIssue',
    ],
    task: 'workspace:validate',
    tests: [
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
    kind: 'unit',
    producers: [
      'packages/limina/src/core/workspace/validated-context.ts#createWorkspaceIssue',
    ],
    task: 'workspace:validate',
    tests: ['packages/limina/src/__tests__/workspace-validation.spec.ts'],
  },
  [LIMINA_CHECK_ISSUE_CODES.workspaceOutputRootInvalid]: {
    kind: 'unit',
    producers: [
      'packages/limina/src/core/workspace/validated-context.ts#createWorkspaceIssue',
    ],
    task: 'workspace:validate',
    tests: ['packages/limina/src/__tests__/workspace-validation.spec.ts'],
  },
  [LIMINA_CHECK_ISSUE_CODES.workspacePackageIdentityConflict]: {
    kind: 'unit',
    producers: [
      'packages/limina/src/core/workspace/validated-context.ts#createWorkspaceIssue',
    ],
    task: 'workspace:validate',
    tests: ['packages/limina/src/__tests__/workspace-validation.spec.ts'],
  },
} satisfies DetectorCoverageRegistry;
