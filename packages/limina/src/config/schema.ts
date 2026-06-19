import { getCheckerAdapter } from '#checkers';
import type { LiminaConfig } from '#config/runner';
import { z } from 'zod';

const checkerExtensionsConfigReason =
  'checker extensions are fixed by built-in presets and cannot be configured.';

const checkerRoutesConfigReason =
  'checker routes are not supported; configure checker.include with source tsconfig selectors.';

const unsupportedCheckerPresetReason =
  'configured checkers require a built-in checker adapter.';

const checkerEntryConfigReason =
  'checker.entry has been removed; configure checker.include with source tsconfig selectors.';

const checkerConfigShapeSchema = z
  .looseObject({})
  .superRefine((checker, ctx) => {
    const preset = checker.preset;
    const include = checker.include;
    const exclude = checker.exclude;

    if (Object.hasOwn(checker, 'entry')) {
      ctx.addIssue({
        code: 'custom',
        message: checkerEntryConfigReason,
        path: ['entry'],
      });
    }

    if (Object.hasOwn(checker, 'extensions')) {
      ctx.addIssue({
        code: 'custom',
        message: checkerExtensionsConfigReason,
        path: ['extensions'],
      });
    }

    if (Object.hasOwn(checker, 'routes')) {
      ctx.addIssue({
        code: 'custom',
        message: checkerRoutesConfigReason,
        path: ['routes'],
      });
    }

    if (typeof preset !== 'string' || preset.trim().length === 0) {
      ctx.addIssue({
        code: 'custom',
        message: 'checker preset must be a non-empty string.',
        path: ['preset'],
      });
    } else if (!getCheckerAdapter(preset)) {
      ctx.addIssue({
        code: 'custom',
        message: unsupportedCheckerPresetReason,
        path: ['preset'],
      });
    }

    if (!Array.isArray(include) || include.length === 0) {
      ctx.addIssue({
        code: 'custom',
        message: 'checker include must be a non-empty string array.',
        path: ['include'],
      });
    } else {
      for (const [index, value] of include.entries()) {
        if (typeof value !== 'string' || value.trim().length === 0) {
          ctx.addIssue({
            code: 'custom',
            message: 'checker include entries must be non-empty string paths.',
            path: ['include', index],
          });
        }
      }
    }

    if (exclude === undefined) {
      return;
    }

    if (!Array.isArray(exclude)) {
      ctx.addIssue({
        code: 'custom',
        message: 'checker exclude must be a string array when configured.',
        path: ['exclude'],
      });
      return;
    }

    for (const [index, value] of exclude.entries()) {
      if (typeof value !== 'string' || value.trim().length === 0) {
        ctx.addIssue({
          code: 'custom',
          message: 'checker exclude entries must be non-empty string paths.',
          path: ['exclude', index],
        });
      }
    }
  });

function isPlainConfigRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

const sharedLiminaConfigShapeSchema = z
  .looseObject({})
  .superRefine((sharedConfig, ctx) => {
    const checkers = sharedConfig.checkers;
    const source = sharedConfig.source;

    if (checkers !== undefined && checkers !== 'auto') {
      if (isPlainConfigRecord(checkers)) {
        for (const [checkerName, checker] of Object.entries(checkers)) {
          const result = checkerConfigShapeSchema.safeParse(checker);

          if (result.success) {
            continue;
          }

          for (const issue of result.error.issues) {
            ctx.addIssue({
              ...issue,
              path: ['checkers', checkerName, ...issue.path],
            });
          }
        }
      } else {
        ctx.addIssue({
          code: 'custom',
          message:
            'config.checkers must be "auto" or an object keyed by checker name.',
          path: ['checkers'],
        });
      }
    }

    if (source === null || source === undefined || typeof source !== 'object') {
      return;
    }

    const sourceRecord = source as Record<string, unknown>;

    if (Object.hasOwn(sourceRecord, 'tsconfigOwnership')) {
      ctx.addIssue({
        code: 'custom',
        message:
          'source.tsconfigOwnership belongs at the top-level source config, not under config.source.',
        path: ['source', 'tsconfigOwnership', 'ignore'],
      });
    }
  });

const releaseContentHashShapeSchema = z
  .looseObject({})
  .superRefine((contentHash, ctx) => {
    const baselineTag = contentHash.baselineTag;

    if (
      baselineTag !== undefined &&
      typeof baselineTag !== 'function' &&
      (typeof baselineTag !== 'string' || baselineTag.trim().length === 0)
    ) {
      ctx.addIssue({
        code: 'custom',
        message: 'baselineTag must be a non-empty string or function.',
        path: ['baselineTag'],
      });
    }

    const builtinIgnore = contentHash.builtinIgnore;

    if (builtinIgnore !== undefined && typeof builtinIgnore !== 'boolean') {
      ctx.addIssue({
        code: 'custom',
        message: 'builtinIgnore must be a boolean.',
        path: ['builtinIgnore'],
      });
    }

    const ignore = contentHash.ignore;

    if (ignore === undefined || typeof ignore === 'function') {
      return;
    }

    if (!Array.isArray(ignore)) {
      ctx.addIssue({
        code: 'custom',
        message: 'ignore must be an array of non-empty strings or function.',
        path: ['ignore'],
      });
      return;
    }

    for (const [index, pattern] of ignore.entries()) {
      if (typeof pattern === 'string' && pattern.trim().length > 0) {
        continue;
      }

      ctx.addIssue({
        code: 'custom',
        message: 'ignore patterns must be non-empty strings.',
        path: ['ignore', index],
      });
    }
  });

const releaseConfigShapeSchema = z.looseObject({
  contentHash: releaseContentHashShapeSchema.optional(),
});

const liminaConfigShapeSchema = z
  .looseObject({
    config: sharedLiminaConfigShapeSchema.optional(),
    release: releaseConfigShapeSchema.optional(),
  })
  .superRefine((config, ctx) => {
    if (!Object.hasOwn(config, 'paths')) {
      return;
    }

    ctx.addIssue({
      code: 'custom',
      message:
        'paths config has been removed; use graph/proof/source checks instead.',
      path: ['paths'],
    });
  });

function formatUnknownValue(value: unknown): string {
  if (value === undefined) {
    return 'undefined';
  }

  return JSON.stringify(value);
}

function formatZodPath(pathSegments: readonly PropertyKey[]): string {
  return pathSegments
    .map((segment) =>
      typeof segment === 'number' ? `[${segment}]` : `.${String(segment)}`,
    )
    .join('')
    .replace(/^\./u, '');
}

function getValueAtPath(
  value: unknown,
  pathSegments: readonly PropertyKey[],
): unknown {
  let current = value;

  for (const segment of pathSegments) {
    if (current === undefined || current === null) {
      return undefined;
    }

    current = (current as Record<PropertyKey, unknown>)[segment];
  }

  return current;
}

function formatLiminaConfigShapeIssue(
  value: unknown,
  issue: z.core.$ZodIssue,
): string {
  const pathSegments = issue.path as PropertyKey[];
  const field = formatZodPath(pathSegments);

  if (pathSegments.length === 0) {
    return 'limina config must export or return an object.';
  }

  if (field === 'config') {
    return [
      'Invalid Limina config:',
      '  field: config',
      `  value: ${formatUnknownValue(getValueAtPath(value, pathSegments))}`,
      '  reason: config must be an object.',
    ].join('\n');
  }

  if (field === 'paths') {
    return [
      'Invalid Limina paths config:',
      '  field: paths',
      `  value: ${formatUnknownValue(getValueAtPath(value, pathSegments))}`,
      `  reason: ${issue.message}`,
    ].join('\n');
  }

  if (field === 'config.checkers') {
    return [
      'Invalid Limina checker config:',
      '  field: config.checkers',
      `  value: ${formatUnknownValue(getValueAtPath(value, pathSegments))}`,
      '  reason: config.checkers must be "auto" or an object keyed by checker name.',
    ].join('\n');
  }

  if (field === 'config.source.tsconfigOwnership.ignore') {
    return [
      'Invalid Limina source config:',
      '  field: config.source.tsconfigOwnership.ignore',
      `  value: ${formatUnknownValue(getValueAtPath(value, pathSegments))}`,
      `  reason: ${issue.message}`,
    ].join('\n');
  }

  if (pathSegments[0] === 'config' && pathSegments[1] === 'checkers') {
    const checkerName = pathSegments[2];
    const checkerField = `config.checkers.${String(checkerName)}`;

    if (pathSegments.length === 3) {
      return [
        'Invalid Limina checker config:',
        `  field: ${checkerField}`,
        `  value: ${formatUnknownValue(getValueAtPath(value, pathSegments))}`,
        '  reason: checker entries must be objects.',
      ].join('\n');
    }

    if (pathSegments[3] === 'preset') {
      if (issue.message === unsupportedCheckerPresetReason) {
        return [
          'Unsupported Limina checker preset:',
          `  field: ${checkerField}.preset`,
          `  value: ${formatUnknownValue(getValueAtPath(value, pathSegments))}`,
          `  reason: ${issue.message}`,
        ].join('\n');
      }

      return [
        'Invalid Limina checker config:',
        `  field: ${checkerField}.preset`,
        `  value: ${formatUnknownValue(getValueAtPath(value, pathSegments))}`,
        '  reason: checker preset must be a non-empty string.',
      ].join('\n');
    }

    if (pathSegments[3] === 'entry') {
      return [
        'Invalid Limina checker entry config:',
        `  field: ${checkerField}.entry`,
        `  value: ${formatUnknownValue(getValueAtPath(value, pathSegments))}`,
        `  reason: ${issue.message}`,
      ].join('\n');
    }

    if (pathSegments[3] === 'extensions') {
      return [
        'Invalid Limina checker config:',
        `  field: ${checkerField}.extensions`,
        `  value: ${formatUnknownValue(getValueAtPath(value, pathSegments))}`,
        `  reason: ${issue.message}`,
      ].join('\n');
    }

    if (pathSegments[3] === 'routes') {
      return [
        'Invalid Limina checker config:',
        `  field: ${checkerField}.routes`,
        `  value: ${formatUnknownValue(getValueAtPath(value, pathSegments))}`,
        `  reason: ${issue.message}`,
      ].join('\n');
    }
  }

  if (field === 'release') {
    return [
      'Invalid Limina release config:',
      '  field: release',
      `  value: ${formatUnknownValue(getValueAtPath(value, pathSegments))}`,
      '  reason: release must be an object.',
    ].join('\n');
  }

  if (field === 'release.contentHash') {
    return [
      'Invalid Limina release config:',
      '  field: release.contentHash',
      `  value: ${formatUnknownValue(getValueAtPath(value, pathSegments))}`,
      '  reason: release.contentHash must be an object.',
    ].join('\n');
  }

  if (field === 'release.contentHash.baselineTag') {
    return [
      'Invalid Limina release config:',
      '  field: release.contentHash.baselineTag',
      `  value: ${formatUnknownValue(getValueAtPath(value, pathSegments))}`,
      '  reason: baselineTag must be a non-empty string or function.',
    ].join('\n');
  }

  if (field === 'release.contentHash.builtinIgnore') {
    return [
      'Invalid Limina release config:',
      '  field: release.contentHash.builtinIgnore',
      `  value: ${formatUnknownValue(getValueAtPath(value, pathSegments))}`,
      '  reason: builtinIgnore must be a boolean.',
    ].join('\n');
  }

  if (field === 'release.contentHash.ignore') {
    return [
      'Invalid Limina release config:',
      '  field: release.contentHash.ignore',
      `  value: ${formatUnknownValue(getValueAtPath(value, pathSegments))}`,
      '  reason: ignore must be an array of non-empty strings or function.',
    ].join('\n');
  }

  if (
    pathSegments[0] === 'release' &&
    pathSegments[1] === 'contentHash' &&
    pathSegments[2] === 'ignore'
  ) {
    return [
      'Invalid Limina release config:',
      `  field: ${field}`,
      `  value: ${formatUnknownValue(getValueAtPath(value, pathSegments))}`,
      '  reason: ignore patterns must be non-empty strings.',
    ].join('\n');
  }

  return [
    'Invalid Limina config:',
    `  field: ${field}`,
    `  value: ${formatUnknownValue(getValueAtPath(value, pathSegments))}`,
    `  reason: ${issue.message}`,
  ].join('\n');
}

function collectLiminaConfigShapeProblems(value: unknown): string[] {
  const result = liminaConfigShapeSchema.safeParse(value);

  if (result.success) {
    return [];
  }

  return result.error.issues.map((issue) =>
    formatLiminaConfigShapeIssue(value, issue),
  );
}

export function validateLiminaConfig(config: LiminaConfig): void {
  const problems = collectLiminaConfigShapeProblems(config);

  if (problems.length > 0) {
    throw new Error(problems.join('\n\n'));
  }
}
