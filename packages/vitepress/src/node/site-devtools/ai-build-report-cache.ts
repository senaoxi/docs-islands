import type {
  SiteDevToolsAnalysisBuildReportCacheStrategy,
  SiteDevToolsAnalysisBuildReportsConfig,
} from '#dep-types/utils';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import { basename, dirname, isAbsolute, join, resolve } from 'pathe';
import {
  sanitizeSiteDevToolsAiBuildReport,
  sanitizeSiteDevToolsAiText,
  type SiteDevToolsAiAnalysisTarget,
  type SiteDevToolsAiBuildReport,
  type SiteDevToolsAiProvider,
  type SiteDevToolsAiSanitizeOptions,
} from '../../shared/site-devtools-ai';
import { PAGE_METAFILE_ASSET_DIR } from '../constants/framework-build/page-metafile';
import type { SiteDevToolsAiConfig } from './ai-server';

const SITE_DEVTOOLS_AI_BUILD_REPORTS_DIR = join(PAGE_METAFILE_ASSET_DIR, 'ai');
const SITE_DEVTOOLS_AI_BUILD_REPORT_HASHED_FILE_SEGMENT_RE =
  /(?<=\b[\w%+@-]+\.)[\w-]{6,}(?=\.(?:lean\.)?(?:js|css|svg|json|mjs|cjs|woff2?|webp|png|jpe?g|gif|ico|txt|map)\b)/g;
const SITE_DEVTOOLS_AI_BUILD_REPORT_PROMPT_DIFF_LIMIT = 3;
const SITE_DEVTOOLS_AI_BUILD_REPORTS_DEFAULT_CACHE_DIR =
  '.vitepress/cache/site-devtools-reports';
const LATEST_CLAUDE_ANTHROPIC_VERSION = '2023-06-01';
const DEFAULT_CLAUDE_BASE_URL = 'https://api.anthropic.com/v1';
const DEFAULT_CLAUDE_MAX_TOKENS = 4096;

export interface BuildReportCacheConfig {
  dir: string;
  strategy: SiteDevToolsAnalysisBuildReportCacheStrategy;
}

export type BuildReportProviderConfigSnapshot = Record<
  string,
  boolean | number | string | null
> | null;

export interface BuildReportCacheIdentity {
  promptHash: string;
  provider: SiteDevToolsAiProvider;
  providerConfig: BuildReportProviderConfigSnapshot;
}

export interface StoredBuildReportCacheEntry {
  cacheIdentity?: BuildReportCacheIdentity | null;
  cacheKey: string | null;
  report: SiteDevToolsAiBuildReport;
}

export type BuildReportCacheInput =
  SiteDevToolsAnalysisBuildReportsConfig['cache'];

type SiteDevToolsAnalysisDoubaoRuntimeProviderConfig = NonNullable<
  NonNullable<NonNullable<SiteDevToolsAiConfig>['providers']>['doubao']
>[number];
type SiteDevToolsAnalysisClaudeRuntimeProviderConfig = NonNullable<
  NonNullable<NonNullable<SiteDevToolsAiConfig>['providers']>['claude']
>[number];
type SiteDevToolsAnalysisRuntimeProviderConfig =
  | SiteDevToolsAnalysisClaudeRuntimeProviderConfig
  | SiteDevToolsAnalysisDoubaoRuntimeProviderConfig;

const sanitizeFileStem = (value: string) =>
  value.replaceAll(/[^\w.-]/g, '_') || 'artifact';

const resolveDefaultBuildReportCacheDir = ({
  cacheDir,
  root,
}: {
  cacheDir: string;
  root?: string;
}) =>
  root
    ? resolve(root, SITE_DEVTOOLS_AI_BUILD_REPORTS_DEFAULT_CACHE_DIR)
    : join(cacheDir, 'site-devtools-reports');

export const resolveBuildReportCacheConfig = ({
  cache,
  cacheDir,
  root,
}: {
  cache: BuildReportCacheInput | undefined;
  cacheDir: string;
  root?: string;
}): BuildReportCacheConfig | null => {
  if (cache === false) {
    return null;
  }

  const defaultCacheDir = resolveDefaultBuildReportCacheDir({ cacheDir, root });
  const cacheOptions =
    typeof cache === 'object' && cache !== null ? cache : undefined;

  const configuredDir = cacheOptions?.dir?.trim();

  return {
    dir: configuredDir
      ? isAbsolute(configuredDir)
        ? configuredDir
        : resolve(root ?? process.cwd(), configuredDir)
      : defaultCacheDir,
    strategy: cacheOptions?.strategy === 'fallback' ? 'fallback' : 'exact',
  };
};

export const mergeBuildReportCacheInput = ({
  baseCache,
  overrideCache,
}: {
  baseCache: BuildReportCacheInput | undefined;
  overrideCache: BuildReportCacheInput | undefined;
}): BuildReportCacheInput | undefined => {
  if (overrideCache === undefined) {
    return baseCache;
  }

  if (
    overrideCache === false ||
    overrideCache === true ||
    typeof overrideCache !== 'object' ||
    overrideCache === null
  ) {
    return overrideCache;
  }

  const baseCacheOptions =
    typeof baseCache === 'object' && baseCache !== null ? baseCache : undefined;

  return {
    ...baseCacheOptions,
    ...overrideCache,
  };
};

const getBuildReportPromptHash = (prompt: string) =>
  createHash('sha256').update(prompt).digest('hex');

const normalizeBuildReportPromptForCache = (prompt: string) =>
  prompt.replaceAll(
    SITE_DEVTOOLS_AI_BUILD_REPORT_HASHED_FILE_SEGMENT_RE,
    '[hash]',
  );

const truncateBuildReportPromptDiffValue = (value: string) =>
  value.length > 120 ? `${value.slice(0, 117)}...` : value;

const parseBuildReportPromptDiffLabel = (line: string) => {
  let content = line.trimStart();

  if (content.startsWith('- ')) {
    content = content.slice(2);
  } else {
    const numberedSeparatorIndex = content.indexOf('. ');

    if (numberedSeparatorIndex > 0) {
      const numberedPrefix = content.slice(0, numberedSeparatorIndex);

      if (/^\d+$/.test(numberedPrefix)) {
        content = content.slice(numberedSeparatorIndex + 2);
      }
    }
  }

  const labelSeparatorIndex = content.indexOf(': ');

  if (labelSeparatorIndex <= 0) {
    return null;
  }

  return {
    label: content.slice(0, labelSeparatorIndex).trim(),
    value: content.slice(labelSeparatorIndex + 2),
  };
};

const getBuildReportPromptDiffSummaries = ({
  cachedPrompt,
  prompt,
}: {
  cachedPrompt: string;
  prompt: string;
}) => {
  const cachedLines = cachedPrompt.split('\n');
  const currentLines = prompt.split('\n');
  const summaries: string[] = [];
  const seenLabels = new Set<string>();

  for (
    let index = 0;
    index < Math.max(cachedLines.length, currentLines.length);
    index += 1
  ) {
    const previousLine = cachedLines[index] ?? '';
    const nextLine = currentLines[index] ?? '';

    if (previousLine === nextLine) {
      continue;
    }

    const previousMatch = parseBuildReportPromptDiffLabel(previousLine);
    const nextMatch = parseBuildReportPromptDiffLabel(nextLine);

    if (previousMatch && nextMatch && previousMatch.label === nextMatch.label) {
      const { label, value: nextValue } = nextMatch;
      const { value: previousValue } = previousMatch;

      if (!seenLabels.has(label)) {
        summaries.push(
          `${label}: ${truncateBuildReportPromptDiffValue(previousValue)} -> ${truncateBuildReportPromptDiffValue(nextValue)}`,
        );
        seenLabels.add(label);
      }
    } else if (previousLine.trim() && nextLine.trim()) {
      summaries.push(
        `line ${index + 1}: ${truncateBuildReportPromptDiffValue(previousLine.trim())} -> ${truncateBuildReportPromptDiffValue(nextLine.trim())}`,
      );
    }

    if (summaries.length >= SITE_DEVTOOLS_AI_BUILD_REPORT_PROMPT_DIFF_LIMIT) {
      break;
    }
  }

  return summaries;
};

const normalizeBuildReportProviderConfigSnapshot = (
  value: unknown,
  sanitizeOptions: SiteDevToolsAiSanitizeOptions = {},
): BuildReportProviderConfigSnapshot => {
  if (value === null || value === undefined) {
    return null;
  }

  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }

  const normalizedEntries: [string, boolean | number | string | null][] = [];

  for (const [key, entryValue] of Object.entries(value)) {
    if (
      entryValue !== null &&
      typeof entryValue !== 'boolean' &&
      typeof entryValue !== 'number' &&
      typeof entryValue !== 'string'
    ) {
      return null;
    }

    normalizedEntries.push([
      key,
      typeof entryValue === 'string'
        ? sanitizeSiteDevToolsAiText(entryValue, sanitizeOptions)
        : entryValue,
    ]);
  }

  return Object.fromEntries(normalizedEntries);
};

const normalizeBuildReportCacheIdentity = (
  value: unknown,
  sanitizeOptions: SiteDevToolsAiSanitizeOptions = {},
): BuildReportCacheIdentity | null => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }

  const promptHash = (value as { promptHash?: unknown }).promptHash;
  const provider = (value as { provider?: unknown }).provider;
  const providerConfig = normalizeBuildReportProviderConfigSnapshot(
    (value as { providerConfig?: unknown }).providerConfig,
    sanitizeOptions,
  );

  if (
    typeof promptHash !== 'string' ||
    (provider !== 'claude' && provider !== 'doubao')
  ) {
    return null;
  }

  return {
    promptHash,
    provider: provider as SiteDevToolsAiProvider,
    providerConfig,
  };
};

export const createBuildReportCacheIdentity = ({
  prompt,
  provider,
  providerConfig,
}: {
  prompt: string;
  provider: SiteDevToolsAiProvider;
  providerConfig: BuildReportProviderConfigSnapshot;
}): BuildReportCacheIdentity => ({
  promptHash: getBuildReportPromptHash(
    normalizeBuildReportPromptForCache(prompt),
  ),
  provider,
  providerConfig,
});

const sanitizeBuildReportCacheIdentity = (
  cacheIdentity: BuildReportCacheIdentity | null,
  sanitizeOptions: SiteDevToolsAiSanitizeOptions = {},
): BuildReportCacheIdentity | null =>
  cacheIdentity
    ? {
        ...cacheIdentity,
        providerConfig: normalizeBuildReportProviderConfigSnapshot(
          cacheIdentity.providerConfig,
          sanitizeOptions,
        ),
      }
    : null;

const areBuildReportProviderConfigSnapshotsEqual = (
  previousValue: BuildReportProviderConfigSnapshot,
  nextValue: BuildReportProviderConfigSnapshot,
) => {
  if (previousValue === nextValue) {
    return true;
  }

  if (!previousValue || !nextValue) {
    return previousValue === nextValue;
  }

  const keys = [
    ...new Set([...Object.keys(previousValue), ...Object.keys(nextValue)]),
  ];

  return keys.every((key) => previousValue[key] === nextValue[key]);
};

const formatBuildReportCacheDiffValue = (
  value: boolean | number | string | null | undefined,
) => {
  if (value === null) {
    return 'null';
  }

  if (value === undefined) {
    return 'undefined';
  }

  return typeof value === 'string' ? JSON.stringify(value) : String(value);
};

export const getBuildReportCacheInvalidationReason = ({
  cacheIdentity,
  cachedEntry,
  prompt,
}: {
  cacheIdentity: BuildReportCacheIdentity;
  cachedEntry: StoredBuildReportCacheEntry;
  prompt: string;
}): string => {
  const reasons: string[] = [];
  const cachedIdentity = cachedEntry.cacheIdentity;

  if (!cachedIdentity) {
    return cachedEntry.cacheKey
      ? 'the existing cache entry predates structured invalidation diagnostics, and the exact cache key no longer matches'
      : 'the existing cache entry is missing exact cache-key metadata';
  }

  if (cachedIdentity.provider !== cacheIdentity.provider) {
    reasons.push(
      `provider changed (${cachedIdentity.provider} -> ${cacheIdentity.provider})`,
    );
  }

  if (cachedIdentity.promptHash !== cacheIdentity.promptHash) {
    const promptDiffSummaries = getBuildReportPromptDiffSummaries({
      cachedPrompt: cachedEntry.report.prompt,
      prompt,
    });

    reasons.push(
      promptDiffSummaries.length > 0
        ? `analysis prompt changed (${promptDiffSummaries.join('; ')})`
        : 'analysis prompt changed',
    );
  }

  if (
    !areBuildReportProviderConfigSnapshotsEqual(
      cachedIdentity.providerConfig,
      cacheIdentity.providerConfig,
    )
  ) {
    if (!cachedIdentity.providerConfig || !cacheIdentity.providerConfig) {
      reasons.push('provider snapshot changed');
    } else {
      const changedFields = [
        ...new Set([
          ...Object.keys(cachedIdentity.providerConfig),
          ...Object.keys(cacheIdentity.providerConfig),
        ]),
      ]
        .toSorted()
        .flatMap((field) => {
          const previousValue = cachedIdentity.providerConfig?.[field];
          const nextValue = cacheIdentity.providerConfig?.[field];

          return previousValue === nextValue
            ? []
            : [
                `${field}: ${formatBuildReportCacheDiffValue(previousValue)} -> ${formatBuildReportCacheDiffValue(nextValue)}`,
              ];
        });

      reasons.push(
        changedFields.length > 0
          ? `provider snapshot changed (${changedFields.join(', ')})`
          : 'provider snapshot changed',
      );
    }
  }

  return reasons.length > 0
    ? reasons.join('; ')
    : 'the exact cache key changed for an unknown reason';
};

const getClaudeProviderConfigs = (
  aiConfig: SiteDevToolsAiConfig,
): SiteDevToolsAnalysisClaudeRuntimeProviderConfig[] =>
  Array.isArray(aiConfig?.providers?.claude)
    ? aiConfig.providers.claude.filter(
        (
          providerConfig,
        ): providerConfig is SiteDevToolsAnalysisClaudeRuntimeProviderConfig =>
          Boolean(providerConfig),
      )
    : [];

const getDoubaoProviderConfigs = (
  aiConfig: SiteDevToolsAiConfig,
): SiteDevToolsAnalysisDoubaoRuntimeProviderConfig[] =>
  Array.isArray(aiConfig?.providers?.doubao)
    ? aiConfig.providers.doubao.filter(
        (
          providerConfig,
        ): providerConfig is SiteDevToolsAnalysisDoubaoRuntimeProviderConfig =>
          Boolean(providerConfig),
      )
    : [];

const getDefaultProviderConfig = <
  ProviderConfig extends SiteDevToolsAnalysisRuntimeProviderConfig,
>(
  providerConfigs: ProviderConfig[],
) =>
  providerConfigs.find((providerConfig) => providerConfig.default === true) ??
  providerConfigs[0];

const getClaudeBuildReportProviderConfigSnapshot = (
  aiConfig: SiteDevToolsAiConfig,
): BuildReportProviderConfigSnapshot => {
  const providerConfig = getDefaultProviderConfig(
    getClaudeProviderConfigs(aiConfig),
  );

  return {
    anthropicVersion: LATEST_CLAUDE_ANTHROPIC_VERSION,
    baseUrl: providerConfig?.baseUrl?.trim() || DEFAULT_CLAUDE_BASE_URL,
    maxTokens: providerConfig?.maxTokens ?? DEFAULT_CLAUDE_MAX_TOKENS,
    model: providerConfig?.model?.trim() || null,
    temperature: providerConfig?.temperature ?? null,
  };
};

const getDoubaoBuildReportProviderConfigSnapshot = (
  aiConfig: SiteDevToolsAiConfig,
): BuildReportProviderConfigSnapshot => {
  const providerConfig = getDefaultProviderConfig(
    getDoubaoProviderConfigs(aiConfig),
  );

  return {
    baseUrl: providerConfig?.baseUrl?.trim() || null,
    maxTokens: providerConfig?.maxTokens ?? null,
    model: providerConfig?.model?.trim() || null,
    thinking: providerConfig?.thinking ?? null,
    temperature: providerConfig?.temperature ?? null,
  };
};

export const getBuildReportProviderConfigSnapshot = (
  aiConfig: SiteDevToolsAiConfig,
  provider: SiteDevToolsAiProvider,
): BuildReportProviderConfigSnapshot => {
  switch (provider) {
    case 'claude': {
      return getClaudeBuildReportProviderConfigSnapshot(aiConfig);
    }
    case 'doubao': {
      return getDoubaoBuildReportProviderConfigSnapshot(aiConfig);
    }
    default: {
      return null;
    }
  }
};

export const getBuildReportCacheKey = ({
  prompt,
  provider,
  providerConfig,
}: {
  prompt: string;
  provider: SiteDevToolsAiProvider;
  providerConfig: BuildReportProviderConfigSnapshot;
}): string =>
  createHash('sha256')
    .update(
      JSON.stringify({
        prompt: normalizeBuildReportPromptForCache(prompt),
        provider,
        providerConfig,
      }),
    )
    .digest('hex');

const getBuildReportArtifactDir = (
  artifactKind: SiteDevToolsAiAnalysisTarget['artifactKind'],
) =>
  artifactKind === 'bundle-chunk'
    ? 'chunks'
    : artifactKind === 'bundle-module'
      ? 'modules'
      : 'pages';

export const getBuildReportCacheFilePath = ({
  artifactKey,
  cacheDir,
  target,
}: {
  artifactKey: string;
  cacheDir: string;
  target: SiteDevToolsAiAnalysisTarget;
}): string =>
  join(
    cacheDir,
    getBuildReportArtifactDir(target.artifactKind),
    `${sanitizeFileStem(basename(target.displayPath || target.artifactLabel))}.${createHash('sha256').update(artifactKey).digest('hex').slice(0, 8)}.json`,
  );

const normalizeBuildReportCachePayload = (
  payload: unknown,
  sanitizeOptions: SiteDevToolsAiSanitizeOptions = {},
): SiteDevToolsAiBuildReport | null => {
  if (
    !payload ||
    typeof payload !== 'object' ||
    typeof (payload as Partial<SiteDevToolsAiBuildReport>).result !==
      'string' ||
    typeof (payload as Partial<SiteDevToolsAiBuildReport>).reportId !==
      'string' ||
    typeof (payload as Partial<SiteDevToolsAiBuildReport>).reportLabel !==
      'string' ||
    typeof (payload as Partial<SiteDevToolsAiBuildReport>).prompt !==
      'string' ||
    !(
      (payload as Partial<SiteDevToolsAiBuildReport>).provider === 'claude' ||
      (payload as Partial<SiteDevToolsAiBuildReport>).provider === 'doubao'
    ) ||
    !(payload as Partial<SiteDevToolsAiBuildReport>).target
  ) {
    return null;
  }

  return sanitizeSiteDevToolsAiBuildReport(
    payload as SiteDevToolsAiBuildReport,
    sanitizeOptions,
  );
};

export const readBuildReportCacheEntry = (
  filePath: string,
  sanitizeOptions: SiteDevToolsAiSanitizeOptions = {},
): StoredBuildReportCacheEntry | null => {
  if (!fs.existsSync(filePath)) {
    return null;
  }

  try {
    const payload = JSON.parse(fs.readFileSync(filePath, 'utf8')) as
      | {
          cacheIdentity?: unknown;
          cacheKey?: string | null;
          report?: unknown;
        }
      | unknown;

    if (
      payload &&
      typeof payload === 'object' &&
      'report' in payload &&
      payload.report
    ) {
      const storedPayload = payload as {
        cacheIdentity?: unknown;
        cacheKey?: string | null;
        report: unknown;
      };
      const report = normalizeBuildReportCachePayload(
        storedPayload.report,
        sanitizeOptions,
      );

      if (!report) {
        return null;
      }

      return {
        cacheIdentity: normalizeBuildReportCacheIdentity(
          storedPayload.cacheIdentity,
          sanitizeOptions,
        ),
        cacheKey:
          typeof storedPayload.cacheKey === 'string'
            ? storedPayload.cacheKey
            : null,
        report,
      };
    }

    const report = normalizeBuildReportCachePayload(payload, sanitizeOptions);

    return report
      ? {
          cacheIdentity: null,
          cacheKey: null,
          report,
        }
      : null;
  } catch {
    return null;
  }
};

const areBuildReportCacheTargetsEqual = (
  previousTarget: SiteDevToolsAiAnalysisTarget,
  nextTarget: SiteDevToolsAiAnalysisTarget,
) => {
  if (previousTarget.artifactKind !== nextTarget.artifactKind) {
    return false;
  }

  const previousDisplayPath = previousTarget.displayPath?.trim();
  const nextDisplayPath = nextTarget.displayPath?.trim();

  if (previousDisplayPath || nextDisplayPath) {
    return previousDisplayPath === nextDisplayPath;
  }

  return previousTarget.artifactLabel === nextTarget.artifactLabel;
};

export const readBuildReportFallbackCacheEntry = ({
  cacheDir,
  currentFilePath,
  provider,
  sanitizeOptions = {},
  target,
}: {
  cacheDir: string;
  currentFilePath?: string | null;
  provider: SiteDevToolsAiProvider;
  sanitizeOptions?: SiteDevToolsAiSanitizeOptions;
  target: SiteDevToolsAiAnalysisTarget;
}): StoredBuildReportCacheEntry | null => {
  const artifactDir = join(
    cacheDir,
    getBuildReportArtifactDir(target.artifactKind),
  );

  if (!fs.existsSync(artifactDir)) {
    return null;
  }

  const safeBaseName = sanitizeFileStem(
    basename(target.displayPath || target.artifactLabel),
  );
  const candidates: {
    entry: StoredBuildReportCacheEntry;
    filePath: string;
    mtimeMs: number;
  }[] = [];

  for (const entryName of fs.readdirSync(artifactDir)) {
    if (
      !entryName.startsWith(`${safeBaseName}.`) ||
      !entryName.endsWith('.json')
    ) {
      continue;
    }

    const filePath = join(artifactDir, entryName);

    if (currentFilePath && filePath === currentFilePath) {
      continue;
    }

    const stat = fs.statSync(filePath);

    if (!stat.isFile()) {
      continue;
    }

    const entry = readBuildReportCacheEntry(filePath, sanitizeOptions);

    if (
      !entry ||
      entry.report.provider !== provider ||
      !areBuildReportCacheTargetsEqual(entry.report.target, target)
    ) {
      continue;
    }

    candidates.push({
      entry,
      filePath,
      mtimeMs: stat.mtimeMs,
    });
  }

  return (
    candidates.toSorted(
      (left, right) =>
        right.mtimeMs - left.mtimeMs ||
        right.filePath.localeCompare(left.filePath),
    )[0]?.entry ?? null
  );
};

export const writeBuildReportCacheEntry = ({
  cacheIdentity,
  filePath,
  cacheKey,
  report,
  sanitizeOptions = {},
}: {
  cacheIdentity: BuildReportCacheIdentity | null;
  filePath: string;
  cacheKey: string | null;
  report: SiteDevToolsAiBuildReport;
  sanitizeOptions?: SiteDevToolsAiSanitizeOptions;
}): void => {
  if (!fs.existsSync(dirname(filePath))) {
    fs.mkdirSync(dirname(filePath), { recursive: true });
  }

  fs.writeFileSync(
    filePath,
    `${JSON.stringify(
      {
        cacheIdentity: sanitizeBuildReportCacheIdentity(
          cacheIdentity,
          sanitizeOptions,
        ),
        cacheKey,
        report: sanitizeSiteDevToolsAiBuildReport(report, sanitizeOptions),
      } satisfies StoredBuildReportCacheEntry,
      null,
      2,
    )}\n`,
  );
};

export const sanitizeBuildReportCacheDirectory = (
  cacheDir: string,
  sanitizeOptions: SiteDevToolsAiSanitizeOptions = {},
): void => {
  if (!fs.existsSync(cacheDir)) {
    return;
  }

  const visit = (currentPath: string) => {
    const stat = fs.statSync(currentPath);

    if (stat.isDirectory()) {
      for (const entry of fs.readdirSync(currentPath)) {
        visit(join(currentPath, entry));
      }
      return;
    }

    if (!currentPath.endsWith('.json')) {
      return;
    }

    const rawContent = fs.readFileSync(currentPath, 'utf8');
    const cacheEntry = readBuildReportCacheEntry(currentPath, sanitizeOptions);

    if (!cacheEntry) {
      return;
    }

    const sanitizedContent = `${JSON.stringify(
      {
        cacheIdentity: cacheEntry.cacheIdentity ?? null,
        cacheKey: cacheEntry.cacheKey,
        report: cacheEntry.report,
      } satisfies StoredBuildReportCacheEntry,
      null,
      2,
    )}\n`;

    if (rawContent !== sanitizedContent) {
      fs.writeFileSync(currentPath, sanitizedContent);
    }
  };

  visit(cacheDir);
};

export const writeBuildReportAsset = ({
  assetsDir,
  outDir,
  provider,
  report,
  sanitizeOptions = {},
  wrapBaseUrl,
}: {
  assetsDir: string;
  outDir: string;
  provider: SiteDevToolsAiProvider;
  report: SiteDevToolsAiBuildReport;
  sanitizeOptions?: SiteDevToolsAiSanitizeOptions;
  wrapBaseUrl: (value: string) => string;
}): string => {
  const safeBaseName = sanitizeFileStem(
    basename(report.target.displayPath || report.target.artifactLabel),
  );
  const hash = createHash('sha256')
    .update(
      JSON.stringify({
        prompt: report.prompt,
        provider,
        reportId: report.reportId,
        target: report.target,
      }),
    )
    .digest('hex')
    .slice(0, 8);
  const artifactDir = getBuildReportArtifactDir(report.target.artifactKind);
  const relativeReportPath = join(
    SITE_DEVTOOLS_AI_BUILD_REPORTS_DIR,
    artifactDir,
    `${safeBaseName}.${hash}.json`,
  );
  const absoluteReportPath = join(outDir, assetsDir, relativeReportPath);

  if (!fs.existsSync(dirname(absoluteReportPath))) {
    fs.mkdirSync(dirname(absoluteReportPath), { recursive: true });
  }

  fs.writeFileSync(
    absoluteReportPath,
    JSON.stringify(
      sanitizeSiteDevToolsAiBuildReport(report, sanitizeOptions),
      null,
      2,
    ),
  );

  return wrapBaseUrl(join('/', assetsDir, relativeReportPath));
};
