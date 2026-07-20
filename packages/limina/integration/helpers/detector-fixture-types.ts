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

export interface ExpectedLocation {
  readonly column?: number;
  readonly filePath?: string;
  readonly label?: string;
  readonly line?: number;
  readonly packageManifestPath?: string;
  readonly scope?: string;
}

export interface ExpectedIssue {
  readonly checkerName?: string;
  readonly code: LiminaCheckIssueCode;
  readonly evidence?: readonly ExpectedEvidence[];
  readonly externalCode?: string;
  readonly filePath?: string;
  readonly locations?: readonly ExpectedLocation[];
  readonly packageManifestPath?: string;
  readonly packageName?: string;
  readonly reason?: string;
  readonly scope?: string;
  readonly task: LiminaCheckTaskName;
}

export interface LocalRegistryPackageFile {
  readonly content: string;
  readonly path: string;
}

export type LocalRegistryDigestDeclaration =
  | { readonly kind: 'actual' }
  | { readonly kind: 'mismatch' }
  | { readonly kind: 'omit' }
  | { readonly kind: 'value'; readonly value: unknown };

export type LocalRegistryResponseBody =
  | {
      readonly kind: 'bytes';
      readonly valueBase64: string;
    }
  | {
      readonly kind: 'close-connection';
    }
  | {
      readonly kind: 'delay';
      readonly milliseconds: number;
      readonly next: LocalRegistryResponseBody;
    }
  | {
      readonly kind: 'incomplete-body';
      readonly value: string;
    }
  | {
      readonly kind: 'json';
      readonly value: unknown;
    }
  | {
      readonly files: readonly LocalRegistryPackageFile[];
      readonly kind: 'package-tarball';
    }
  | {
      readonly distTag?: string;
      readonly integrity: LocalRegistryDigestDeclaration;
      readonly kind: 'package-metadata';
      readonly shasum?: LocalRegistryDigestDeclaration;
      readonly tarballPath?: string;
      readonly version: string;
    }
  | {
      readonly kind: 'text';
      readonly value: string;
    };

export interface LocalRegistryResponse {
  readonly body: LocalRegistryResponseBody;
  readonly headers?: Readonly<Record<string, string>>;
  readonly status?: number;
}

export interface ExpectedRegistryRequest {
  readonly headers?: Readonly<Record<string, string>>;
  readonly method?: 'GET';
  readonly pathname: string;
}

export interface LocalRegistryScenario {
  readonly expectedRequests: readonly ExpectedRegistryRequest[];
  readonly metadata: LocalRegistryResponse;
  readonly packageName: string;
  readonly requestTimeoutMs?: number;
  readonly tarballs?: Readonly<Record<string, LocalRegistryResponse>>;
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
  readonly registry?: LocalRegistryScenario;
  readonly setup?: readonly FixtureSetupOperation[];
  readonly tools?: readonly FixtureToolName[];
}

export function defineDetectorFixture<
  const Definition extends DetectorFixtureDefinition,
>(definition: Definition): Definition {
  return definition;
}
