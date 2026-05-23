import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import type { ResolvedLiminaConfig } from '../config';
import { LiminaFlowReporter } from '../flow';
import { normalizePipelineStep, runPipeline } from '../pipeline';

const green = (message: string): string => `\u001B[32m${message}\u001B[0m`;

async function createConfig(): Promise<{
  cleanup: () => Promise<void>;
  config: ResolvedLiminaConfig;
}> {
  const rootDir = await mkdtemp(path.join(tmpdir(), 'limina-pipeline-'));
  const configPath = path.join(rootDir, 'limina.config.mjs');

  await writeFile(configPath, 'export default {};\n');

  return {
    cleanup: async () => {
      await rm(rootDir, {
        force: true,
        recursive: true,
      });
    },
    config: {
      configPath,
      rootDir,
    },
  };
}

function createFlow(): {
  chunks: string[];
  flow: LiminaFlowReporter;
} {
  const chunks: string[] = [];

  return {
    chunks,
    flow: new LiminaFlowReporter({
      env: {
        CI: 'true',
      },
      forceTty: false,
      output: {
        write: (message) => {
          chunks.push(message);
        },
      },
      stdout: {
        isTTY: false,
      },
    }),
  };
}

function createTtyFlow(): {
  chunks: string[];
  flow: LiminaFlowReporter;
} {
  const chunks: string[] = [];
  const stdout = {
    columns: 120,
    isTTY: true,
    write: (message: string | Uint8Array) => {
      chunks.push(
        message instanceof Uint8Array
          ? Buffer.from(message).toString()
          : message,
      );
      return true;
    },
  };

  return {
    chunks,
    flow: new LiminaFlowReporter({
      env: {},
      forceTty: true,
      stdout,
    }),
  };
}

describe('runPipeline', () => {
  it('recognizes source:check as a built-in task', () => {
    expect(normalizePipelineStep('source:check')).toEqual({
      name: 'source:check',
      type: 'task',
    });
  });

  it('passes all command steps in order', async () => {
    const fixture = await createConfig();
    const { chunks, flow } = createFlow();

    fixture.config.pipelines = {
      demo: [
        {
          args: ['-e', 'process.exit(0)'],
          command: process.execPath,
          type: 'command',
        },
        {
          args: ['-e', 'process.exit(0)'],
          command: process.execPath,
          type: 'command',
        },
      ],
    };

    try {
      await expect(runPipeline(fixture.config, 'demo', { flow })).resolves.toBe(
        true,
      );

      expect(
        chunks.some((chunk) => chunk.includes('[pass] pipeline: demo')),
      ).toBe(true);
      expect(
        chunks.filter((chunk) => chunk.includes('[pass] command:')).length,
      ).toBe(2);
    } finally {
      await fixture.cleanup();
    }
  });

  it('collapses successful interactive command output', async () => {
    const fixture = await createConfig();
    const { chunks, flow } = createTtyFlow();

    fixture.config.pipelines = {
      demo: [
        {
          args: ['-e', 'console.log("command detail")'],
          command: process.execPath,
          type: 'command',
        },
      ],
    };

    try {
      await expect(runPipeline(fixture.config, 'demo', { flow })).resolves.toBe(
        true,
      );

      expect(chunks.some((chunk) => chunk.includes('◇      command: '))).toBe(
        true,
      );
      expect(chunks.some((chunk) => chunk.includes('command detail'))).toBe(
        true,
      );
      expect(
        chunks.some((chunk) => chunk.includes('\u001B[H\u001B[2J\u001B[3J')),
      ).toBe(true);
      expect(
        chunks.some((chunk) => chunk.includes(`${green('◆')}      command: `)),
      ).toBe(true);
    } finally {
      await fixture.cleanup();
    }
  });

  it('marks the blocking step and skips remaining steps on failure', async () => {
    const fixture = await createConfig();
    const { chunks, flow } = createFlow();

    fixture.config.pipelines = {
      demo: [
        {
          args: ['-e', 'process.exit(1)'],
          command: process.execPath,
          type: 'command',
        },
        {
          args: ['-e', 'process.exit(0)'],
          command: process.execPath,
          type: 'command',
        },
      ],
    };

    try {
      await expect(runPipeline(fixture.config, 'demo', { flow })).resolves.toBe(
        false,
      );

      expect(
        chunks.some((chunk) => chunk.includes('[fail] command failed:')),
      ).toBe(true);
      expect(
        chunks.some((chunk) => chunk.includes('[fail] pipeline blocked: demo')),
      ).toBe(true);
      expect(chunks.some((chunk) => chunk.includes('[skip] skipped:'))).toBe(
        true,
      );
    } finally {
      await fixture.cleanup();
    }
  });
});
