/**
 * @vitest-environment node
 */
import type { PageMetafile } from '#dep-types/page';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { PassThrough, Writable } from 'node:stream';
import { afterEach, describe, expect, it } from 'vitest';
import { createPageMetafileArtifacts } from '../../framework-build/page-metafile';
import {
  type SiteDevToolsBuildArtifactSnapshot,
  SiteDevToolsBuildDataStore,
} from '../build-data';
import {
  createSiteDevToolsBuildMcpServer,
  type SiteDevToolsBuildPageSummary,
} from '../mcp';

const tempDirectories: string[] = [];

const createTempDirectory = (prefix = 'site-devtools-build-mcp-') => {
  const directoryPath = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  tempDirectories.push(directoryPath);
  return directoryPath;
};

const writeTextFile = (filePath: string, content: string) => {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content);
};

const writeJsonFile = (filePath: string, value: unknown) => {
  writeTextFile(filePath, JSON.stringify(value, null, 2));
};

const waitForTransportFlush = async () => {
  await new Promise((resolve) => setTimeout(resolve, 0));
};

const parseFramedResponses = (output: string) => {
  let buffer = Buffer.from(output, 'utf8');
  const messages: unknown[] = [];

  while (buffer.byteLength > 0) {
    const headerEnd = buffer.indexOf('\r\n\r\n');
    expect(headerEnd).toBeGreaterThanOrEqual(0);

    const headerText = buffer.slice(0, headerEnd).toString('utf8');
    const contentLengthMatch = headerText.match(/content-length:\s*(\d+)/i);

    expect(contentLengthMatch).toBeTruthy();
    const contentLength = Number.parseInt(contentLengthMatch![1], 10);
    const messageStart = headerEnd + 4;
    const messageEnd = messageStart + contentLength;

    messages.push(
      JSON.parse(buffer.slice(messageStart, messageEnd).toString('utf8')),
    );
    buffer = buffer.slice(messageEnd);
  }

  return messages;
};

const createFixtureBuild = () => {
  const outDir = createTempDirectory();
  const assetsDir = 'assets';
  const sourceAssetFile = '/docs/assets/sources/DemoCard.tsx';
  const chunkFile = '/docs/assets/chunks/demo-card.js';
  const moduleId = '/src/components/DemoCard.tsx';
  const chunkReportFile =
    '/docs/assets/page-metafiles/ai/chunks/demo-card.report.json';
  const moduleReportFile =
    '/docs/assets/page-metafiles/ai/modules/demo-card-module.report.json';
  const pageReportFile =
    '/docs/assets/page-metafiles/ai/pages/getting-started.report.json';
  const reportId = 'doubao-demo';
  const pageReportId = 'doubao-page';
  const pageMetafiles: Record<string, PageMetafile> = {
    '/guide/getting-started': {
      buildMetrics: {
        aiReports: [
          {
            generatedAt: '2026-04-03T00:00:00.000Z',
            model: 'doubao-test-model',
            provider: 'doubao',
            reportFile: pageReportFile,
            reportId: pageReportId,
            reportLabel: 'Doubao · doubao-test-model',
          },
        ],
        components: [
          {
            aiReports: {
              chunkReports: {
                [chunkFile]: [
                  {
                    generatedAt: '2026-04-03T00:00:00.000Z',
                    model: 'doubao-test-model',
                    provider: 'doubao',
                    reportFile: chunkReportFile,
                    reportId,
                    reportLabel: 'Doubao · doubao-test-model',
                  },
                ],
              },
              moduleReports: {
                [`${chunkFile}::${moduleId}`]: [
                  {
                    generatedAt: '2026-04-03T00:00:00.000Z',
                    model: 'doubao-test-model',
                    provider: 'doubao',
                    reportFile: moduleReportFile,
                    reportId,
                    reportLabel: 'Doubao · doubao-test-model',
                  },
                ],
              },
            },
            componentName: 'DemoCard',
            entryFile: chunkFile,
            estimatedAssetBytes: 320,
            estimatedCssBytes: 120,
            estimatedJsBytes: 1560,
            estimatedTotalBytes: 2000,
            files: [
              {
                bytes: 1560,
                file: chunkFile,
                type: 'js',
              },
              {
                bytes: 120,
                file: '/docs/assets/chunks/demo-card.css',
                type: 'css',
              },
              {
                bytes: 320,
                file: '/docs/assets/images/demo-card.svg',
                type: 'asset',
              },
            ],
            framework: 'react',
            modules: [
              {
                bytes: 920,
                file: chunkFile,
                id: moduleId,
                sourceAssetFile,
              },
              {
                bytes: 320,
                file: chunkFile,
                id: '\0vite/modulepreload-polyfill',
              },
            ],
            renderDirectives: [],
            sourcePath: '/repo/src/components/DemoCard.tsx',
          },
        ],
        framework: 'react',
        loader: null,
        spaSyncEffects: null,
        ssrInject: null,
        totalEstimatedComponentBytes: 2000,
      },
      cssBundlePaths: ['/docs/assets/chunks/site.css'],
      loaderScript: '/docs/assets/loader.js',
      modulePreloads: ['/docs/assets/preload.js'],
      ssrInjectScript: '/docs/assets/ssr-inject.js',
    },
  };

  const artifacts = createPageMetafileArtifacts({
    assetsDir,
    pageMetafiles,
    wrapBaseUrl: (value) => `/docs${value}`,
  });

  for (const pageAsset of artifacts.pages) {
    writeTextFile(
      path.join(outDir, assetsDir, pageAsset.filePath),
      pageAsset.content,
    );
  }
  writeTextFile(
    path.join(outDir, assetsDir, artifacts.manifest.filePath),
    artifacts.manifest.content,
  );

  writeTextFile(
    path.join(outDir, 'assets/chunks/demo-card.js'),
    'export const DemoCard = () => "demo";',
  );
  writeTextFile(
    path.join(outDir, 'assets/sources/DemoCard.tsx'),
    'export function DemoCard() { return <div>demo</div>; }',
  );
  writeTextFile(
    path.join(outDir, 'assets/chunks/demo-card.css'),
    '.demo-card { color: red; }',
  );
  writeTextFile(path.join(outDir, 'assets/images/demo-card.svg'), '<svg />');

  writeJsonFile(
    path.join(outDir, 'assets/page-metafiles/ai/chunks/demo-card.report.json'),
    {
      generatedAt: '2026-04-03T00:00:00.000Z',
      prompt: 'chunk prompt',
      provider: 'doubao',
      reportId,
      reportLabel: 'Doubao · doubao-test-model',
      result: 'chunk analysis',
      target: {
        artifactKind: 'bundle-chunk',
        artifactLabel: 'demo-card.js',
        content: 'export const DemoCard = () => "demo";',
        displayPath: chunkFile,
        language: 'js',
      },
    },
  );
  writeJsonFile(
    path.join(
      outDir,
      'assets/page-metafiles/ai/modules/demo-card-module.report.json',
    ),
    {
      generatedAt: '2026-04-03T00:00:00.000Z',
      prompt: 'module prompt',
      provider: 'doubao',
      reportId,
      reportLabel: 'Doubao · doubao-test-model',
      result: 'module analysis',
      target: {
        artifactKind: 'bundle-module',
        artifactLabel: 'DemoCard.tsx',
        content: 'export function DemoCard() { return <div>demo</div>; }',
        displayPath: moduleId,
        language: 'tsx',
      },
    },
  );
  writeJsonFile(
    path.join(
      outDir,
      'assets/page-metafiles/ai/pages/getting-started.report.json',
    ),
    {
      generatedAt: '2026-04-03T00:00:00.000Z',
      prompt: 'page prompt',
      provider: 'doubao',
      reportId: pageReportId,
      reportLabel: 'Doubao · doubao-test-model',
      result: 'page analysis',
      target: {
        artifactKind: 'page-build',
        artifactLabel: '/guide/getting-started',
        content: 'Build overview for /guide/getting-started',
        displayPath: '/guide/getting-started',
        language: 'text',
      },
    },
  );

  return {
    outDir,
    pageReportId,
    reportId,
    chunkArtifactKey: chunkFile,
    moduleArtifactKey: `${chunkFile}::${moduleId}`,
  };
};

afterEach(() => {
  for (const directoryPath of tempDirectories.splice(0)) {
    fs.rmSync(directoryPath, {
      force: true,
      recursive: true,
    });
  }
});

describe('SiteDevToolsBuildDataStore', () => {
  it('reads build overview, pages, components, artifacts, and build reports from built outputs', () => {
    const fixture = createFixtureBuild();
    const dataStore = new SiteDevToolsBuildDataStore({
      outDir: fixture.outDir,
    });

    expect(dataStore.getBuildOverview()).toMatchObject({
      assetsDir: 'assets',
      buildId: expect.any(String),
      componentCount: 1,
      hasAiReports: true,
      pageCount: 1,
      schemaVersion: 1,
      totalBundleBytes: 2000,
    });

    expect(dataStore.listPages()).toEqual([
      expect.objectContaining<Partial<SiteDevToolsBuildPageSummary>>({
        componentCount: 1,
        hasAiReports: true,
        pageId: '/guide/getting-started',
        totalBundleBytes: 2000,
      }),
    ]);

    expect(
      dataStore.getComponent('/guide/getting-started', 'DemoCard'),
    ).toMatchObject({
      component: expect.objectContaining({
        componentName: 'DemoCard',
        estimatedTotalBytes: 2000,
      }),
      componentName: 'DemoCard',
      pageId: '/guide/getting-started',
    });

    expect(
      dataStore.getArtifact({
        artifactKind: 'bundle-chunk',
        displayPath: fixture.chunkArtifactKey,
      }),
    ).toMatchObject<Partial<SiteDevToolsBuildArtifactSnapshot>>({
      artifactKey: fixture.chunkArtifactKey,
      artifactKind: 'bundle-chunk',
      componentName: 'DemoCard',
      displayPath: fixture.chunkArtifactKey,
      pageId: '/guide/getting-started',
    });
    expect(
      dataStore.getArtifact({
        artifactKind: 'bundle-module',
        file: '/docs/assets/chunks/demo-card.js',
        moduleId: '/src/components/DemoCard.tsx',
      }),
    ).toMatchObject({
      artifactKey: fixture.moduleArtifactKey,
      artifactKind: 'bundle-module',
      componentName: 'DemoCard',
      pageId: '/guide/getting-started',
    });
    expect(
      dataStore.getArtifact({
        artifactKind: 'bundle-module',
        file: '/docs/assets/chunks/demo-card.js',
        moduleId: '/src/components/DemoCard.tsx',
      }).context.moduleItems?.[0],
    ).toMatchObject({
      current: true,
      id: '/src/components/DemoCard.tsx',
      sourceInfo: 'Source 54 B',
    });

    expect(
      dataStore.getBuildReport({
        artifactKey: fixture.chunkArtifactKey,
      }),
    ).toMatchObject({
      artifactKey: fixture.chunkArtifactKey,
      artifactKind: 'bundle-chunk',
      componentName: 'DemoCard',
      pageId: '/guide/getting-started',
      report: expect.objectContaining({
        prompt: 'chunk prompt',
        result: 'chunk analysis',
      }),
    });
    expect(
      dataStore.getBuildReport({
        reportId: fixture.pageReportId,
      }),
    ).toMatchObject({
      artifactKey: '/guide/getting-started',
      artifactKind: 'page-build',
      pageId: '/guide/getting-started',
      report: expect.objectContaining({
        prompt: 'page prompt',
        result: 'page analysis',
      }),
    });
  });

  it('throws a clear error when the page metafile manifest is missing', () => {
    const outDir = createTempDirectory();
    const dataStore = new SiteDevToolsBuildDataStore({
      outDir,
    });

    expect(() => dataStore.getBuildOverview()).toThrow(
      /No page metafile directory found/,
    );
  });
});

describe('createSiteDevToolsBuildMcpServer', () => {
  it('supports initialize, tool discovery, tool calls, resources, and predictable errors', async () => {
    const fixture = createFixtureBuild();
    const server = createSiteDevToolsBuildMcpServer({
      outDir: fixture.outDir,
    });

    expect(
      await server.handleMessage({
        id: 1,
        jsonrpc: '2.0',
        method: 'initialize',
      }),
    ).toMatchObject({
      id: 1,
      jsonrpc: '2.0',
      result: expect.objectContaining({
        protocolVersion: '2024-11-05',
      }),
    });

    const toolsListResponse = await server.handleMessage({
      id: 2,
      jsonrpc: '2.0',
      method: 'tools/list',
    });

    expect(toolsListResponse).toMatchObject({
      id: 2,
      result: {
        tools: expect.arrayContaining([
          expect.objectContaining({
            name: 'get_build_overview',
          }),
          expect.objectContaining({
            name: 'get_artifact',
          }),
          expect.objectContaining({
            name: 'get_build_report',
          }),
        ]),
      },
    });

    const overviewResponse = await server.handleMessage({
      id: 3,
      jsonrpc: '2.0',
      method: 'tools/call',
      params: {
        arguments: {},
        name: 'get_build_overview',
      },
    });
    expect(overviewResponse).toMatchObject({
      id: 3,
      result: expect.objectContaining({
        structuredContent: expect.objectContaining({
          componentCount: 1,
          pageCount: 1,
        }),
      }),
    });

    const listPagesResponse = (await server.handleMessage({
      id: 4,
      jsonrpc: '2.0',
      method: 'tools/call',
      params: {
        arguments: {},
        name: 'list_pages',
      },
    })) as {
      result: {
        structuredContent: SiteDevToolsBuildPageSummary[];
      };
    };
    expect(listPagesResponse.result.structuredContent[0]?.pageId).toBe(
      '/guide/getting-started',
    );

    const pageResponse = await server.handleMessage({
      id: 5,
      jsonrpc: '2.0',
      method: 'tools/call',
      params: {
        arguments: {
          pageId: '/guide/getting-started',
        },
        name: 'get_page',
      },
    });
    expect(pageResponse).toMatchObject({
      id: 5,
      result: expect.objectContaining({
        structuredContent: expect.objectContaining({
          summary: expect.objectContaining({
            pageId: '/guide/getting-started',
          }),
        }),
      }),
    });

    const componentResponse = await server.handleMessage({
      id: 6,
      jsonrpc: '2.0',
      method: 'tools/call',
      params: {
        arguments: {
          componentName: 'DemoCard',
          pageId: '/guide/getting-started',
        },
        name: 'get_component',
      },
    });
    expect(componentResponse).toMatchObject({
      id: 6,
      result: expect.objectContaining({
        structuredContent: expect.objectContaining({
          componentName: 'DemoCard',
        }),
      }),
    });

    const artifactResponse = await server.handleMessage({
      id: 7,
      jsonrpc: '2.0',
      method: 'tools/call',
      params: {
        arguments: {
          artifactKind: 'bundle-module',
          file: '/docs/assets/chunks/demo-card.js',
          moduleId: '/src/components/DemoCard.tsx',
        },
        name: 'get_artifact',
      },
    });
    expect(artifactResponse).toMatchObject({
      id: 7,
      result: expect.objectContaining({
        structuredContent: expect.objectContaining({
          artifactKey: fixture.moduleArtifactKey,
          artifactKind: 'bundle-module',
        }),
      }),
    });

    const ambiguousReportResponse = await server.handleMessage({
      id: 8,
      jsonrpc: '2.0',
      method: 'tools/call',
      params: {
        arguments: {
          reportId: fixture.reportId,
        },
        name: 'get_build_report',
      },
    });
    expect(ambiguousReportResponse).toMatchObject({
      id: 8,
      result: expect.objectContaining({
        isError: true,
      }),
    });

    const buildReportResponse = await server.handleMessage({
      id: 9,
      jsonrpc: '2.0',
      method: 'tools/call',
      params: {
        arguments: {
          artifactKey: fixture.chunkArtifactKey,
        },
        name: 'get_build_report',
      },
    });
    expect(buildReportResponse).toMatchObject({
      id: 9,
      result: expect.objectContaining({
        structuredContent: expect.objectContaining({
          artifactKey: fixture.chunkArtifactKey,
          report: expect.objectContaining({
            prompt: 'chunk prompt',
          }),
        }),
      }),
    });

    const resourcesListResponse = await server.handleMessage({
      id: 10,
      jsonrpc: '2.0',
      method: 'resources/list',
    });
    expect(resourcesListResponse).toMatchObject({
      id: 10,
      result: {
        resources: expect.arrayContaining([
          expect.objectContaining({
            name: 'site-devtools-build-data-overview',
          }),
        ]),
      },
    });

    const resourceReadResponse = await server.handleMessage({
      id: 11,
      jsonrpc: '2.0',
      method: 'resources/read',
      params: {
        uri: 'file://docs-islands/site-devtools-build-tool-guide.md',
      },
    });
    expect(resourceReadResponse).toMatchObject({
      id: 11,
      result: {
        contents: [
          expect.objectContaining({
            text: expect.stringContaining('Recommended exploration flow'),
          }),
        ],
      },
    });

    const invalidToolResponse = await server.handleMessage({
      id: 12,
      jsonrpc: '2.0',
      method: 'tools/call',
      params: {
        arguments: {},
        name: 'get_page',
      },
    });
    expect(invalidToolResponse).toMatchObject({
      id: 12,
      result: expect.objectContaining({
        isError: true,
      }),
    });
  });

  it('returns JSON-RPC request errors for invalid envelopes and method params', async () => {
    const fixture = createFixtureBuild();
    const server = createSiteDevToolsBuildMcpServer({
      outDir: fixture.outDir,
    });

    expect(
      await server.handleMessage({
        id: 1,
        method: 'initialize',
      }),
    ).toMatchObject({
      error: {
        code: -32_600,
        message: '"jsonrpc" must be "2.0".',
      },
      id: 1,
    });

    expect(
      await server.handleMessage({
        id: 2,
        jsonrpc: '1.0',
        method: 'initialize',
      }),
    ).toMatchObject({
      error: {
        code: -32_600,
        message: '"jsonrpc" must be "2.0".',
      },
      id: 2,
    });

    expect(
      await server.handleMessage({
        id: 3,
        jsonrpc: '2.0',
        method: 'tools/call',
        params: {
          arguments: {},
        },
      }),
    ).toMatchObject({
      error: {
        code: -32_602,
        message: '"name" must be a non-empty string.',
      },
      id: 3,
    });

    expect(
      await server.handleMessage({
        id: 4,
        jsonrpc: '2.0',
        method: 'resources/read',
        params: {},
      }),
    ).toMatchObject({
      error: {
        code: -32_602,
        message: '"uri" must be a non-empty string.',
      },
      id: 4,
    });
  });

  it('enforces tool schemas at runtime instead of treating them as documentation only', async () => {
    const fixture = createFixtureBuild();
    const server = createSiteDevToolsBuildMcpServer({
      outDir: fixture.outDir,
    });

    expect(
      await server.handleMessage({
        id: 1,
        jsonrpc: '2.0',
        method: 'tools/call',
        params: {
          arguments: {
            unexpected: true,
          },
          name: 'get_build_overview',
        },
      }),
    ).toMatchObject({
      id: 1,
      result: expect.objectContaining({
        isError: true,
        structuredContent: {
          error: 'Unknown argument: "unexpected".',
        },
      }),
    });

    expect(
      await server.handleMessage({
        id: 2,
        jsonrpc: '2.0',
        method: 'tools/call',
        params: {
          arguments: {
            artifactKind: 'bundle-module',
          },
          name: 'get_artifact',
        },
      }),
    ).toMatchObject({
      id: 2,
      result: expect.objectContaining({
        isError: true,
        structuredContent: {
          error:
            'Provide "displayPath" or both "file" and "moduleId" for "bundle-module" artifact lookups.',
        },
      }),
    });
  });

  it('recovers from malformed transport input and keeps listen lifecycle idempotent', async () => {
    const fixture = createFixtureBuild();
    const stdin = new PassThrough();
    const stdoutChunks: string[] = [];
    const stderrChunks: string[] = [];
    const stdout = new Writable({
      write(chunk, _encoding, callback) {
        stdoutChunks.push(chunk.toString());
        callback();
      },
    });
    const stderr = new Writable({
      write(chunk, _encoding, callback) {
        stderrChunks.push(chunk.toString());
        callback();
      },
    });

    const server = createSiteDevToolsBuildMcpServer({
      outDir: fixture.outDir,
      stderr,
      stdin,
      stdout,
    });

    server.listen();
    server.listen();

    stdin.write('Content-Length: nope\r\n\r\n{}');

    const pingPayload = JSON.stringify({
      id: 1,
      jsonrpc: '2.0',
      method: 'ping',
    });
    stdin.write(
      `Content-Length: ${Buffer.byteLength(pingPayload)}\r\nContent-Type: application/json\r\n\r\n${pingPayload}`,
    );

    await waitForTransportFlush();

    const responses = parseFramedResponses(stdoutChunks.join(''));

    expect(responses).toHaveLength(2);
    expect(responses[0]).toMatchObject({
      error: {
        code: -32_700,
        message: 'Parse error.',
      },
      id: null,
    });
    expect(responses[1]).toMatchObject({
      id: 1,
      jsonrpc: '2.0',
      result: {},
    });
    expect(stderrChunks.join('')).toContain(
      'Missing or invalid Content-Length header.',
    );

    server.close();
    stdoutChunks.length = 0;

    const secondPingPayload = JSON.stringify({
      id: 2,
      jsonrpc: '2.0',
      method: 'ping',
    });
    stdin.write(
      `Content-Length: ${Buffer.byteLength(secondPingPayload)}\r\n\r\n${secondPingPayload}`,
    );

    await waitForTransportFlush();
    expect(stdoutChunks).toEqual([]);
  });
});
