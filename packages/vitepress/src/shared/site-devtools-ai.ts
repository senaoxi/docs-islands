import {
  basename,
  dirname,
  isAbsolute,
  normalize,
  parse,
  relative,
} from 'pathe';
import type {
  SiteDevToolsAiArtifactHeaderItem,
  SiteDevToolsAiBundleSummaryItem,
  SiteDevToolsAiChunkResourceItem,
  SiteDevToolsAiLiveContextItem,
  SiteDevToolsAiModuleItem,
  SiteDevToolsAiPageComponentItem,
  SiteDevToolsAiPageGlossaryItem,
  SiteDevToolsAiPageRenderOrderItem,
  SiteDevToolsAiPageRenderStrategyItem,
  SiteDevToolsAiPageSpaSyncComponentItem,
  SiteDevToolsAiPromptValueItem,
} from './site-devtools-ai-prompt-snapshot';

export type SiteDevToolsAiProvider = 'claude' | 'doubao';
export type SiteDevToolsAiArtifactKind = 'bundle-chunk' | 'bundle-module';
export type SiteDevToolsAiAnalysisTargetKind =
  | SiteDevToolsAiArtifactKind
  | 'page-build';

export interface SiteDevToolsAiArtifactContext {
  artifactHeaderItems?: SiteDevToolsAiArtifactHeaderItem[];
  bundleSummaryItems?: SiteDevToolsAiBundleSummaryItem[];
  chunkResourceItems?: SiteDevToolsAiChunkResourceItem[];
  componentName?: string;
  liveContextItems?: SiteDevToolsAiLiveContextItem[];
  moduleItems?: SiteDevToolsAiModuleItem[];
  pageComponentItems?: SiteDevToolsAiPageComponentItem[];
  pageGlossaryItems?: SiteDevToolsAiPageGlossaryItem[];
  pageRenderOrderItems?: SiteDevToolsAiPageRenderOrderItem[];
  pageRenderStrategyItems?: SiteDevToolsAiPageRenderStrategyItem[];
  pageSpaSyncComponentItems?: SiteDevToolsAiPageSpaSyncComponentItem[];
  pageSpaSyncSummaryItems?: SiteDevToolsAiPromptValueItem[];
  pageId?: string | null;
  renderId?: string | null;
  renderStatus?: string;
}

export interface SiteDevToolsAiAnalysisTarget {
  artifactKind: SiteDevToolsAiAnalysisTargetKind;
  artifactLabel: string;
  bytes?: number;
  content: string;
  context?: SiteDevToolsAiArtifactContext;
  displayPath: string;
  language: string;
}

export interface SiteDevToolsAiProviderCapability {
  available: boolean;
  detail: string;
  model?: string;
  provider: SiteDevToolsAiProvider;
}

export interface SiteDevToolsAiCapabilitiesResponse {
  ok: true;
  providers: Partial<
    Record<SiteDevToolsAiProvider, SiteDevToolsAiProviderCapability>
  >;
}

export interface SiteDevToolsAiAnalyzeRequest {
  provider: SiteDevToolsAiProvider;
  target: SiteDevToolsAiAnalysisTarget;
}

export interface SiteDevToolsAiAnalyzeResponse {
  detail?: string;
  error?: string;
  model?: string;
  ok: boolean;
  prompt: string;
  provider: SiteDevToolsAiProvider;
  result?: string;
}

export interface SiteDevToolsAiBuildReport {
  detail?: string;
  generatedAt: string;
  model?: string;
  prompt: string;
  provider: SiteDevToolsAiProvider;
  providerLabel?: string;
  reportId: string;
  reportLabel: string;
  result: string;
  target: SiteDevToolsAiAnalysisTarget;
}

export interface SiteDevToolsAiRequestTrace {
  artifactKind: SiteDevToolsAiAnalysisTargetKind;
  displayPath: string;
  model?: string;
  promptBytes: number;
  provider: SiteDevToolsAiProvider;
  providerRequestId: string;
  timeoutMs: number | 'infinite';
}

export interface SiteDevToolsAiSanitizeOptions {
  anchorPath?: string | null;
  anchorPaths?: (string | null | undefined)[];
}

export const SITE_DEVTOOLS_AI_PATHNAME = '__docs-islands/debug-ai';
const SITE_DEVTOOLS_AI_LANGUAGE_BY_EXTENSION: Record<string, string> = {
  cjs: 'js',
  css: 'css',
  cts: 'ts',
  html: 'html',
  js: 'js',
  json: 'json',
  jsx: 'jsx',
  less: 'css',
  mjs: 'js',
  mts: 'ts',
  sass: 'scss',
  scss: 'scss',
  svg: 'svg',
  ts: 'ts',
  tsx: 'tsx',
  vue: 'vue',
  xml: 'xml',
  yml: 'yaml',
  yaml: 'yaml',
};
const SITE_DEVTOOLS_AI_LOCAL_PATH_ROOT_NAMES = new Set([
  'Users',
  'Volumes',
  'home',
  'private',
  'tmp',
  'var',
]);
const SITE_DEVTOOLS_AI_PROMPT_PATH_ROOT_NAMES = new Set([
  '.vitepress',
  'docs',
  'node_modules',
  'packages',
  'playground',
  'public',
  'scripts',
  'src',
  'test',
  'tests',
  'utils',
]);
const SITE_DEVTOOLS_AI_EMBEDDED_ABSOLUTE_PATH_RE =
  /\0*\/(?:Users|Volumes|home|private|tmp|var)\/[^\s"'<>`]+/g;
const SITE_DEVTOOLS_AI_EMBEDDED_PATH_LIKE_RE =
  /\0*(?:\.{1,2}\/|\/)?(?:[\w.@-]+\/)+[\w%+.@~-]+(?:\?[^\s"'<>`]+)?/g;
const SITE_DEVTOOLS_AI_TRAILING_PATH_PUNCTUATION_RE = /[!),.:;?\]}]+$/;

const stripControlCharacters = (value: string) =>
  [...value]
    .filter((character) => (character.codePointAt(0) ?? 0) >= 0x20)
    .join('');

const normalizeBase = (base = '/') => (base.endsWith('/') ? base : `${base}/`);

const formatValue = (value: number | string | null | undefined) => {
  if (value === null || value === undefined || value === '') {
    return null;
  }

  return String(value);
};

const getAnchorPathAncestors = (anchorPath: string): string[] => {
  const normalizedAnchorPath = normalize(
    stripControlCharacters(anchorPath),
  ).replace(/[#?].*$/, '');

  if (!normalizedAnchorPath || !isAbsolute(normalizedAnchorPath)) {
    return [];
  }

  const ancestors: string[] = [];
  let currentDir = dirname(normalizedAnchorPath);

  while (true) {
    ancestors.push(currentDir);
    const parentDir = dirname(currentDir);

    if (parentDir === currentDir) {
      break;
    }

    currentDir = parentDir;
  }

  return ancestors;
};

const getRelativePathFromAnchor = (
  pathCandidate: string,
  anchorPath: string,
): string | null => {
  const normalizedCandidate = normalize(pathCandidate);
  const anchorAncestors = getAnchorPathAncestors(anchorPath);

  if (anchorAncestors.length === 0) {
    return null;
  }

  if (isAbsolute(normalizedCandidate)) {
    for (const ancestorPath of anchorAncestors) {
      const relativeCandidate = relative(ancestorPath, normalizedCandidate);

      if (
        relativeCandidate === '' ||
        relativeCandidate.startsWith('..') ||
        isAbsolute(relativeCandidate)
      ) {
        continue;
      }

      const anchoredPath = `/${relativeCandidate}`;

      if (anchoredPath === normalizedCandidate) {
        continue;
      }

      return anchoredPath;
    }

    return null;
  }

  const candidateSegments = normalizedCandidate.split('/').filter(Boolean);

  if (candidateSegments.length === 0) {
    return null;
  }

  for (const ancestorPath of anchorAncestors) {
    const ancestorRoot = parse(ancestorPath).root || '/';
    const ancestorSegments = relative(ancestorRoot, ancestorPath)
      .split('/')
      .filter(Boolean);

    for (
      let overlapLength = Math.min(
        ancestorSegments.length,
        candidateSegments.length,
      );
      overlapLength > 0;
      overlapLength -= 1
    ) {
      const ancestorSuffix = ancestorSegments.slice(-overlapLength);
      const candidatePrefix = candidateSegments.slice(0, overlapLength);

      if (ancestorSuffix.join('/') !== candidatePrefix.join('/')) {
        continue;
      }

      const relativeSegments = candidateSegments.slice(overlapLength);

      if (relativeSegments.length === 0) {
        return '/';
      }

      return `/${relativeSegments.join('/')}`;
    }
  }

  return null;
};

const sanitizePromptPathValue = (
  value: string,
  options: SiteDevToolsAiSanitizeOptions = {},
): string => {
  if (!value) {
    return value;
  }

  const cleanedValue = stripControlCharacters(value);
  const suffixMatch = /([#?].*)$/.exec(cleanedValue);
  const suffix = suffixMatch?.[1] ?? '';
  const pathCandidate = suffix
    ? cleanedValue.slice(0, -suffix.length)
    : cleanedValue;
  const normalizedValue = normalize(pathCandidate);

  const anchoredPromptPath = options.anchorPath
    ? getRelativePathFromAnchor(normalizedValue, options.anchorPath)
    : null;

  if (anchoredPromptPath) {
    return `${anchoredPromptPath}${suffix}`;
  }

  for (const anchorPath of options.anchorPaths ?? []) {
    if (!anchorPath) {
      continue;
    }

    const relativePromptPath = getRelativePathFromAnchor(
      normalizedValue,
      anchorPath,
    );

    if (relativePromptPath) {
      return `${relativePromptPath}${suffix}`;
    }
  }

  if (!isAbsolute(normalizedValue)) {
    return cleanedValue;
  }

  if (normalizedValue.startsWith('//')) {
    return `${basename(normalizedValue)}${suffix}`;
  }

  const pathRoot = parse(normalizedValue).root || '/';
  const firstPathSegment = relative(pathRoot, normalizedValue)
    .split('/')
    .find(Boolean);

  if (
    !firstPathSegment ||
    !SITE_DEVTOOLS_AI_LOCAL_PATH_ROOT_NAMES.has(firstPathSegment)
  ) {
    return cleanedValue;
  }

  let currentDir = dirname(normalizedValue);
  let relativePromptPath: string | null = null;

  while (true) {
    if (SITE_DEVTOOLS_AI_PROMPT_PATH_ROOT_NAMES.has(basename(currentDir))) {
      relativePromptPath = relative(dirname(currentDir), normalizedValue);
    }

    const parentDir = dirname(currentDir);

    if (parentDir === currentDir) {
      break;
    }

    currentDir = parentDir;
  }

  return `${relativePromptPath || basename(normalizedValue)}${suffix}`;
};

export const sanitizeSiteDevToolsAiText = (
  value: string,
  options: SiteDevToolsAiSanitizeOptions = {},
): string => {
  if (!value) {
    return value;
  }

  const replacePathMatches = (input: string, matcher: RegExp) =>
    input.replaceAll(matcher, (match) => {
      const trailingPunctuation =
        SITE_DEVTOOLS_AI_TRAILING_PATH_PUNCTUATION_RE.exec(match)?.[0] ?? '';
      const matchWithoutTrailingPunctuation = trailingPunctuation
        ? match.slice(0, -trailingPunctuation.length)
        : match;

      return `${sanitizePromptPathValue(
        matchWithoutTrailingPunctuation,
        options,
      )}${trailingPunctuation}`;
    });

  return replacePathMatches(
    replacePathMatches(value, SITE_DEVTOOLS_AI_EMBEDDED_ABSOLUTE_PATH_RE),
    SITE_DEVTOOLS_AI_EMBEDDED_PATH_LIKE_RE,
  );
};

const sanitizeSiteDevToolsAiValue = <T>(
  value: T,
  options: SiteDevToolsAiSanitizeOptions = {},
): T => {
  if (typeof value === 'string') {
    return sanitizeSiteDevToolsAiText(value, options) as T;
  }

  if (Array.isArray(value)) {
    return value.map((item) => sanitizeSiteDevToolsAiValue(item, options)) as T;
  }

  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, itemValue]) => [
        key,
        sanitizeSiteDevToolsAiValue(itemValue, options),
      ]),
    ) as T;
  }

  return value;
};

export const sanitizeSiteDevToolsAiAnalysisTarget = (
  target: SiteDevToolsAiAnalysisTarget,
  options: SiteDevToolsAiSanitizeOptions = {},
): SiteDevToolsAiAnalysisTarget => sanitizeSiteDevToolsAiValue(target, options);

export const sanitizeSiteDevToolsAiBuildReport = (
  report: SiteDevToolsAiBuildReport,
  options: SiteDevToolsAiSanitizeOptions = {},
): SiteDevToolsAiBuildReport => sanitizeSiteDevToolsAiValue(report, options);

const getSiteDevToolsAiArtifactPanelLabel = (
  artifactKind: SiteDevToolsAiAnalysisTargetKind,
) => {
  switch (artifactKind) {
    case 'bundle-chunk': {
      return 'Chunk Resource';
    }
    case 'bundle-module': {
      return 'Module Source';
    }
    case 'page-build': {
      return 'Page Build';
    }
    default: {
      return artifactKind;
    }
  }
};

const getSiteDevToolsAiArtifactChecklist = (
  artifactKind: SiteDevToolsAiAnalysisTargetKind,
): string[] =>
  artifactKind === 'bundle-chunk'
    ? [
        '- Identify the selected chunk resource type, size, and role inside the component bundle.',
        '- Use Bundle Summary and Chunk Resources to judge whether this file is unusually large, dominant, or well-balanced.',
        '- Use Module Source rows to see whether the chunk is driven by a few heavy modules, generated helpers, framework runtime pieces, or a broad mix of modules.',
        '- Comment on whether the selected chunk looks like an entry-like file, a shared/runtime chunk, a style chunk, or an auxiliary asset, based only on visible labels and paths.',
        '- Suggest split, lazy-load, dedupe, or extraction ideas only when the visible chunk/module distribution supports them.',
      ]
    : artifactKind === 'bundle-module'
      ? [
          '- Identify what role the selected module likely plays inside its parent chunk, using the module row, artifact panel, and surrounding chunk context.',
          '- Use rendered size and share to judge whether this module is a meaningful contributor or just a small supporting dependency.',
          '- Interpret the source state carefully: distinguish source available, source unavailable, and generated virtual module.',
          '- Use the source-size delta, when available, to comment on transform overhead or whether the rendered output looks materially larger or smaller than the source.',
          '- Explain why this module is likely present in the chunk without inventing importer chains or implementation details that are not shown.',
          '- Suggest module-level follow-ups such as dedupe, tree-shaking, code-splitting, or source-asset cleanup only when the visible evidence points there.',
        ]
      : [
          '- Identify which React components render on the current page, which directives they use, and how those directives change runtime behavior.',
          '- Use the page bundle summary, top page resources, and top page modules to explain the dominant build costs on this page.',
          '- Interpret component composition according to the included detail level: component-only, component -> chunks, component -> modules, or component -> chunks -> modules.',
          '- Explain which render instances enable `spa:sync-render`, what side effects they introduce, and which page artifact receives the embedded HTML payload.',
          '- Use the render-order section to comment on whether critical components are paying synchronous SPA route-transition costs.',
          '- Suggest page-level follow-ups only when the page snapshot supports them, and call out what still requires drilling into a chunk or module report.',
        ];

const formatPromptValueItems = (
  items: SiteDevToolsAiPromptValueItem[] = [],
  options: SiteDevToolsAiSanitizeOptions = {},
): string[] =>
  items
    .map((item) => {
      const label = formatValue(item.label);
      const value = formatValue(item.value);
      const displayValue = value
        ? sanitizePromptPathValue(value, options)
        : value;

      return label && displayValue ? `- ${label}: ${displayValue}` : null;
    })
    .filter((line): line is string => Boolean(line));

const formatChunkResourceItems = (
  items: SiteDevToolsAiChunkResourceItem[] = [],
  options: SiteDevToolsAiSanitizeOptions = {},
): string[] =>
  items.map((item, index) => {
    const detailLines = [
      `   path: ${sanitizePromptPathValue(item.file, options)}`,
      `   type: ${item.type.toUpperCase()}`,
      `   size: ${item.size}`,
      ...(item.share ? [`   share: ${item.share}`] : []),
      `   source modules: ${item.moduleCount}`,
      ...(item.current ? ['   focus: current artifact'] : []),
    ];

    return [
      `${index + 1}. ${sanitizePromptPathValue(item.label, options)}`,
      ...detailLines,
    ].join('\n');
  });

const formatModuleItems = (
  items: SiteDevToolsAiModuleItem[] = [],
  options: SiteDevToolsAiSanitizeOptions = {},
): string[] =>
  items.map((item, index) => {
    const statusLabels = [item.current ? 'current selection' : null].filter(
      Boolean,
    );
    const detailLines = [
      `   module id: ${sanitizePromptPathValue(item.id, options)}`,
      `   rendered size: ${item.renderedSize}`,
      ...(item.isVirtual
        ? []
        : [
            ...(item.share ? [`   share: ${item.share}`] : []),
            `   source: ${item.sourceInfo}`,
            ...(item.sizeDelta ? [`   delta: ${item.sizeDelta}`] : []),
          ]),
      ...(statusLabels.length > 0
        ? [`   status: ${statusLabels.join(' · ')}`]
        : []),
    ];

    return [
      `${index + 1}. ${sanitizePromptPathValue(item.label, options)}`,
      ...detailLines,
    ].join('\n');
  });

const DEFAULT_PAGE_GLOSSARY_ITEMS: SiteDevToolsAiPageGlossaryItem[] = [
  {
    label: 'Share',
    value: 'Rendered-byte share within the current visible list.',
  },
  {
    label: 'Source',
    value:
      'Resolved source or source-asset size when the original file is available.',
  },
  {
    label: 'Delta',
    value: 'Rendered-size change relative to the resolved source size.',
  },
];

const DEFAULT_PAGE_RENDER_STRATEGY_ITEMS: SiteDevToolsAiPageRenderStrategyItem[] =
  [
    {
      description:
        'Build-time pre-render only. The component keeps SSR HTML, but the component itself does not hydrate on the client.',
      directive: 'ssr:only',
      impactItems: [
        'Usually best for static content, SEO, and avoiding client JavaScript for the component itself.',
        '`spa:sync-render` is enabled by default unless explicitly disabled.',
        'No client-side interactivity is restored after navigation.',
      ],
    },
    {
      description:
        'Build-time pre-render plus eager client hydration after the page runtime is ready.',
      directive: 'client:load',
      impactItems: [
        'Useful for components that should become interactive immediately.',
        'Adds early JavaScript execution and hydration cost during page load or SPA navigation.',
        '`spa:sync-render` is opt-in and can reduce flicker during SPA route transitions at the cost of synchronous work.',
      ],
    },
    {
      description:
        'Build-time pre-render plus deferred hydration when the component becomes visible in the viewport.',
      directive: 'client:visible',
      impactItems: [
        'Reduces initial hydration pressure for below-the-fold components.',
        'Interactivity is delayed until the component becomes visible.',
        '`spa:sync-render` is opt-in and only affects the pre-rendered HTML insertion path, not the later visibility-triggered hydration.',
      ],
    },
    {
      description: 'Skip build-time SSR HTML and render only in the browser.',
      directive: 'client:only',
      impactItems: [
        'No SSR HTML means weaker first-render content, SEO, and route-transition stability.',
        'Useful when the component depends on browser-only APIs or should avoid server rendering.',
        '`spa:sync-render` is not supported for `client:only` renders.',
      ],
    },
  ];

const indentPromptBlock = (value: string, prefix = '   ') =>
  value.split('\n').map((line) => `${prefix}${line}`);

const formatDirectiveTokens = (directives: string[]) =>
  directives.length > 0
    ? directives.map((directive) => `\`${directive}\``).join(', ')
    : 'n/a';

const formatPageComponentChunkItems = (
  items: NonNullable<
    SiteDevToolsAiArtifactContext['pageComponentItems']
  >[number]['chunkItems'] = [],
  options: SiteDevToolsAiSanitizeOptions = {},
) =>
  items.map((item, index) => {
    const detailLines = [
      `   path: ${sanitizePromptPathValue(item.file, options)}`,
      `   type: ${item.type.toUpperCase()}`,
      `   size: ${item.size}`,
      ...(item.share ? [`   share: ${item.share}`] : []),
      `   source modules: ${item.moduleCount}`,
    ];
    const moduleLines =
      item.modules && item.modules.length > 0
        ? [
            '   Chunk Modules:',
            ...formatModuleItems(item.modules, options).flatMap((line) =>
              indentPromptBlock(line, '      '),
            ),
          ]
        : [];

    return [
      `${index + 1}. ${sanitizePromptPathValue(item.label, options)}`,
      ...detailLines,
      ...moduleLines,
    ].join('\n');
  });

const formatPageComponentItems = (
  items: SiteDevToolsAiPageComponentItem[] = [],
  options: SiteDevToolsAiSanitizeOptions = {},
) =>
  items.map((item, index) => {
    const summaryLines = formatPromptValueItems(item.summaryItems, options);
    const detailLines = [
      ...(item.sourcePath
        ? [
            `   source path: ${sanitizePromptPathValue(item.sourcePath, options)}`,
          ]
        : []),
      `   render directives: ${formatDirectiveTokens(item.renderDirectives)}`,
      ...summaryLines.map((line) => `   ${line.slice(2)}`),
    ];
    const chunkLines =
      item.chunkItems && item.chunkItems.length > 0
        ? [
            `   Build Chunks (${item.chunkItems.length} shown):`,
            ...formatPageComponentChunkItems(item.chunkItems, options).flatMap(
              (line) => indentPromptBlock(line, '   '),
            ),
          ]
        : [];
    const moduleLines =
      item.moduleItems && item.moduleItems.length > 0
        ? [
            `   Component Modules (${item.moduleItems.length} shown):`,
            ...formatModuleItems(item.moduleItems, options).flatMap((line) =>
              indentPromptBlock(line, '   '),
            ),
          ]
        : [];

    return [
      `${index + 1}. ${sanitizePromptPathValue(item.componentName, options)}`,
      ...detailLines,
      ...chunkLines,
      ...moduleLines,
    ].join('\n');
  });

const formatPageRenderStrategyItems = (
  items: SiteDevToolsAiPageRenderStrategyItem[] = [],
  options: SiteDevToolsAiSanitizeOptions = {},
) =>
  items.map((item, index) =>
    [
      `${index + 1}. \`${item.directive}\``,
      `   description: ${sanitizePromptPathValue(item.description, options)}`,
      ...(item.impactItems.length > 0
        ? [
            '   impacts:',
            ...item.impactItems.map(
              (impact) => `   - ${sanitizePromptPathValue(impact, options)}`,
            ),
          ]
        : []),
    ].join('\n'),
  );

const formatPageSpaSyncComponentItems = (
  items: SiteDevToolsAiPageSpaSyncComponentItem[] = [],
  options: SiteDevToolsAiSanitizeOptions = {},
) =>
  items.map((item, index) => {
    const summaryLines = formatPromptValueItems(item.summaryItems, options);

    return [
      `${index + 1}. ${sanitizePromptPathValue(item.componentName, options)}`,
      `   render ids: ${item.renderIds.join(', ') || 'n/a'}`,
      `   render directives: ${formatDirectiveTokens(item.renderDirectives)}`,
      ...summaryLines.map((line) => `   ${line.slice(2)}`),
    ].join('\n');
  });

const formatPageRenderOrderItems = (
  items: SiteDevToolsAiPageRenderOrderItem[] = [],
  options: SiteDevToolsAiSanitizeOptions = {},
) =>
  items.map((item) => {
    const summaryLines = formatPromptValueItems(item.summaryItems, options);

    return [
      `${item.sequence}. ${sanitizePromptPathValue(item.componentName, options)}`,
      `   render id: ${sanitizePromptPathValue(item.renderId, options)}`,
      ...(item.sourcePath
        ? [
            `   source path: ${sanitizePromptPathValue(item.sourcePath, options)}`,
          ]
        : []),
      `   render directive: \`${item.renderDirective}\``,
      `   spa:sync-render: ${item.useSpaSyncRender ? 'Enabled' : 'Disabled'}`,
      ...summaryLines.map((line) => `   ${line.slice(2)}`),
    ].join('\n');
  });

const buildPageBuildPrompt = (
  target: SiteDevToolsAiAnalysisTarget,
  sanitizeOptions: SiteDevToolsAiSanitizeOptions = {},
): string => {
  const context = target.context ?? {};
  const pageOverviewLines = formatPromptValueItems(
    [
      {
        label: 'Panel',
        value: getSiteDevToolsAiArtifactPanelLabel(target.artifactKind),
      },
      {
        label: 'Title',
        value: target.artifactLabel,
      },
      ...(context.artifactHeaderItems ?? []),
    ],
    sanitizeOptions,
  );
  const bundleSummaryLines = formatPromptValueItems(
    context.bundleSummaryItems,
    sanitizeOptions,
  );
  const topResourceLines = formatChunkResourceItems(
    context.chunkResourceItems,
    sanitizeOptions,
  );
  const topModuleLines = formatModuleItems(
    context.moduleItems,
    sanitizeOptions,
  );
  const pageGlossaryLines = formatPromptValueItems(
    context.pageGlossaryItems ?? DEFAULT_PAGE_GLOSSARY_ITEMS,
    sanitizeOptions,
  );
  const pageComponentLines = formatPageComponentItems(
    context.pageComponentItems,
    sanitizeOptions,
  );
  const currentPageDirectiveSet = new Set([
    ...(context.pageComponentItems ?? []).flatMap(
      (item) => item.renderDirectives,
    ),
    ...(context.pageRenderOrderItems ?? []).map((item) => item.renderDirective),
  ]);
  const pageRenderStrategyLines = formatPageRenderStrategyItems(
    (
      context.pageRenderStrategyItems ?? DEFAULT_PAGE_RENDER_STRATEGY_ITEMS
    ).filter(
      (item) =>
        currentPageDirectiveSet.size === 0 ||
        currentPageDirectiveSet.has(item.directive),
    ),
    sanitizeOptions,
  );
  const pageSpaSyncSummaryLines = formatPromptValueItems(
    context.pageSpaSyncSummaryItems,
    sanitizeOptions,
  );
  const pageSpaSyncComponentLines = formatPageSpaSyncComponentItems(
    context.pageSpaSyncComponentItems,
    sanitizeOptions,
  );
  const pageRenderOrderLines = formatPageRenderOrderItems(
    context.pageRenderOrderItems,
    sanitizeOptions,
  );

  return [
    '## Task',
    'Analyze the current docs-islands / VitePress page-build snapshot for this page.',
    'Prioritize build diagnosis over descriptive inventory. Focus first on dominant page cost drivers, SPA route-transition blocking paths, and the directives that materially change current-page behavior before spending time on secondary components.',
    'Treat `includeChunks` and `includeModules` as independent switches, and do not invent details that are not shown.',
    '',
    'Analysis priorities:',
    '1. Identify the dominant deduped page-level cost drivers that are visible in the page bundle summary, top page resources, and top page modules.',
    '2. Identify the main SPA route-transition blocking path from the visible `spa:sync-render` side effects, including blocking CSS, embedded HTML, and render-order implications.',
    '3. Distinguish which directives materially affect this page now versus which directives are only present in the page inventory.',
    '4. Use component sections for local composition attribution and notable outliers, not for exhaustive repetition.',
    '5. Call out what cannot be proven from this snapshot and which additional artifact view would close the gap.',
    '',
    'Meta-rules:',
    '- Scope discipline: Always keep deduped page-level cost, per-component local composition, and `spa:sync-render` transition-side cost separate. Do not sum per-component totals to estimate page cost. A component with `Total: 0 B` or `Bundle Mode: No dedicated client component bundle emitted` can still contribute transition-side cost through `spa:sync-render` embedded HTML or blocking CSS. Page-level runtime or loader cost can appear in the page cost snapshot even when it does not appear in a component-local chunk list.',
    '- Evidence discipline: Separate observed facts from inferences. Use wording such as `visible in the snapshot`, `suggests`, or `cannot be confirmed from this snapshot` when appropriate. Keep inference confidence proportional to the evidence. Identify shared/runtime overhead only when the snapshot supports it; do not classify something as shared/runtime overhead from naming alone. For render-order implications, describe only ordering effects that are explicitly visible from the listed render order, patch sizes, and blocking CSS data.',
    '- Diagnosis discipline: Prioritize dominant drivers and blocking paths over exhaustive inventory. Do not restate the full snapshot component-by-component. Focus on the smallest set of components, chunks, modules, and directives that explains most of the page cost, transition blocking, or build interpretation.',
    '- Directive discipline: Explain only directive effects that materially affect this page now. Prioritize visible effects on deduped page cost, hydration timing, presence or absence of SSR HTML, `spa:sync-render` participation, blocking CSS, and route-transition stability. Do not fall back to generic framework explanations when the snapshot does not show a current-page consequence.',
    '- Optimization discipline: Order ideas by expected impact and confidence. Prefer a few high-signal opportunities over a long generic list. Tie every idea to visible evidence, name the component, directive, chunk, module, or `spa:sync-render` behavior it targets, and explain the expected tradeoff.',
    '',
    '## Output',
    'Respond in Markdown using these sections:',
    '- Summary',
    '- Dominant Page Cost Drivers',
    '- Rendering Strategy Breakdown',
    '- Component Composition Highlights',
    '- spa:sync-render Transition Impact',
    '- Optimization Opportunities',
    '- Evidence Gaps / Unknowns',
    '',
    'Section guidance:',
    '- Summary: Lead with the most important diagnosis. State explicitly whether page cost is concentrated in a few dominant resources/modules or spread across many smaller items, and whether SPA transition overhead is concentrated in a few `spa:sync-render` renders or broadly distributed.',
    '- Dominant Page Cost Drivers: Use the deduped page-level view first. Call out shared/runtime overhead versus component-specific payload when the snapshot supports that distinction.',
    '- Rendering Strategy Breakdown: Explain which directives materially affect current-page runtime or SPA transition behavior, and which directives are merely present.',
    '- Component Composition Highlights: Focus on the highest-impact or most diagnostic components. Keep lower-impact components brief instead of repeating every item evenly.',
    '- spa:sync-render Transition Impact: Report the exact visible fields when present: enabled component count, enabled render count, HTML patch target, total embedded HTML, blocking CSS files and total size, whether the CSS loading runtime is required, the biggest contributors to patch size, the components that add blocking CSS, and any render-order implications visible in the snapshot.',
    '- Optimization Opportunities: Order ideas by expected impact and confidence. Prefer a few high-signal opportunities over a long generic list. Tie every idea to visible evidence. For each idea, name the component, directive, chunk, module, or `spa:sync-render` behavior it targets, and explain the expected tradeoff.',
    '- Evidence Gaps / Unknowns: Categorize gaps as `Need chunk report`, `Need module report`, `Need page comparison`, or `Need directive config evidence`, and explain why that evidence is needed.',
    '',
    'Keep the analysis grounded in the visible snapshot. If evidence is missing, say exactly which additional page, chunk, module, comparison, or directive-config view would help.',
    '',
    '## Current Page Snapshot',
    '',
    'Current Page:',
    ...(pageOverviewLines.length > 0
      ? pageOverviewLines
      : ['- No page overview available.']),
    '',
    'Glossary:',
    ...pageGlossaryLines,
    '',
    'Current Page Rendered React Components:',
    ...(pageComponentLines.length > 0
      ? pageComponentLines
      : ['- No rendered React component details available.']),
    '',
    'Page Build Cost Snapshot:',
    ...(bundleSummaryLines.length > 0
      ? ['Bundle Summary:', ...bundleSummaryLines]
      : ['- No bundle summary available.']),
    ...(topResourceLines.length > 0
      ? [
          '',
          `Top Page Resources (${topResourceLines.length} shown):`,
          ...topResourceLines,
        ]
      : []),
    ...(topModuleLines.length > 0
      ? [
          '',
          `Top Page Modules (${topModuleLines.length} shown):`,
          ...topModuleLines,
        ]
      : []),
    '',
    'Current Page Rendering Strategy Context:',
    ...pageRenderStrategyLines,
    '',
    'spa:sync-render Artifact Context:',
    '- `client:only` does not support `spa:sync-render`.',
    '- `client:load` and `client:visible` only use `spa:sync-render` when explicitly enabled.',
    '- `ssr:only` defaults to `spa:sync-render` unless it is explicitly disabled.',
    '- When enabled, pre-rendered HTML is patched into the page client chunk used for SPA route transitions.',
    '- Blocking CSS required by those renders can delay the page content until the CSS is loaded.',
    ...(pageSpaSyncSummaryLines.length > 0
      ? pageSpaSyncSummaryLines.map((line) => line)
      : ['- No page-level `spa:sync-render` summary available.']),
    ...(pageSpaSyncComponentLines.length > 0
      ? [
          '',
          `spa:sync-render Components (${pageSpaSyncComponentLines.length} shown):`,
          ...pageSpaSyncComponentLines,
        ]
      : []),
    '',
    'Render Order and Side Effects:',
    ...(pageRenderOrderLines.length > 0
      ? pageRenderOrderLines
      : ['- No precise render-order metadata available.']),
  ].join('\n');
};

export const getSiteDevToolsAiProviderLabel = (
  provider: SiteDevToolsAiProvider,
): string => {
  switch (provider) {
    case 'claude': {
      return 'Claude';
    }
    case 'doubao': {
      return 'Doubao';
    }
    default: {
      return provider;
    }
  }
};

export const getSiteDevToolsAiArtifactKindLabel = (
  artifactKind: SiteDevToolsAiAnalysisTargetKind,
): string => {
  switch (artifactKind) {
    case 'bundle-chunk': {
      return 'Bundle Chunk';
    }
    case 'bundle-module': {
      return 'Bundle Module';
    }
    case 'page-build': {
      return 'Page Build';
    }
    default: {
      return artifactKind;
    }
  }
};

export const getSiteDevToolsAiEndpoint = (base = '/'): string =>
  `${normalizeBase(base)}${SITE_DEVTOOLS_AI_PATHNAME}`;

export const getSiteDevToolsAiModuleReportKey = (
  file: string,
  id: string,
): string => `${file}::${id}`;

export const inferSiteDevToolsAiLanguage = (sourcePath?: string): string => {
  if (!sourcePath) {
    return 'text';
  }

  const normalizedPath = sourcePath.replace(/[#?].*$/, '');
  const extension = normalizedPath.split('.').pop()?.toLowerCase();

  if (!extension) {
    return 'text';
  }

  return SITE_DEVTOOLS_AI_LANGUAGE_BY_EXTENSION[extension] || extension;
};

export const buildSiteDevToolsAiAnalysisPrompt = (
  target: SiteDevToolsAiAnalysisTarget,
  sanitizeOptions: SiteDevToolsAiSanitizeOptions = {},
): string => {
  if (target.artifactKind === 'page-build') {
    return buildPageBuildPrompt(target, sanitizeOptions);
  }

  const context = target.context ?? {};
  const currentDebugContextLines = [
    ['Page', context.pageId],
    ['Component', context.componentName],
    ['Render ID', context.renderId],
    ['Render status', context.renderStatus],
  ]
    .map(([label, value]) => {
      const formattedValue = formatValue(value);

      return formattedValue
        ? `- ${label}: ${sanitizePromptPathValue(formattedValue, sanitizeOptions)}`
        : null;
    })
    .filter(Boolean);
  const artifactPanelLines = formatPromptValueItems(
    [
      {
        label: 'Panel',
        value: getSiteDevToolsAiArtifactPanelLabel(target.artifactKind),
      },
      {
        label: 'Title',
        value: target.artifactLabel,
      },
      ...(context.artifactHeaderItems ?? []),
    ],
    sanitizeOptions,
  );
  const liveContextLines = formatPromptValueItems(
    context.liveContextItems,
    sanitizeOptions,
  );
  const bundleSummaryLines = formatPromptValueItems(
    context.bundleSummaryItems,
    sanitizeOptions,
  );
  const chunkResourceLines = formatChunkResourceItems(
    context.chunkResourceItems,
    sanitizeOptions,
  );
  const moduleLines = formatModuleItems(context.moduleItems, sanitizeOptions);

  return [
    '## Role',
    'You are an expert docs-islands / VitePress devtools analyst for build artifacts and render-visible performance signals.',
    '',
    '## Skills',
    '- Read devtools snapshots and explain what the selected artifact most likely represents.',
    '- Correlate the current artifact with bundle summary cards, chunk resource rows, module source rows, and visible render metrics.',
    '- Spot likely size concentration, duplication, runtime cost, or bundling tradeoffs from the available evidence.',
    '- Suggest concrete optimization follow-ups that are grounded in the snapshot rather than guessed from missing code.',
    '',
    '## Action',
    '1. Read the devtools snapshot below.',
    '2. Explain what this artifact is and why it is likely emitted.',
    '3. Identify the strongest evidence from the visible devtools data.',
    '4. Call out suspicious patterns, but also say explicitly when the snapshot looks normal.',
    '5. Suggest optimization ideas with expected impact and implementation direction.',
    '6. Separate confident conclusions from speculation.',
    '',
    '## Artifact-Specific Checklist',
    ...getSiteDevToolsAiArtifactChecklist(target.artifactKind),
    '',
    '## Constraints',
    '- Base the analysis only on the devtools information shown below.',
    '- Source content and raw code are intentionally excluded from this prompt.',
    '- Do not invent implementation details, loader behavior, or framework internals that are not supported by the snapshot.',
    '- Prefer citing specific cards, rows, and values from the snapshot instead of giving generic optimization advice.',
    '- If the evidence is insufficient, explain what remains unknown and which additional devtools view would help.',
    '',
    '## Output',
    'Respond in Markdown using these sections:',
    '- Summary',
    '- What This Artifact Contains',
    '- Potential Problems Or Tradeoffs',
    '- Optimization Ideas',
    '- Unknowns',
    '',
    'Section guidance:',
    '- Summary: Say whether the artifact looks normal, borderline, or worth attention.',
    '- What This Artifact Contains: Describe the artifact using only the snapshot data.',
    '- Potential Problems Or Tradeoffs: Focus on evidence-backed concerns, not hypothetical ones.',
    '- Optimization Ideas: Only include actions tied to evidence from the snapshot, and mention expected impact when possible.',
    '- Unknowns: Call out missing information instead of filling gaps with assumptions.',
    ...(currentDebugContextLines.length > 0 || liveContextLines.length > 0
      ? [
          '',
          '## Debug Console Snapshot',
          '',
          'Current Debug Context:',
          ...(currentDebugContextLines.length > 0
            ? currentDebugContextLines
            : ['- No current debug context available.']),
          ...(liveContextLines.length > 0
            ? ['', 'Visible Render Metrics:', ...liveContextLines]
            : []),
        ]
      : []),
    '',
    ...(currentDebugContextLines.length === 0 && liveContextLines.length === 0
      ? ['## Debug Console Snapshot', '']
      : []),
    'Artifact Panel:',
    ...artifactPanelLines,
    ...(bundleSummaryLines.length > 0
      ? ['', 'Bundle Summary:', ...bundleSummaryLines]
      : []),
    ...(chunkResourceLines.length > 0
      ? [
          '',
          `Chunk Resources (${chunkResourceLines.length} shown):`,
          ...chunkResourceLines,
        ]
      : []),
    ...(moduleLines.length > 0
      ? ['', `Module Source (${moduleLines.length} shown):`, ...moduleLines]
      : []),
  ].join('\n');
};

export type {
  SiteDevToolsAiArtifactHeaderItem,
  SiteDevToolsAiArtifactResourceType,
  SiteDevToolsAiBundleSummaryItem,
  SiteDevToolsAiChunkResourceItem,
  SiteDevToolsAiLiveContextItem,
  SiteDevToolsAiModuleItem,
  SiteDevToolsAiModuleSourceState,
  SiteDevToolsAiPageComponentChunkItem,
  SiteDevToolsAiPageComponentItem,
  SiteDevToolsAiPageGlossaryItem,
  SiteDevToolsAiPageRenderOrderItem,
  SiteDevToolsAiPageRenderStrategyItem,
  SiteDevToolsAiPageSpaSyncComponentItem,
  SiteDevToolsAiPromptBuildMetricFile,
  SiteDevToolsAiPromptBuildMetricModule,
  SiteDevToolsAiPromptValueItem,
} from './site-devtools-ai-prompt-snapshot';

export {
  createSiteDevToolsAiArtifactHeaderItems,
  createSiteDevToolsAiBundleSummaryItems,
  createSiteDevToolsAiChunkResourceItems,
  createSiteDevToolsAiModuleItems,
  createSiteDevToolsAiPageComponentModuleItems,
  createSiteDevToolsAiResolvedSourceState,
  formatSiteDevToolsAiBytes,
  formatSiteDevToolsAiPercent,
  formatSiteDevToolsAiSourceToRenderedDelta,
} from './site-devtools-ai-prompt-snapshot';
