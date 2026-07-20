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
    kind: 'external-tool',
    producers: ['packages/limina/src/package-check/runner.ts#runAttwCheck'],
    task: 'package:check',
    tests: [
      'packages/limina/fixtures/detectors/package/attw-cjs-only-exports-default/case.mts',
      'packages/limina/fixtures/detectors/package/attw-cjs-resolves-to-esm/case.mts',
      'packages/limina/fixtures/detectors/package/attw-dual-package-valid/case.mts',
      'packages/limina/fixtures/detectors/package/attw-fallback-condition/case.mts',
      'packages/limina/fixtures/detectors/package/attw-false-cjs/case.mts',
      'packages/limina/fixtures/detectors/package/attw-false-esm/case.mts',
      'packages/limina/fixtures/detectors/package/attw-false-export-default/case.mts',
      'packages/limina/fixtures/detectors/package/attw-internal-resolution-error/case.mts',
      'packages/limina/fixtures/detectors/package/attw-missing-export-equals/case.mts',
      'packages/limina/fixtures/detectors/package/attw-named-exports/case.mts',
      'packages/limina/fixtures/detectors/package/attw-no-resolution-bundler/case.mts',
      'packages/limina/fixtures/detectors/package/attw-unexpected-module-syntax/case.mts',
      'packages/limina/fixtures/detectors/package/attw-untyped-resolution-bundler/case.mts',
      'packages/limina/integration/tests/detector-fixtures.spec.ts',
      'packages/limina/src/__tests__/package.spec.ts',
    ],
  },
  [LIMINA_CHECK_ISSUE_CODES.packageBoundary]: {
    kind: 'fixture',
    producers: ['packages/limina/src/package-check/runner.ts#runBoundaryCheck'],
    task: 'package:check',
    tests: [
      'packages/limina/fixtures/detectors/package/boundary-browser-node-builtin/case.mts',
      'packages/limina/fixtures/detectors/package/boundary-external-package-undeclared/case.mts',
      'packages/limina/fixtures/detectors/package/boundary-imports-invalid-target/case.mts',
      'packages/limina/fixtures/detectors/package/boundary-imports-missing/case.mts',
      'packages/limina/fixtures/detectors/package/boundary-imports-null-target/case.mts',
      'packages/limina/fixtures/detectors/package/boundary-imports-target-escapes-root/case.mts',
      'packages/limina/fixtures/detectors/package/boundary-imports-target-missing/case.mts',
      'packages/limina/fixtures/detectors/package/boundary-imports-target-unsupported/case.mts',
      'packages/limina/fixtures/detectors/package/boundary-self-import-not-exported/case.mts',
      'packages/limina/integration/tests/detector-fixtures.spec.ts',
      'packages/limina/src/__tests__/package.spec.ts',
    ],
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
    kind: 'fixture',
    producers: [
      'packages/limina/src/package-check/runner.ts#runPackageCheckEntry',
    ],
    task: 'package:check',
    tests: [
      'packages/limina/fixtures/detectors/package/manifest-local-specifier-catalog/case.mts',
      'packages/limina/fixtures/detectors/package/manifest-local-specifier-file/case.mts',
      'packages/limina/fixtures/detectors/package/manifest-local-specifier-link/case.mts',
      'packages/limina/fixtures/detectors/package/manifest-local-specifier-workspace/case.mts',
      'packages/limina/fixtures/detectors/package/manifest-name-missing/case.mts',
      'packages/limina/integration/tests/detector-fixtures.spec.ts',
      'packages/limina/src/__tests__/package.spec.ts',
    ],
  },
  [LIMINA_CHECK_ISSUE_CODES.packagePublint]: {
    kind: 'external-tool',
    producers: ['packages/limina/src/package-check/runner.ts#runPublintCheck'],
    task: 'package:check',
    tests: [
      'packages/limina/fixtures/detectors/package/publint-export-file-missing/case.mts',
      'packages/limina/fixtures/detectors/package/publint-exports-types-order/case.mts',
      'packages/limina/fixtures/detectors/package/publint-module-should-be-esm/case.mts',
      'packages/limina/integration/tests/detector-fixtures.spec.ts',
      'packages/limina/src/__tests__/package.spec.ts',
    ],
  },
  [LIMINA_CHECK_ISSUE_CODES.pipelineCommandFailed]: {
    kind: 'retired',
    reason:
      'Released legacy alias with no independent producer; historical readers accept it, while new issue creators and snapshot writers reject it.',
    task: 'command',
  },
  [LIMINA_CHECK_ISSUE_CODES.proofAllowlistInvalid]: {
    kind: 'fixture',
    producers: [
      'packages/limina/src/proof/allowlist.ts#collectConfiguredAllowlistEntries',
      'packages/limina/src/proof/allowlist.ts#addAllowlistFindings',
    ],
    task: 'proof:check',
    tests: [
      'packages/limina/fixtures/detectors/proof/allowlist-file-empty/case.mts',
      'packages/limina/integration/tests/detector-fixtures.spec.ts',
      'packages/limina/src/__tests__/proof-findings.spec.ts',
      'packages/limina/src/__tests__/proof.spec.ts',
    ],
  },
  [LIMINA_CHECK_ISSUE_CODES.proofCheckerCoverageInvalid]: {
    kind: 'fixture',
    producers: [
      'packages/limina/src/proof/runner.ts#createProofCheckerRouteFinding',
      'packages/limina/src/proof/runner.ts#collectCheckerCoverageTargets',
      'packages/limina/src/proof/runner.ts#addDtsConfigFindings',
      'packages/limina/src/proof/runner.ts#addBuildGraphConfigFindings',
      'packages/limina/src/proof/runner.ts#addSourceReferenceRoleFindings',
    ],
    task: 'proof:check',
    tests: [
      'packages/limina/fixtures/detectors/proof/checker-source-references/case.mts',
      'packages/limina/integration/tests/detector-fixtures.spec.ts',
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
    kind: 'fixture',
    producers: [
      'packages/limina/src/proof/runner.ts#addDefaultTsconfigShapeFindings',
      'packages/limina/src/proof/runner.ts#addDefaultTsconfigEnvironmentFindings',
    ],
    task: 'proof:check',
    tests: [
      'packages/limina/fixtures/detectors/proof/default-tsconfig-missing/case.mts',
      'packages/limina/integration/tests/detector-fixtures.spec.ts',
      'packages/limina/src/__tests__/proof-findings.spec.ts',
      'packages/limina/src/__tests__/proof.spec.ts',
    ],
  },
  [LIMINA_CHECK_ISSUE_CODES.proofDuplicateGraphCoverage]: {
    kind: 'fixture',
    producers: [
      'packages/limina/src/proof/runner.ts#addDuplicateGraphCoverageFindings',
    ],
    task: 'proof:check',
    tests: [
      'packages/limina/fixtures/detectors/proof/duplicate-graph-json/case.mts',
      'packages/limina/integration/tests/detector-fixtures.spec.ts',
      'packages/limina/src/__tests__/proof-findings.spec.ts',
      'packages/limina/src/__tests__/proof.spec.ts',
    ],
  },
  [LIMINA_CHECK_ISSUE_CODES.proofDuplicateSourceOwner]: {
    kind: 'fixture',
    producers: [
      'packages/limina/src/proof/runner.ts#addDuplicateTypecheckOwnershipFindings',
    ],
    task: 'proof:check',
    tests: [
      'packages/limina/fixtures/detectors/proof/duplicate-source-owner/case.mts',
      'packages/limina/integration/tests/detector-fixtures.spec.ts',
      'packages/limina/src/__tests__/proof-findings.spec.ts',
      'packages/limina/src/__tests__/proof.spec.ts',
    ],
  },
  [LIMINA_CHECK_ISSUE_CODES.proofSourceBoundaryMismatch]: {
    kind: 'fixture',
    producers: [
      'packages/limina/src/proof/runner.ts#addSourceBoundaryMismatchFindings',
    ],
    task: 'proof:check',
    tests: [
      'packages/limina/fixtures/detectors/proof/source-boundary-mismatch/case.mts',
      'packages/limina/integration/tests/detector-fixtures.spec.ts',
      'packages/limina/src/__tests__/proof-findings.spec.ts',
      'packages/limina/src/__tests__/proof.spec.ts',
    ],
  },
  [LIMINA_CHECK_ISSUE_CODES.proofUncoveredSourceFile]: {
    kind: 'fixture',
    producers: [
      'packages/limina/src/proof/runner.ts#addUncoveredSourceFindings',
    ],
    task: 'proof:check',
    tests: [
      'packages/limina/fixtures/detectors/proof/coverage-missing/case.mts',
      'packages/limina/integration/tests/detector-fixtures.spec.ts',
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
    kind: 'fixture',
    producers: [
      'packages/limina/src/package-check/release-consistency.ts#addContentHashFinding',
      'packages/limina/src/package-check/release-consistency.ts#verifyWorkspacePackagePublished',
    ],
    task: 'release:check',
    tests: [
      'packages/limina/fixtures/detectors/release/content-hash-builtin-ignore/case.mts',
      'packages/limina/fixtures/detectors/release/content-hash-changed/case.mts',
      'packages/limina/fixtures/detectors/release/content-hash-config-invalid-baseline-tag/case.mts',
      'packages/limina/fixtures/detectors/release/content-hash-config-invalid-ignore/case.mts',
      'packages/limina/fixtures/detectors/release/content-hash-local-only/case.mts',
      'packages/limina/fixtures/detectors/release/content-hash-remote-only/case.mts',
      'packages/limina/fixtures/detectors/release/content-hash-user-ignore/case.mts',
      'packages/limina/fixtures/detectors/release/content-hash-user-ignore-non-match/case.mts',
      'packages/limina/integration/tests/detector-fixtures.spec.ts',
      'packages/limina/src/__tests__/release-findings.spec.ts',
      'packages/limina/src/__tests__/package.spec.ts',
    ],
  },
  [LIMINA_CHECK_ISSUE_CODES.releasePackedManifest]: {
    kind: 'fixture',
    producers: [
      'packages/limina/src/commands/release.ts#collectOutputManifestFindings',
      'packages/limina/src/package-check/release-consistency.ts#addPackedManifestFinding',
      'packages/limina/src/package-check/release-consistency.ts#visitWorkspacePackageDependencies',
      'packages/limina/src/package-check/release-consistency.ts#validatePackedManifestLint',
      'packages/limina/src/package-check/release-consistency.ts#validatePackedManifest',
    ],
    task: 'release:check',
    tests: [
      'packages/limina/fixtures/detectors/release/packed-dependency-missing/case.mts',
      'packages/limina/fixtures/detectors/release/packed-dependency-range-mismatch/case.mts',
      'packages/limina/fixtures/detectors/release/packed-manifest-lint/case.mts',
      'packages/limina/fixtures/detectors/release/packed-output-catalog-specifier/case.mts',
      'packages/limina/fixtures/detectors/release/packed-output-file-specifier/case.mts',
      'packages/limina/fixtures/detectors/release/packed-output-link-specifier/case.mts',
      'packages/limina/fixtures/detectors/release/packed-output-workspace-specifier/case.mts',
      'packages/limina/fixtures/detectors/release/packed-source-link-dependency/case.mts',
      'packages/limina/fixtures/detectors/release/packed-source-private-dependency/case.mts',
      'packages/limina/fixtures/detectors/release/packed-source-workspace-dependency-missing/case.mts',
      'packages/limina/integration/tests/detector-fixtures.spec.ts',
      'packages/limina/src/__tests__/release-findings.spec.ts',
      'packages/limina/src/__tests__/package.spec.ts',
    ],
  },
  [LIMINA_CHECK_ISSUE_CODES.releaseRegistry]: {
    kind: 'external-tool',
    producers: [
      'packages/limina/src/package-check/release-consistency.ts#addRegistryFinding',
      'packages/limina/src/package-check/release-consistency.ts#fetchRegistryPackageMetadata',
      'packages/limina/src/package-check/release-consistency.ts#fetchRegistryTarball',
      'packages/limina/src/package-check/release-consistency.ts#verifyWorkspacePackagePublished',
    ],
    task: 'release:check',
    tests: [
      'packages/limina/fixtures/detectors/release/registry-comparison-failed/case.mts',
      'packages/limina/fixtures/detectors/release/registry-dist-tag-missing/case.mts',
      'packages/limina/fixtures/detectors/release/registry-integrity-invalid/case.mts',
      'packages/limina/fixtures/detectors/release/registry-integrity-mismatch/case.mts',
      'packages/limina/fixtures/detectors/release/registry-integrity-missing/case.mts',
      'packages/limina/fixtures/detectors/release/registry-integrity-priority/case.mts',
      'packages/limina/fixtures/detectors/release/registry-metadata-body-read/case.mts',
      'packages/limina/fixtures/detectors/release/registry-metadata-http-status/case.mts',
      'packages/limina/fixtures/detectors/release/registry-metadata-invalid-json/case.mts',
      'packages/limina/fixtures/detectors/release/registry-metadata-invalid-object/case.mts',
      'packages/limina/fixtures/detectors/release/registry-metadata-request/case.mts',
      'packages/limina/fixtures/detectors/release/registry-metadata-timeout/case.mts',
      'packages/limina/fixtures/detectors/release/registry-package-not-found/case.mts',
      'packages/limina/fixtures/detectors/release/registry-shasum-invalid/case.mts',
      'packages/limina/fixtures/detectors/release/registry-shasum-mismatch/case.mts',
      'packages/limina/fixtures/detectors/release/registry-tarball-body-read/case.mts',
      'packages/limina/fixtures/detectors/release/registry-tarball-http-status/case.mts',
      'packages/limina/fixtures/detectors/release/registry-tarball-request/case.mts',
      'packages/limina/fixtures/detectors/release/registry-tarball-timeout/case.mts',
      'packages/limina/fixtures/detectors/release/registry-tarball-url-missing/case.mts',
      'packages/limina/fixtures/detectors/release/registry-version-missing/case.mts',
      'packages/limina/integration/tests/detector-fixtures.spec.ts',
      'packages/limina/src/__tests__/release-findings.spec.ts',
      'packages/limina/src/__tests__/package.spec.ts',
    ],
  },
  [LIMINA_CHECK_ISSUE_CODES.releaseTarballHygiene]: {
    kind: 'fixture',
    producers: [
      'packages/limina/src/commands/release.ts#runReleaseCheckEntry',
      'packages/limina/src/package-check/release-consistency.ts#addTarballHygieneFinding',
      'packages/limina/src/package-check/release-consistency.ts#readPackedPackageJson',
      'packages/limina/src/package-check/release-consistency.ts#validateReleaseTarballHygiene',
    ],
    task: 'release:check',
    tests: [
      'packages/limina/fixtures/detectors/release/tarball-license-missing/case.mts',
      'packages/limina/fixtures/detectors/release/tarball-output-private/case.mts',
      'packages/limina/fixtures/detectors/release/tarball-readme-missing/case.mts',
      'packages/limina/fixtures/detectors/release/tarball-source-map/case.mts',
      'packages/limina/fixtures/detectors/release/tarball-source-mapping-url/case.mts',
      'packages/limina/fixtures/detectors/release/tarball-valid/case.mts',
      'packages/limina/integration/tests/detector-fixtures.spec.ts',
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
    kind: 'fixture',
    producers: [
      'packages/limina/src/source-check/ambient-declarations.ts#createConfigIssue',
    ],
    task: 'source:check',
    tests: [
      'packages/limina/fixtures/detectors/source/ambient-config-no-matches/case.mts',
      'packages/limina/integration/tests/detector-fixtures.spec.ts',
      'packages/limina/src/__tests__/ambient-declarations.spec.ts',
    ],
  },
  [LIMINA_CHECK_ISSUE_CODES.sourceAmbientDeclarationSharedUnauthorized]: {
    kind: 'fixture',
    producers: [
      'packages/limina/src/source-check/runner.ts#addTsconfigGovernanceProblems',
    ],
    task: 'source:check',
    tests: [
      'packages/limina/fixtures/detectors/source/ambient-shared-unauthorized/case.mts',
      'packages/limina/integration/tests/detector-fixtures.spec.ts',
      'packages/limina/src/__tests__/source-findings.spec.ts',
      'packages/limina/src/__tests__/source.spec.ts',
    ],
  },
  [LIMINA_CHECK_ISSUE_CODES.sourceAmbientDeclarationReferenceUnauthorized]: {
    kind: 'fixture',
    producers: [
      'packages/limina/src/source-check/runner.ts#addRelativeImportProblems',
    ],
    task: 'source:check',
    tests: [
      'packages/limina/fixtures/detectors/source/ambient-reference-unauthorized/case.mts',
      'packages/limina/integration/tests/detector-fixtures.spec.ts',
      'packages/limina/src/__tests__/source-findings.spec.ts',
      'packages/limina/src/__tests__/source.spec.ts',
    ],
  },
  [LIMINA_CHECK_ISSUE_CODES.sourceCrossGovernanceBoundary]: {
    kind: 'fixture',
    producers: [
      'packages/limina/src/source-check/runner.ts#addSourceCrossGovernanceBoundaryProblem',
    ],
    task: 'source:check',
    tests: [
      'packages/limina/fixtures/detectors/source/cross-governance-require-resolve/case.mts',
      'packages/limina/integration/tests/detector-fixtures.spec.ts',
      'packages/limina/src/__tests__/source-findings.spec.ts',
    ],
  },
  [LIMINA_CHECK_ISSUE_CODES.sourceImportAuthorityInvalid]: {
    kind: 'fixture',
    producers: [
      'packages/limina/src/source-check/runner.ts#addImportAuthorityConfigFinding',
    ],
    task: 'source:check',
    tests: [
      'packages/limina/fixtures/detectors/source/import-authority-unknown-owner/case.mts',
      'packages/limina/integration/tests/detector-fixtures.spec.ts',
      'packages/limina/src/__tests__/source-findings.spec.ts',
    ],
  },
  [LIMINA_CHECK_ISSUE_CODES.sourceKnipBuildScriptUnsupported]: {
    kind: 'fixture',
    producers: [
      'packages/limina/src/source-check/runner.ts#addKnipBackedSourceProblems',
    ],
    task: 'source:check',
    tests: [
      'packages/limina/fixtures/detectors/source/knip-build-script-unsupported/case.mts',
      'packages/limina/integration/tests/detector-fixtures.spec.ts',
      'packages/limina/src/__tests__/source-findings.spec.ts',
      'packages/limina/src/__tests__/source.spec.ts',
    ],
  },
  [LIMINA_CHECK_ISSUE_CODES.sourceKnipConfigInvalid]: {
    kind: 'fixture',
    producers: [
      'packages/limina/src/source-check/findings.ts#createSourceKnipConfigFinding',
    ],
    task: 'source:check',
    tests: [
      'packages/limina/fixtures/detectors/source/knip-config-workspaces-invalid/case.mts',
      'packages/limina/integration/tests/detector-fixtures.spec.ts',
      'packages/limina/src/__tests__/source-findings.spec.ts',
      'packages/limina/src/__tests__/source.spec.ts',
    ],
  },
  [LIMINA_CHECK_ISSUE_CODES.sourceOwnerInvalid]: {
    kind: 'fixture',
    producers: [
      'packages/limina/src/source-check/runner.ts#addProjectOwnerProblems',
      'packages/limina/src/source-check/runner.ts#addSourceImportOutsideActivatedRegionProblem',
      'packages/limina/src/source-check/runner.ts#addTsconfigGovernanceProblems',
    ],
    task: 'source:check',
    tests: [
      'packages/limina/fixtures/detectors/source/owner-conflict/case.mts',
      'packages/limina/integration/tests/detector-fixtures.spec.ts',
      'packages/limina/src/__tests__/source-findings.spec.ts',
      'packages/limina/src/__tests__/source.spec.ts',
    ],
  },
  [LIMINA_CHECK_ISSUE_CODES.sourcePackageImportInvalid]: {
    kind: 'fixture',
    producers: [
      'packages/limina/src/source-check/runner.ts#addPackageImportProblem',
    ],
    task: 'source:check',
    tests: [
      'packages/limina/fixtures/detectors/source/package-import-invalid/case.mts',
      'packages/limina/integration/tests/detector-fixtures.spec.ts',
      'packages/limina/src/__tests__/source-findings.spec.ts',
      'packages/limina/src/__tests__/source.spec.ts',
    ],
  },
  [LIMINA_CHECK_ISSUE_CODES.sourcePackageImportUnauthorized]: {
    kind: 'fixture',
    producers: [
      'packages/limina/src/source-check/runner.ts#addPackageImportAuthorizationProblem',
    ],
    task: 'source:check',
    tests: [
      'packages/limina/fixtures/detectors/source/package-import-unauthorized/case.mts',
      'packages/limina/integration/tests/detector-fixtures.spec.ts',
      'packages/limina/src/__tests__/source-findings.spec.ts',
      'packages/limina/src/__tests__/source.spec.ts',
    ],
  },
  [LIMINA_CHECK_ISSUE_CODES.sourceRelativeImportEscapesScope]: {
    kind: 'fixture',
    producers: [
      'packages/limina/src/source-check/runner.ts#addRelativeImportOwnerProblem',
    ],
    task: 'source:check',
    tests: [
      'packages/limina/fixtures/detectors/source/relative-import-escapes-scope/case.mts',
      'packages/limina/integration/tests/detector-fixtures.spec.ts',
      'packages/limina/src/__tests__/source-findings.spec.ts',
      'packages/limina/src/__tests__/source.spec.ts',
    ],
  },
  [LIMINA_CHECK_ISSUE_CODES.sourceTsconfigGovernance]: {
    kind: 'fixture',
    producers: [
      'packages/limina/src/source-check/runner.ts#addTsconfigGovernanceProblems',
      'packages/limina/src/source-check/runner.ts#runSourceCheckImpl',
    ],
    task: 'source:check',
    tests: [
      'packages/limina/fixtures/detectors/source/owner-conflict/case.mts',
      'packages/limina/fixtures/detectors/source/tsconfig-module-owner-unresolved/case.mts',
      'packages/limina/integration/tests/detector-fixtures.spec.ts',
      'packages/limina/src/__tests__/source-findings.spec.ts',
      'packages/limina/src/__tests__/source.spec.ts',
    ],
  },
  [LIMINA_CHECK_ISSUE_CODES.sourceUnusedModule]: {
    kind: 'external-tool',
    producers: [
      'packages/limina/src/source-check/runner.ts#addUnusedModuleProblems',
    ],
    task: 'source:check',
    tests: [
      'packages/limina/fixtures/detectors/source/knip-usage-valid/case.mts',
      'packages/limina/fixtures/detectors/source/unused-module/case.mts',
      'packages/limina/integration/tests/detector-fixtures.spec.ts',
      'packages/limina/src/__tests__/source-findings.spec.ts',
      'packages/limina/src/__tests__/source.spec.ts',
    ],
  },
  [LIMINA_CHECK_ISSUE_CODES.sourceUnusedWorkspaceDependency]: {
    kind: 'external-tool',
    producers: [
      'packages/limina/src/source-check/runner.ts#addUnusedDependencyProblems',
    ],
    task: 'source:check',
    tests: [
      'packages/limina/fixtures/detectors/source/knip-usage-valid/case.mts',
      'packages/limina/fixtures/detectors/source/unused-workspace-dependency/case.mts',
      'packages/limina/integration/tests/detector-fixtures.spec.ts',
      'packages/limina/src/__tests__/source-findings.spec.ts',
    ],
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
