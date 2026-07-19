import type { LiminaCheckIssueCode } from '../../src/check-reporting/codes';
import type { LiminaCheckTaskName } from '../../src/check-reporting/snapshot';

export const FIXTURE_TOOL_NAMES = [
  'typescript',
  'tsgo',
  'vue-tsc',
  'vue-tsgo',
  'svelte-check',
  'knip',
  'publint',
  'attw',
  'npm-package-json-lint',
] as const;

export type FixtureToolName = (typeof FIXTURE_TOOL_NAMES)[number];

export interface FixtureCopyPolicy {
  readonly excludedNames?: readonly string[];
  readonly includeBuildInfoFiles?: boolean;
  readonly includeOutputDirectories?: boolean;
}

export type FixtureSetupOperation =
  | {
      readonly kind: 'directory-link';
      readonly path: string;
      readonly target: string;
    }
  | {
      readonly content: string;
      readonly kind: 'write-file';
      readonly overwrite?: boolean;
      readonly path: string;
    }
  | {
      readonly allowMissing?: boolean;
      readonly kind: 'remove-path';
      readonly path: string;
    };

export type FixtureMutation =
  | {
      readonly content: string;
      readonly kind: 'write-file';
      readonly overwrite?: boolean;
      readonly path: string;
    }
  | {
      readonly all?: boolean;
      readonly kind: 'replace-text';
      readonly path: string;
      readonly replacement: string;
      readonly search: string;
    }
  | {
      readonly allowMissing?: boolean;
      readonly kind: 'remove-path';
      readonly path: string;
    };

export interface ExpectedEvidence {
  readonly label?: string;
  readonly lines?: readonly string[];
  readonly value?: string;
}

export interface ExpectedIssue {
  readonly checkerName?: string;
  readonly code: LiminaCheckIssueCode;
  readonly evidence?: readonly ExpectedEvidence[];
  readonly externalCode?: string;
  readonly filePath?: string;
  readonly packageManifestPath?: string;
  readonly packageName?: string;
  readonly task: LiminaCheckTaskName;
}

export interface DetectorFixtureExpectation {
  readonly additionalCodes?: readonly LiminaCheckIssueCode[];
  readonly allowUnexpectedIssues?: boolean;
  readonly exitCode: number;
  readonly issues: readonly ExpectedIssue[];
  readonly primaryCode?: LiminaCheckIssueCode;
}

export interface DetectorFixtureDefinition {
  readonly allowedGeneratedPaths?: readonly string[];
  readonly command: readonly string[];
  readonly copyPolicy?: FixtureCopyPolicy;
  readonly environment?: Readonly<Record<string, string>>;
  readonly expected: DetectorFixtureExpectation;
  readonly id: string;
  readonly kind: 'external-tool' | 'fault-injection' | 'filesystem';
  readonly mutations?: readonly FixtureMutation[];
  readonly setup?: readonly FixtureSetupOperation[];
  readonly tools?: readonly FixtureToolName[];
}

export function defineDetectorFixture<
  const Definition extends DetectorFixtureDefinition,
>(definition: Definition): Definition {
  return definition;
}
