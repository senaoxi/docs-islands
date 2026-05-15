import { createLogger as createControlledLogger } from '@docs-islands/vitepress/logger';
import { useEffect, useRef, useState } from 'react';

import './css/logger-scope-playground.css';

type Locale = 'en' | 'zh';
type ProbeStatus = 'running' | 'success' | 'error';
type ConsoleMethod = 'debug' | 'error' | 'info' | 'log' | 'warn';
type ConsoleWriter = (...args: unknown[]) => void;

interface LoggerScopePlaygroundProps {
  locale?: string;
}

interface ProbeOutcome {
  errorMessage: string | null;
  hiddenLogged: boolean;
  importPath: string;
  logLines: string[];
  status: ProbeStatus;
  visibleLogged: boolean;
  warningLine: string | null;
}

interface CopyFeedback {
  status: 'success' | 'error';
}

interface LocaleCopy {
  copyActionLabel: (value: string) => string;
  copyFailureLabel: string;
  copySuccessLabel: string;
  controlledDescription: string;
  controlledImportNote: string;
  controlledSetConfigBehavior: string;
  controlledTitle: string;
  hiddenLabel: string;
  importPathLabel: string;
  intro: string;
  kickerLabel: string;
  logLinesLabel: string;
  setConfigLabel: string;
  statusError: string;
  statusLabel: string;
  statusRunning: string;
  statusSuccess: string;
  subtitle: string;
  title: string;
  visibleLabel: string;
  warningLabel: string;
  yesLabel: string;
  noLabel: string;
}

const LOGGER_PROBE_MAIN =
  '@docs-islands/vitepress-docs/logger-scope-playground';
const CONTROLLED_VISIBLE_GROUP = 'docs.logger.injected.visible';
const CONTROLLED_HIDDEN_GROUP = 'docs.logger.injected.hidden';
const CONTROLLED_VISIBLE_MESSAGE = 'injected scope visible info';
const CONTROLLED_HIDDEN_MESSAGE = 'injected scope hidden info';
const shouldForwardCapturedConsoleOutput =
  (import.meta as ImportMeta & { env?: { DEV?: boolean } }).env?.DEV === true;

const copy: Record<Locale, LocaleCopy> = {
  en: {
    copyActionLabel: (value) => `Copy ${value}`,
    copyFailureLabel: 'Copy failed',
    copySuccessLabel: 'Copied to clipboard',
    controlledDescription:
      'This card uses the VitePress logger import inside the docs-islands build graph. The logger runtime reads the scope injected by createDocsIslands() and does not expose generic runtime configuration.',
    controlledImportNote: '@docs-islands/vitepress/logger',
    controlledSetConfigBehavior: 'Managed by createDocsIslands({ logging })',
    controlledTitle: 'Injected scope import',
    hiddenLabel: 'Hidden message emitted',
    importPathLabel: 'Import path',
    intro:
      'This playground runs a real VitePress logger probe on the page and captures its console output back into the UI. It is meant to validate the injected logger-scope behavior from inside the docs site itself.',
    kickerLabel: 'Scope validation',
    logLinesLabel: 'Captured console lines',
    setConfigLabel: 'setLoggerConfig(...) behavior',
    statusError: 'Probe failed',
    statusLabel: 'Status',
    statusRunning: 'Running probe...',
    statusSuccess: 'Probe completed',
    subtitle:
      'The VitePress import reads the current docs-islands logger scope from runtime injection and follows the active createDocsIslands({ logging }) policy.',
    title: 'Logger scope playground',
    visibleLabel: 'Visible message emitted',
    warningLabel: 'Captured warning',
    yesLabel: 'Yes',
    noLabel: 'No',
  },
  zh: {
    copyActionLabel: (value) => `复制 ${value}`,
    copyFailureLabel: '复制失败',
    copySuccessLabel: '已复制到剪贴板',
    controlledDescription:
      '这个卡片使用 docs-islands 构建图中的 VitePress logger 导入。logger runtime 会读取 createDocsIslands() 注入的 scope，不再暴露通用 runtime 配置能力。',
    controlledImportNote: '@docs-islands/vitepress/logger',
    controlledSetConfigBehavior: '由 createDocsIslands({ logging }) 管理',
    controlledTitle: '注入 scope 导入',
    hiddenLabel: '隐藏消息是否输出',
    importPathLabel: '导入路径',
    intro:
      '这个 playground 会在页面里实际运行一组 VitePress logger probe，并把对应的 console 输出回填到组件 UI，用来直接验证注入 logger scope 的行为。',
    kickerLabel: 'Scope 验证',
    logLinesLabel: '捕获到的 console 输出',
    setConfigLabel: 'setLoggerConfig(...) 行为',
    statusError: '探针运行失败',
    statusLabel: '状态',
    statusRunning: '正在运行探针...',
    statusSuccess: '探针运行完成',
    subtitle:
      'VitePress 导入会从 runtime 注入读取当前 docs-islands logger scope，并遵循当前 createDocsIslands({ logging }) 策略。',
    title: 'Logger scope playground',
    visibleLabel: '可见消息是否输出',
    warningLabel: '捕获到的 warning',
    yesLabel: '是',
    noLabel: '否',
  },
};

const getLocale = (locale?: string): Locale => (locale === 'zh' ? 'zh' : 'en');

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
      className="logger-scope-playground__copy-trigger"
      onClick={() => props.onCopy(props.value)}
      title={props.copyLabel}
      aria-label={props.copyLabel}
    >
      <code className={props.className}>{props.value}</code>
    </button>
  );
}

const formatConsoleValue = (value: unknown): string => {
  if (typeof value === 'string') {
    return value;
  }

  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
};

const captureConsole = (action: () => void): string[] => {
  const methods: readonly ConsoleMethod[] = [
    'debug',
    'error',
    'info',
    'log',
    'warn',
  ];
  const originalConsole = new Map<ConsoleMethod, Console[ConsoleMethod]>();
  const lines: string[] = [];

  for (const method of methods) {
    // eslint-disable-next-line no-console -- this docs probe intentionally captures logger console output
    const originalMethod = console[method];

    originalConsole.set(method, originalMethod);
    // eslint-disable-next-line no-console -- this docs probe intentionally captures logger console output
    console[method] = ((...args: unknown[]) => {
      lines.push(
        `[${method}] ${args.map((value) => formatConsoleValue(value)).join(' ')}`,
      );

      if (shouldForwardCapturedConsoleOutput) {
        (originalMethod as ConsoleWriter).apply(console, args);
      }
    }) as Console[ConsoleMethod];
  }

  try {
    action();
  } finally {
    for (const method of methods) {
      const originalMethod = originalConsole.get(method);

      if (originalMethod) {
        // eslint-disable-next-line no-console -- restore the original console implementation after the probe finishes
        console[method] = originalMethod;
      }
    }
  }

  return lines;
};

const findWarningLine = (lines: string[]): string | null =>
  lines.find((line) => line.includes('injected scope logger')) ?? null;

const createControlledProbe = (): ProbeOutcome => {
  const controlledLogger = createControlledLogger({
    main: LOGGER_PROBE_MAIN,
  });

  const logLines = captureConsole(() => {
    controlledLogger
      .getLoggerByGroup(CONTROLLED_VISIBLE_GROUP)
      .info(CONTROLLED_VISIBLE_MESSAGE);
    controlledLogger
      .getLoggerByGroup(CONTROLLED_HIDDEN_GROUP)
      .info(CONTROLLED_HIDDEN_MESSAGE);
  });

  return {
    errorMessage: null,
    hiddenLogged: logLines.some((line) =>
      line.includes(CONTROLLED_HIDDEN_MESSAGE),
    ),
    importPath: '@docs-islands/vitepress/logger',
    logLines,
    status: 'success',
    visibleLogged: logLines.some((line) =>
      line.includes(CONTROLLED_VISIBLE_MESSAGE),
    ),
    warningLine: findWarningLine(logLines),
  };
};

const createErrorOutcome = (
  importPath: string,
  error: unknown,
): ProbeOutcome => ({
  errorMessage: error instanceof Error ? error.message : String(error),
  hiddenLogged: false,
  importPath,
  logLines: [],
  status: 'error',
  visibleLogged: false,
  warningLine: null,
});

const formatBooleanLabel = (value: boolean, localeCopy: LocaleCopy): string =>
  value ? localeCopy.yesLabel : localeCopy.noLabel;

const getProbeStatusLabel = (
  status: ProbeStatus,
  localeCopy: LocaleCopy,
): string => {
  switch (status) {
    case 'error': {
      return localeCopy.statusError;
    }
    case 'running': {
      return localeCopy.statusRunning;
    }
    default: {
      return localeCopy.statusSuccess;
    }
  }
};

function LoggerScopePlayground({ locale }: LoggerScopePlaygroundProps) {
  const localeCopy = copy[getLocale(locale)];
  const controlledImportNote = localeCopy.controlledImportNote;
  const [copyFeedback, setCopyFeedback] = useState<CopyFeedback | null>(null);
  const copyFeedbackTimerRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );
  const [controlledOutcome, setControlledOutcome] = useState<ProbeOutcome>({
    errorMessage: null,
    hiddenLogged: false,
    importPath: controlledImportNote,
    logLines: [],
    status: 'running',
    visibleLogged: false,
    warningLine: null,
  });
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

  useEffect(() => {
    let isMounted = true;

    const runProbes = async (): Promise<void> => {
      try {
        const nextControlledOutcome = createControlledProbe();

        if (isMounted) {
          setControlledOutcome(nextControlledOutcome);
        }
      } catch (error) {
        if (isMounted) {
          setControlledOutcome(createErrorOutcome(controlledImportNote, error));
        }
      }
    };

    runProbes();

    return () => {
      isMounted = false;
    };
  }, [controlledImportNote]);

  const handleCopy = async (value: string) => {
    const copied = await writeToClipboard(value);

    setCopyFeedback({
      status: copied ? 'success' : 'error',
    });
  };

  const renderProbeCard = (
    title: string,
    description: string,
    expectedSetConfigBehavior: string,
    outcome: ProbeOutcome,
  ) => (
    <article
      className="logger-scope-playground__card"
      data-variant="controlled"
      data-status={outcome.status}
    >
      <div className="logger-scope-playground__card-head">
        <div className="logger-scope-playground__card-meta">
          <span className="logger-scope-playground__section-kicker">
            {localeCopy.kickerLabel}
          </span>
          <span
            className="logger-scope-playground__status-pill"
            data-status={outcome.status}
          >
            {getProbeStatusLabel(outcome.status, localeCopy)}
          </span>
        </div>
        <h3 className="logger-scope-playground__card-title">{title}</h3>
        <p className="logger-scope-playground__card-description">
          {description}
        </p>
        <div className="logger-scope-playground__import-block">
          <span className="logger-scope-playground__field-label">
            {localeCopy.importPathLabel}
          </span>
          <CopyableCode
            value={outcome.importPath}
            onCopy={handleCopy}
            copyLabel={localeCopy.copyActionLabel(outcome.importPath)}
            className="logger-scope-playground__code logger-scope-playground__code--matcher"
          />
        </div>
      </div>
      <dl className="logger-scope-playground__facts">
        <div className="logger-scope-playground__fact-row">
          <dt>{localeCopy.statusLabel}</dt>
          <dd>
            <span
              className="logger-scope-playground__value-pill"
              data-tone={
                outcome.status === 'error'
                  ? 'danger'
                  : outcome.status === 'running'
                    ? 'warning'
                    : 'success'
              }
            >
              {getProbeStatusLabel(outcome.status, localeCopy)}
            </span>
          </dd>
        </div>
        <div className="logger-scope-playground__fact-row">
          <dt>{localeCopy.setConfigLabel}</dt>
          <dd>
            <span
              className="logger-scope-playground__value-pill"
              data-tone="warning"
            >
              {expectedSetConfigBehavior}
            </span>
          </dd>
        </div>
        <div className="logger-scope-playground__fact-row">
          <dt>{localeCopy.visibleLabel}</dt>
          <dd>
            <span
              className="logger-scope-playground__value-pill"
              data-tone={outcome.visibleLogged ? 'success' : 'danger'}
            >
              {formatBooleanLabel(outcome.visibleLogged, localeCopy)}
            </span>
          </dd>
        </div>
        <div className="logger-scope-playground__fact-row">
          <dt>{localeCopy.hiddenLabel}</dt>
          <dd>
            <span
              className="logger-scope-playground__value-pill"
              data-tone={outcome.hiddenLogged ? 'danger' : 'success'}
            >
              {formatBooleanLabel(outcome.hiddenLogged, localeCopy)}
            </span>
          </dd>
        </div>
        <div
          className={joinClassNames(
            'logger-scope-playground__fact-row',
            outcome.warningLine && 'logger-scope-playground__fact-row--full',
          )}
        >
          <dt>{localeCopy.warningLabel}</dt>
          <dd>
            {outcome.warningLine ? (
              <CopyableCode
                value={outcome.warningLine}
                onCopy={handleCopy}
                copyLabel={localeCopy.copyActionLabel(outcome.warningLine)}
                className="logger-scope-playground__code logger-scope-playground__code--matcher logger-scope-playground__code--block"
              />
            ) : (
              <span className="logger-scope-playground__value-pill">
                {localeCopy.noLabel}
              </span>
            )}
          </dd>
        </div>
      </dl>
      {outcome.errorMessage ? (
        <p className="logger-scope-playground__error">{outcome.errorMessage}</p>
      ) : null}
      <div className="logger-scope-playground__log-panel">
        <span className="logger-scope-playground__section-kicker">
          {localeCopy.logLinesLabel}
        </span>
        <div className="logger-scope-playground__log-lines">
          {outcome.logLines.length === 0 ? (
            <div className="logger-scope-playground__log-empty">
              <span className="logger-scope-playground__value-pill">
                {localeCopy.noLabel}
              </span>
            </div>
          ) : (
            outcome.logLines.map((line) => (
              <div className="logger-scope-playground__log-line" key={line}>
                {line}
              </div>
            ))
          )}
        </div>
      </div>
    </article>
  );

  return (
    <section className="logger-scope-playground">
      {copyFeedback ? (
        <div
          className={joinClassNames(
            'logger-scope-playground__copy-toast',
            copyFeedback.status === 'error' &&
              'logger-scope-playground__copy-toast--error',
          )}
          role="status"
          aria-live="polite"
        >
          <span
            className="logger-scope-playground__copy-toast-icon"
            aria-hidden="true"
          >
            {copyFeedback.status === 'success' ? '✓' : '!'}
          </span>
          <span className="logger-scope-playground__copy-toast-title">
            {copyFeedback.status === 'success'
              ? localeCopy.copySuccessLabel
              : localeCopy.copyFailureLabel}
          </span>
        </div>
      ) : null}
      <div className="logger-scope-playground__hero">
        <span className="logger-scope-playground__badge">
          {localeCopy.kickerLabel}
        </span>
        <div className="logger-scope-playground__hero-head">
          <h2 className="logger-scope-playground__title">{localeCopy.title}</h2>
          <p className="logger-scope-playground__subtitle">
            {localeCopy.subtitle}
          </p>
          <p className="logger-scope-playground__intro">{localeCopy.intro}</p>
        </div>
      </div>
      <div className="logger-scope-playground__grid">
        {renderProbeCard(
          localeCopy.controlledTitle,
          localeCopy.controlledDescription,
          localeCopy.controlledSetConfigBehavior,
          controlledOutcome,
        )}
      </div>
    </section>
  );
}

export default LoggerScopePlayground;
