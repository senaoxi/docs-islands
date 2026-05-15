import { vitepress as loggerPreset } from '@docs-islands/vitepress/logger/presets';
import { type CSSProperties, useEffect, useRef, useState } from 'react';

import './css/logging-preset-catalog.css';

type Locale = 'en' | 'zh';

interface LoggingPresetCatalogProps {
  locale?: string;
}

const presetOrder = [
  'build',
  'config',
  'hmr',
  'parser',
  'plugin',
  'resolver',
  'runtime',
  'siteDevtools',
  'transform',
] as const;

const presetAccentByName: Record<PresetName, string> = {
  build: '59 130 246',
  config: '16 185 129',
  hmr: '249 115 22',
  parser: '14 165 233',
  plugin: '236 72 153',
  resolver: '245 158 11',
  runtime: '6 182 212',
  siteDevtools: '99 102 241',
  transform: '34 197 94',
};

type PresetName = (typeof presetOrder)[number];
type VitePressLoggerRuleName = keyof typeof loggerPreset.rules & string;

interface RuleCopy {
  purpose: string;
}

interface CatalogRuleDefinition {
  group?: string;
  main?: string;
}

type CatalogRuleEntry = [string, CatalogRuleDefinition];

type PresetCopyMap = Record<
  PresetName,
  {
    purpose: string;
    scope: string;
    rules: Partial<Record<VitePressLoggerRuleName, RuleCopy>>;
  }
>;

interface LocaleCopy {
  badgeLabel: string;
  copyActionLabel: (value: string) => string;
  copyFailureLabel: string;
  copySuccessLabel: string;
  detailsTitle: string;
  groupLabel: string;
  intro: string;
  mainLabel: string;
  noMatcherLabel: string;
  presetLabel: string;
  purposeLabel: string;
  ruleCountColumnLabel: string;
  ruleCountLabel: (count: number) => string;
  ruleLabel: string;
  scopeLabel: string;
  subtitle: string;
  summaryTableTitle: string;
  summaryLabel: (presetCount: number, ruleCount: number) => string;
  title: string;
  presets: PresetCopyMap;
}

const copy: Record<Locale, LocaleCopy> = {
  en: {
    badgeLabel: 'Preset Coverage',
    copyActionLabel: (value) => `Copy ${value}`,
    copyFailureLabel: 'Copy failed',
    copySuccessLabel: 'Copied to clipboard',
    detailsTitle: 'Rule details',
    groupLabel: 'group',
    intro:
      'This catalog is organized from the current exported preset definitions. Click any preset name, rule id, or main/group matcher to copy it. The summary table gives you the preset-level map first, and each grouped detail table shows the exact default main/group matcher used by every rule.',
    mainLabel: 'main',
    noMatcherLabel: 'Not constrained',
    presetLabel: 'Preset',
    purposeLabel: 'Purpose',
    ruleCountColumnLabel: 'Rules',
    ruleCountLabel: (count) => `${count} rules`,
    ruleLabel: 'Rule',
    scopeLabel: 'Coverage',
    subtitle:
      'Read presets as grouped matcher bundles: presets describe a subsystem, while rules pin the exact built-in log stream.',
    summaryTableTitle: 'Preset summary',
    summaryLabel: (presetCount, ruleCount) =>
      `${presetCount} presets · ${ruleCount} rules`,
    title: 'Built-in logging presets and rule catalog',
    presets: {
      build: {
        purpose:
          'Build-stage logs around framework bundling, SSR output, and final integration work.',
        scope:
          'Constrained to VitePress-side build groups such as browser bundle, SSR bundle, MPA integration, shared runtime metafile, and final HTML processing.',
        rules: {
          browserBundle: {
            purpose:
              'Tracks browser-side framework bundle generation and output shaping.',
          },
          finalize: {
            purpose:
              'Tracks the final build cleanup and result consolidation stage.',
          },
          mpaIntegration: {
            purpose:
              'Tracks framework integration work when the site builds in MPA mode.',
          },
          sharedClientRuntimeMetafile: {
            purpose:
              'Tracks shared client runtime metafile collection and inspection.',
          },
          ssrBundle: {
            purpose:
              'Tracks SSR bundle generation and related build output layout.',
          },
          ssrIntegration: {
            purpose:
              'Tracks SSR integration artifacts and the build step that wires them together.',
          },
          transformHtml: {
            purpose:
              'Tracks final HTML injection and framework-specific HTML transforms.',
          },
        },
      },
      config: {
        purpose:
          'Configuration-stage logs for environment checks before the feature pipeline starts.',
        scope:
          'Currently scoped to the VitePress-side Node version validation flow.',
        rules: {
          nodeVersion: {
            purpose:
              'Tracks Node version checks and related environment guardrails.',
          },
        },
      },
      hmr: {
        purpose:
          'Development-time hot-update logs for Markdown containers and React runtime follow-up work.',
        scope:
          'Covers Markdown HMR reparse flow, React runtime preparation, SSR-only re-rendering, and the render steps that follow Vite updates.',
        rules: {
          markdownUpdate: {
            purpose:
              'Tracks Markdown file changes that trigger container script reparsing.',
          },
          reactRuntimePrepare: {
            purpose:
              'Tracks React runtime preparation work before HMR continues.',
          },
          reactSsrOnlyRender: {
            purpose:
              'Tracks SSR-only container re-rendering during development updates.',
          },
          viteAfterUpdate: {
            purpose:
              'Tracks docs-islands follow-up handling after Vite finishes an update.',
          },
          viteAfterUpdateRender: {
            purpose:
              'Tracks the render phase that runs after Vite update handling completes.',
          },
        },
      },
      parser: {
        purpose:
          'Parsing logs for Markdown pages, framework script blocks, and React-specific reference analysis.',
        scope:
          'Constrained to the parser groups that scan page structure and resolve React imports and component references.',
        rules: {
          framework: {
            purpose:
              'Tracks framework-agnostic page parsing and script block discovery.',
          },
          react: {
            purpose:
              'Tracks React-specific import resolution, component binding, and reference validation.',
          },
        },
      },
      plugin: {
        purpose:
          'Plugin-layer logs for the VitePress integration that wires rendering strategies into the site.',
        scope:
          'Currently scoped to the rendering-strategy plugin flow on the VitePress side.',
        rules: {
          renderingStrategies: {
            purpose:
              'Tracks plugin setup and runtime status for rendering strategy integration.',
          },
        },
      },
      resolver: {
        purpose:
          'Resolution logs for page and module references that are derived from VitePress context.',
        scope:
          'Currently scoped to inline page resolution on the VitePress side.',
        rules: {
          inlinePage: {
            purpose: 'Tracks inline-page lookup and resolution decisions.',
          },
        },
      },
      runtime: {
        purpose:
          'Runtime logs for browser loading, render orchestration, and part of the shared core runtime validation path.',
        scope:
          'Spans both VitePress-side runtime groups and core-side runtime validation / React manager groups.',
        rules: {
          coreReactComponentManager: {
            purpose: 'Tracks the core-side React component manager lifecycle.',
          },
          coreReactRenderStrategy: {
            purpose:
              'Tracks the core-side React render strategy resolution flow.',
          },
          reactClientLoader: {
            purpose:
              'Tracks browser-side loading of React client entry modules.',
          },
          reactComponentManager: {
            purpose:
              'Tracks the VitePress-side React component manager lifecycle.',
          },
          reactDevContentUpdated: {
            purpose:
              'Tracks the runtime response after development content updates land.',
          },
          reactDevMountFallback: {
            purpose:
              'Tracks fallback paths when development-time mount work cannot use the primary path.',
          },
          reactDevMountRender: {
            purpose:
              'Tracks the render branch used while development-time mount work runs.',
          },
          reactDevRender: {
            purpose: 'Tracks development-time React render execution.',
          },
          reactDevRuntimeLoader: {
            purpose:
              'Tracks the bootstrapping path for the development runtime loader.',
          },
          renderValidation: {
            purpose: 'Tracks core-side validation for resolved render results.',
          },
        },
      },
      siteDevtools: {
        purpose:
          'Site DevTools logs for AI services and build-report generation.',
        scope:
          'Constrained to the Site DevTools AI server and AI build report groups on the VitePress side.',
        rules: {
          aiBuildReports: {
            purpose:
              'Tracks AI build report generation, caching, and report reads.',
          },
          aiServer: {
            purpose:
              'Tracks Site DevTools AI server requests and server-side integration work.',
          },
        },
      },
      transform: {
        purpose:
          'Core-side transform logs for Markdown component processing and SSR integration.',
        scope:
          'Constrained to core transform groups for Markdown component tags, SSR container integration, and SSR CSS injection.',
        rules: {
          markdownComponentTags: {
            purpose:
              'Tracks Markdown component-tag transformation before runtime output is emitted.',
          },
          ssrContainerIntegration: {
            purpose: 'Tracks SSR container integration into page output.',
          },
          ssrCssInjection: {
            purpose:
              'Tracks CSS injection work performed during SSR-oriented transforms.',
          },
        },
      },
    },
  },
  zh: {
    badgeLabel: 'Preset 总览',
    copyActionLabel: (value) => `复制 ${value}`,
    copyFailureLabel: '复制失败',
    copySuccessLabel: '已复制到剪贴板',
    detailsTitle: 'Rule 明细',
    groupLabel: 'group',
    intro:
      '下面这份目录直接按当前导出的 preset 定义展开。你可以点击任意 preset 名、rule 名或 main/group matcher 直接复制。你会先看到一张 preset 总表，随后每个分组表会继续展开对应 rule 的主要作用、约束范围，以及默认的 main/group matcher。',
    mainLabel: 'main',
    noMatcherLabel: '未约束',
    presetLabel: 'Preset',
    purposeLabel: '主要作用',
    ruleCountColumnLabel: '规则数',
    ruleCountLabel: (count) => `${count} 条 rule`,
    ruleLabel: 'Rule',
    scopeLabel: '约束范围',
    subtitle:
      '可以把 preset 理解成按子系统打包好的 matcher 集合，而 rule 则对应到一条具体的内建日志流。',
    summaryTableTitle: 'Preset 总表',
    summaryLabel: (presetCount, ruleCount) =>
      `${presetCount} 个 preset · ${ruleCount} 条 rule`,
    title: '内建 logging preset 与 rule 目录',
    presets: {
      build: {
        purpose:
          '构建阶段里与 framework bundling、SSR 产物以及最终集成收尾相关的日志。',
        scope:
          '覆盖 browser bundle、SSR bundle、MPA 集成、shared client runtime metafile，以及最终 HTML 处理这类 VitePress 侧 build 分组。',
        rules: {
          browserBundle: {
            purpose: '用于跟踪 Browser 侧 framework bundle 的生成和产物组织。',
          },
          finalize: {
            purpose: '用于跟踪构建末尾的结果整理与收尾阶段。',
          },
          mpaIntegration: {
            purpose: '用于跟踪 MPA 模式下的 framework integration 流程。',
          },
          sharedClientRuntimeMetafile: {
            purpose: '用于跟踪共享 client runtime 的 metafile 收集与分析。',
          },
          ssrBundle: {
            purpose: '用于跟踪 SSR bundle 的生成和产物布局。',
          },
          ssrIntegration: {
            purpose: '用于跟踪 SSR 集成产物的接线与构建处理。',
          },
          transformHtml: {
            purpose: '用于跟踪最终 HTML 注入、改写与框架产物落位。',
          },
        },
      },
      config: {
        purpose: '功能流水线正式开始之前的配置解析与环境前置检查日志。',
        scope: '当前只覆盖 VitePress 侧的 Node 版本校验流程。',
        rules: {
          nodeVersion: {
            purpose: '用于跟踪 Node 版本检查与相关环境 guardrail。',
          },
        },
      },
      hmr: {
        purpose:
          '开发阶段里 Markdown 容器热更新和 React runtime 后续处理相关的日志。',
        scope:
          '覆盖 Markdown HMR 重解析、React runtime 预备、SSR-only 重渲染，以及 Vite 更新后的渲染阶段。',
        rules: {
          markdownUpdate: {
            purpose: '用于跟踪 Markdown 文件改动后，对容器脚本重新解析的流程。',
          },
          reactRuntimePrepare: {
            purpose: '用于跟踪 HMR 继续推进前的 React runtime 预备工作。',
          },
          reactSsrOnlyRender: {
            purpose: '用于跟踪开发期更新后 ssr:only 容器的重渲染。',
          },
          viteAfterUpdate: {
            purpose: '用于跟踪 Vite 完成更新后 docs-islands 的后续处理。',
          },
          viteAfterUpdateRender: {
            purpose: '用于跟踪 Vite 更新处理完成后的渲染阶段。',
          },
        },
      },
      parser: {
        purpose: 'Markdown 页面、框架脚本块以及 React 引用分析相关的解析日志。',
        scope:
          '覆盖页面结构扫描、脚本块发现，以及 React import / 组件引用解析这两类 parser 分组。',
        rules: {
          framework: {
            purpose: '用于跟踪框架无关的页面解析与脚本块发现。',
          },
          react: {
            purpose: '用于跟踪 React 专属的 import 解析、组件绑定与引用校验。',
          },
        },
      },
      plugin: {
        purpose: 'VitePress 插件层里，把渲染策略接入站点的那部分日志。',
        scope:
          '当前只覆盖 rendering-strategy plugin 在 VitePress 侧的运行流程。',
        rules: {
          renderingStrategies: {
            purpose: '用于跟踪渲染策略插件的挂载与运行状态。',
          },
        },
      },
      resolver: {
        purpose: '从 VitePress 上下文派生页面或模块引用时的解析日志。',
        scope: '当前只覆盖 inline page 解析流程。',
        rules: {
          inlinePage: {
            purpose: '用于跟踪 inline page 的定位与解析决策。',
          },
        },
      },
      runtime: {
        purpose:
          '浏览器端加载、渲染编排，以及部分共享 core 运行时校验相关的日志。',
        scope:
          '同时覆盖 VitePress 侧 runtime 分组，以及 core 侧的运行时校验 / React manager 分组。',
        rules: {
          coreReactComponentManager: {
            purpose: '用于跟踪 core 层 React component manager 的生命周期。',
          },
          coreReactRenderStrategy: {
            purpose: '用于跟踪 core 层 React render strategy 的解析流程。',
          },
          reactClientLoader: {
            purpose: '用于跟踪浏览器端 React client 入口模块的加载。',
          },
          reactComponentManager: {
            purpose:
              '用于跟踪 VitePress 层 React component manager 的生命周期。',
          },
          reactDevContentUpdated: {
            purpose: '用于跟踪开发期内容更新落地后的运行时响应。',
          },
          reactDevMountFallback: {
            purpose: '用于跟踪开发期挂载流程走向 fallback 分支时的状态。',
          },
          reactDevMountRender: {
            purpose: '用于跟踪开发期挂载阶段采用的渲染分支。',
          },
          reactDevRender: {
            purpose: '用于跟踪开发期 React 渲染执行流程。',
          },
          reactDevRuntimeLoader: {
            purpose: '用于跟踪开发期 runtime loader 的启动过程。',
          },
          renderValidation: {
            purpose: '用于跟踪 core 层对渲染结果的校验。',
          },
        },
      },
      siteDevtools: {
        purpose: 'Site DevTools 的 AI 服务与 build report 相关日志。',
        scope:
          '覆盖 VitePress 侧 Site DevTools AI server 与 AI build report 分组。',
        rules: {
          aiBuildReports: {
            purpose: '用于跟踪 AI build report 的生成、缓存与读取。',
          },
          aiServer: {
            purpose: '用于跟踪 Site DevTools AI server 请求与服务端集成状态。',
          },
        },
      },
      transform: {
        purpose: 'core 侧 Markdown 转换与 SSR 集成相关的 transform 日志。',
        scope:
          '覆盖 Markdown 组件标签转换、SSR 容器集成，以及 SSR CSS 注入这三类 core transform 分组。',
        rules: {
          markdownComponentTags: {
            purpose: '用于跟踪运行时产物输出前的 Markdown 组件标签转换。',
          },
          ssrContainerIntegration: {
            purpose: '用于跟踪 SSR 容器与页面输出的整合过程。',
          },
          ssrCssInjection: {
            purpose: '用于跟踪 SSR 相关 transform 阶段的 CSS 注入处理。',
          },
        },
      },
    },
  },
};

const normalizeLocale = (locale?: string): Locale =>
  locale === 'zh' ? 'zh' : 'en';

function getPresetRuleEntries(presetName: PresetName): CatalogRuleEntry[] {
  const configRules = loggerPreset.configs?.[presetName]?.rules ?? {};

  return Object.keys(configRules).map((ruleName) => [
    ruleName,
    loggerPreset.rules[ruleName as VitePressLoggerRuleName],
  ]) as CatalogRuleEntry[];
}

interface CopyFeedback {
  status: 'success' | 'error';
}

interface CopyableCodeProps {
  className: string;
  copyLabel: string;
  onCopy: (value: string) => void;
  value: string;
}

function joinClassNames(...classNames: (string | false | null | undefined)[]) {
  return classNames.filter(Boolean).join(' ');
}

async function writeToClipboardWithExecCommand(value: string) {
  if (typeof document === 'undefined') {
    return false;
  }

  const textarea = document.createElement('textarea');

  textarea.value = value;
  textarea.setAttribute('readonly', '');
  textarea.style.position = 'absolute';
  textarea.style.opacity = '0';
  textarea.style.pointerEvents = 'none';

  document.body.append(textarea);
  textarea.focus();
  textarea.select();
  textarea.setSelectionRange(0, textarea.value.length);

  try {
    return document.execCommand('copy');
  } catch {
    return false;
  } finally {
    textarea.remove();
  }
}

async function writeToClipboard(value: string) {
  if (globalThis.window !== undefined) {
    const clipboard = globalThis.window.navigator?.clipboard;

    if (!clipboard?.writeText) {
      return writeToClipboardWithExecCommand(value);
    }

    try {
      await clipboard.writeText(value);
      return true;
    } catch {
      // Fall back to execCommand for browsers or contexts that reject
      // navigator.clipboard even during a user-initiated click.
    }
  }

  return writeToClipboardWithExecCommand(value);
}

function CopyableCode(props: CopyableCodeProps) {
  return (
    <button
      type="button"
      className="logging-preset-catalog__copy-trigger"
      onClick={() => props.onCopy(props.value)}
      title={props.copyLabel}
      aria-label={props.copyLabel}
    >
      <code className={props.className}>{props.value}</code>
    </button>
  );
}

export default function LoggingPresetCatalog(props: LoggingPresetCatalogProps) {
  const locale = normalizeLocale(props.locale);
  const localized = copy[locale];
  const [copyFeedback, setCopyFeedback] = useState<CopyFeedback | null>(null);
  const copyFeedbackTimerRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );
  const totalRuleCount = presetOrder.reduce(
    (count, presetName) => count + getPresetRuleEntries(presetName).length,
    0,
  );

  useEffect(() => {
    if (copyFeedbackTimerRef.current) {
      clearTimeout(copyFeedbackTimerRef.current);
      copyFeedbackTimerRef.current = null;
    }

    if (copyFeedback) {
      copyFeedbackTimerRef.current = setTimeout(() => {
        setCopyFeedback(null);
        copyFeedbackTimerRef.current = null;
      }, 1800);
    }

    return () => {
      if (copyFeedbackTimerRef.current) {
        clearTimeout(copyFeedbackTimerRef.current);
        copyFeedbackTimerRef.current = null;
      }
    };
  }, [copyFeedback]);

  const handleCopy = async (value: string) => {
    const copied = await writeToClipboard(value);

    setCopyFeedback({
      status: copied ? 'success' : 'error',
    });
  };

  return (
    <section className="logging-preset-catalog">
      {copyFeedback ? (
        <div
          className={joinClassNames(
            'logging-preset-catalog__copy-toast',
            copyFeedback.status === 'error' &&
              'logging-preset-catalog__copy-toast--error',
          )}
          role="status"
          aria-live="polite"
        >
          <span
            className="logging-preset-catalog__copy-toast-icon"
            aria-hidden="true"
          >
            {copyFeedback.status === 'success' ? '✓' : '!'}
          </span>
          <span className="logging-preset-catalog__copy-toast-title">
            {copyFeedback.status === 'success'
              ? localized.copySuccessLabel
              : localized.copyFailureLabel}
          </span>
        </div>
      ) : null}

      <header className="logging-preset-catalog__hero">
        <div className="logging-preset-catalog__badge">
          {localized.badgeLabel}
        </div>
        <div className="logging-preset-catalog__hero-head">
          <div>
            <h3 className="logging-preset-catalog__title">{localized.title}</h3>
            <p className="logging-preset-catalog__subtitle">
              {localized.subtitle}
            </p>
          </div>
          <div className="logging-preset-catalog__summary">
            {localized.summaryLabel(presetOrder.length, totalRuleCount)}
          </div>
        </div>
        <p className="logging-preset-catalog__intro">{localized.intro}</p>
      </header>

      <section className="logging-preset-catalog__table-card logging-preset-catalog__table-card--summary">
        <div className="logging-preset-catalog__section-head">
          <div>
            <p className="logging-preset-catalog__section-kicker">
              {localized.presetLabel}
            </p>
            <h4 className="logging-preset-catalog__section-title">
              {localized.summaryTableTitle}
            </h4>
          </div>
        </div>
        <div className="logging-preset-catalog__table-wrap">
          <table className="logging-preset-catalog__table">
            <thead>
              <tr>
                <th className="logging-preset-catalog__cell--no-compress">
                  {localized.presetLabel}
                </th>
                <th>{localized.purposeLabel}</th>
                <th>{localized.scopeLabel}</th>
                <th className="logging-preset-catalog__cell--no-compress">
                  {localized.ruleCountColumnLabel}
                </th>
              </tr>
            </thead>
            <tbody>
              {presetOrder.map((presetName) => {
                const presetCopy = localized.presets[presetName];
                const presetReference = `vitepress/${presetName}`;
                const ruleCount = getPresetRuleEntries(presetName).length;

                return (
                  <tr key={`summary:${presetName}`}>
                    <td className="logging-preset-catalog__cell--no-compress">
                      <CopyableCode
                        value={presetReference}
                        onCopy={handleCopy}
                        copyLabel={localized.copyActionLabel(presetReference)}
                        className="logging-preset-catalog__code logging-preset-catalog__code--matcher logging-preset-catalog__code--strong"
                      />
                    </td>
                    <td>{presetCopy.purpose}</td>
                    <td>{presetCopy.scope}</td>
                    <td className="logging-preset-catalog__cell--no-compress">
                      <span className="logging-preset-catalog__count-pill">
                        {localized.ruleCountLabel(ruleCount)}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      <div className="logging-preset-catalog__stack">
        {presetOrder.map((presetName, index) => {
          const presetCopy = localized.presets[presetName];
          const presetRuleCopy = presetCopy.rules as Record<string, RuleCopy>;
          const ruleEntries = getPresetRuleEntries(presetName);
          const presetReference = `vitepress/${presetName}`;
          const mainValues = [
            ...new Set(
              ruleEntries
                .map(([, rule]) => rule.main)
                .filter((main): main is string => typeof main === 'string'),
            ),
          ];

          return (
            <section
              key={presetName}
              className="logging-preset-catalog__table-card logging-preset-catalog__table-card--detail"
              style={
                {
                  '--logging-preset-accent': presetAccentByName[presetName],
                  '--logging-preset-delay': `${index * 70}ms`,
                } as CSSProperties
              }
            >
              <div className="logging-preset-catalog__section-head">
                <div className="logging-preset-catalog__section-copy">
                  <div className="logging-preset-catalog__section-title-row">
                    <p className="logging-preset-catalog__section-kicker">
                      {localized.detailsTitle}
                    </p>
                    <span className="logging-preset-catalog__count-pill">
                      {localized.ruleCountLabel(ruleEntries.length)}
                    </span>
                  </div>
                  <h4 className="logging-preset-catalog__section-title">
                    <CopyableCode
                      value={presetReference}
                      onCopy={handleCopy}
                      copyLabel={localized.copyActionLabel(presetReference)}
                      className="logging-preset-catalog__code logging-preset-catalog__code--matcher logging-preset-catalog__code--strong"
                    />
                  </h4>
                  <p className="logging-preset-catalog__section-body">
                    {presetCopy.scope}
                  </p>
                </div>
                <div className="logging-preset-catalog__matcher-strip">
                  {mainValues.map((mainValue) => (
                    <span
                      key={`${presetName}:${mainValue}`}
                      className="logging-preset-catalog__matcher-pill"
                    >
                      <span className="logging-preset-catalog__matcher-label">
                        {localized.mainLabel}
                      </span>
                      <CopyableCode
                        value={mainValue}
                        onCopy={handleCopy}
                        copyLabel={localized.copyActionLabel(mainValue)}
                        className="logging-preset-catalog__code logging-preset-catalog__code--matcher"
                      />
                    </span>
                  ))}
                </div>
              </div>

              <div className="logging-preset-catalog__table-wrap">
                <table className="logging-preset-catalog__table logging-preset-catalog__table--detail">
                  <thead>
                    <tr>
                      <th className="logging-preset-catalog__cell--no-compress">
                        {localized.ruleLabel}
                      </th>
                      <th>{localized.purposeLabel}</th>
                      <th className="logging-preset-catalog__cell--no-compress">
                        {localized.mainLabel}
                      </th>
                      <th className="logging-preset-catalog__cell--no-compress">
                        {localized.groupLabel}
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {ruleEntries.map(([ruleName, rule]) => (
                      <tr key={`${presetName}/${ruleName}`}>
                        <td className="logging-preset-catalog__cell--no-compress">
                          <CopyableCode
                            value={`vitepress/${ruleName}`}
                            onCopy={handleCopy}
                            copyLabel={localized.copyActionLabel(
                              `vitepress/${ruleName}`,
                            )}
                            className="logging-preset-catalog__code logging-preset-catalog__code--matcher"
                          />
                        </td>
                        <td>{presetRuleCopy[ruleName]?.purpose}</td>
                        <td className="logging-preset-catalog__cell--no-compress">
                          {rule.main ? (
                            <CopyableCode
                              value={rule.main}
                              onCopy={handleCopy}
                              copyLabel={localized.copyActionLabel(rule.main)}
                              className="logging-preset-catalog__code logging-preset-catalog__code--matcher"
                            />
                          ) : (
                            <span className="logging-preset-catalog__empty">
                              {localized.noMatcherLabel}
                            </span>
                          )}
                        </td>
                        <td className="logging-preset-catalog__cell--no-compress">
                          {rule.group ? (
                            <CopyableCode
                              value={rule.group}
                              onCopy={handleCopy}
                              copyLabel={localized.copyActionLabel(rule.group)}
                              className="logging-preset-catalog__code logging-preset-catalog__code--matcher"
                            />
                          ) : (
                            <span className="logging-preset-catalog__empty">
                              {localized.noMatcherLabel}
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          );
        })}
      </div>
    </section>
  );
}
