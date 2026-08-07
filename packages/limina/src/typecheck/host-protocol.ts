import { type ChildProcess, spawn } from 'node:child_process';

export interface CheckerHostSpawnSpec {
  args: string[];
  command: string;
  cwd: string;
  env: Record<string, string | undefined>;
  shell: boolean;
  stdio: 'ignore' | 'inherit';
}

export interface CheckerHostSpawnMeasurement {
  durationMs: number;
  error?: Error;
  status: number;
}

export type CheckerHostRequest =
  | (CheckerHostSpawnSpec & {
      id: number;
      type: 'spawn';
    })
  | { id: number; type: 'cancel' }
  | { type: 'ping' };

export type CheckerHostResponse =
  | { type: 'ready' }
  | {
      durationMs: number;
      errorMessage?: string;
      id: number;
      status: number;
      type: 'result';
    };

function createAbortError(signal: AbortSignal): Error {
  if (signal.reason instanceof Error) return signal.reason;
  const error = new Error(
    signal.reason === undefined
      ? 'Checker target cancelled.'
      : String(signal.reason),
  );
  error.name = 'AbortError';
  return error;
}

export function createCancelledCheckerMeasurement(
  signal: AbortSignal,
): CheckerHostSpawnMeasurement {
  return {
    durationMs: 0,
    error: createAbortError(signal),
    status: 1,
  };
}

function isSignalAborted(signal: AbortSignal | undefined): boolean {
  return signal === undefined ? false : signal.aborted;
}

function removeAbortListener(
  signal: AbortSignal | undefined,
  listener: () => void,
): void {
  if (signal !== undefined) signal.removeEventListener('abort', listener);
}

function notifyChild(
  listener: ((child: ChildProcess) => void) | undefined,
  child: ChildProcess,
): void {
  if (listener !== undefined) listener(child);
}

function abortChild(child: ChildProcess): void {
  if (child.exitCode === null && child.signalCode === null) child.kill();
}

/**
 * Spawns one checker command and measures its lifetime from spawn until the
 * close/error event. The measurement is only accurate when the surrounding
 * event loop stays responsive while the child runs, so the checker host
 * process is the primary caller; the parent CLI process uses it directly only
 * as the degraded in-process fallback.
 */
export function spawnAndMeasure(
  spec: CheckerHostSpawnSpec,
  options: {
    onChild?: (child: ChildProcess) => void;
    signal?: AbortSignal;
  } = {},
): Promise<CheckerHostSpawnMeasurement> {
  const signal = options.signal;
  if (isSignalAborted(signal)) {
    return Promise.resolve(createCancelledCheckerMeasurement(signal!));
  }
  return new Promise((resolve) => {
    let settled = false;
    const startedAt = performance.now();
    const finalize = (measurement: CheckerHostSpawnMeasurement): void => {
      if (settled) {
        return;
      }

      settled = true;
      removeAbortListener(signal, handleAbort);
      resolve(measurement);
    };

    const child = spawn(spec.command, spec.args, {
      cwd: spec.cwd,
      env: spec.env,
      shell: spec.shell,
      stdio: spec.stdio,
    });

    notifyChild(options.onChild, child);

    const handleAbort = (): void => {
      abortChild(child);
      finalize(createCancelledCheckerMeasurement(signal!));
    };
    if (signal !== undefined) {
      signal.addEventListener('abort', handleAbort, { once: true });
    }

    child.on('error', (error) => {
      finalize({
        durationMs: performance.now() - startedAt,
        error,
        status: 1,
      });
    });

    child.on('close', (code) => {
      finalize({
        durationMs: performance.now() - startedAt,
        status: code ?? 1,
      });
    });
  });
}
