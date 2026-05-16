import { describe, expect, it } from 'vitest';
import {
  createSiteDevToolsAiChunkResourceItems,
  createSiteDevToolsAiModuleItems,
  createSiteDevToolsAiPageComponentModuleItems,
  createSiteDevToolsAiResolvedSourceState,
} from '../site-devtools-ai';

describe('site-devtools-ai prompt snapshot helpers', () => {
  it('formats chunk resource rows with share and module counts', () => {
    const items = createSiteDevToolsAiChunkResourceItems({
      currentFile: '/assets/demo-card.js',
      files: [
        {
          bytes: 2048,
          file: '/assets/demo-card.js',
          type: 'js',
        },
        {
          bytes: 1024,
          file: '/assets/demo-card.css',
          type: 'css',
        },
      ],
      modules: [
        {
          bytes: 900,
          file: '/assets/demo-card.js',
          id: '/src/components/DemoCard.tsx',
          sourcePath: '/src/components/DemoCard.tsx',
        },
        {
          bytes: 600,
          file: '/assets/demo-card.js',
          id: '/src/components/CardBody.tsx',
          sourcePath: '/src/components/CardBody.tsx',
        },
        {
          bytes: 300,
          file: '/assets/demo-card.css',
          id: '/src/components/DemoCard.css',
          sourcePath: '/src/components/DemoCard.css',
        },
      ],
      totalEstimatedBytes: 3072,
    });

    expect(items).toEqual([
      {
        current: true,
        file: '/assets/demo-card.js',
        label: 'demo-card.js',
        moduleCount: 2,
        share: '66.7%',
        size: '2.0 KB',
        type: 'js',
      },
      {
        file: '/assets/demo-card.css',
        label: 'demo-card.css',
        moduleCount: 1,
        share: '33.3%',
        size: '1.0 KB',
        type: 'css',
      },
    ]);
  });

  it('prioritizes the selected module at the top of the module source list', () => {
    const items = createSiteDevToolsAiModuleItems({
      currentChunkFile: '/assets/demo-card.js',
      currentModuleKey: '/assets/demo-card.js::/src/components/CardBody.tsx',
      modules: [
        {
          bytes: 900,
          file: '/assets/demo-card.js',
          id: '/src/components/DemoCard.tsx',
          sourcePath: '/src/components/DemoCard.tsx',
        },
        {
          bytes: 600,
          file: '/assets/demo-card.js',
          id: '/src/components/CardBody.tsx',
          sourcePath: '/src/components/CardBody.tsx',
        },
      ],
      resourceType: 'js',
    });

    expect(items[0]).toMatchObject({
      current: true,
      id: '/src/components/CardBody.tsx',
      label: 'CardBody.tsx',
    });
    expect(items[1]).toMatchObject({
      id: '/src/components/DemoCard.tsx',
      label: 'DemoCard.tsx',
    });
  });

  it('formats component module rows without requiring chunk grouping', () => {
    const items = createSiteDevToolsAiPageComponentModuleItems({
      modules: [
        {
          bytes: 900,
          file: '/assets/demo-card.js',
          id: '/src/components/DemoCard.tsx',
          sourcePath: '/src/components/DemoCard.tsx',
        },
        {
          bytes: 600,
          file: '/assets/demo-card.css',
          id: '/src/components/DemoCard.css',
          sourcePath: '/src/components/DemoCard.css',
        },
      ],
    });

    expect(items).toEqual([
      expect.objectContaining({
        file: '/assets/demo-card.js',
        id: '/src/components/DemoCard.tsx',
        label: 'DemoCard.tsx',
        renderedSize: '900 B',
        share: '60.0%',
      }),
      expect.objectContaining({
        file: '/assets/demo-card.css',
        id: '/src/components/DemoCard.css',
        label: 'DemoCard.css',
        renderedSize: '600 B',
        share: '40.0%',
      }),
    ]);
  });

  it('marks generated virtual modules so prompt formatters can simplify them', () => {
    const items = createSiteDevToolsAiModuleItems({
      currentChunkFile: '/assets/demo-card.js',
      modules: [
        {
          bytes: 31,
          file: '/assets/demo-card.js',
          id: '\0vite/modulepreload-polyfill',
        },
      ],
      resourceType: 'js',
    });

    expect(items).toEqual([
      expect.objectContaining({
        file: '/assets/demo-card.js',
        id: '\0vite/modulepreload-polyfill',
        isVirtual: true,
        label: 'modulepreload-polyfill',
        renderedSize: '31 B',
        share: '100.0%',
        sourceInfo: 'Source n/a',
        statusLabel: 'generated virtual module',
      }),
    ]);
  });

  it('formats generated, unavailable, and size-delta source states', () => {
    expect(
      createSiteDevToolsAiResolvedSourceState({
        isGeneratedVirtualModule: true,
        renderedBytes: 512,
        sourceAvailable: false,
      }),
    ).toEqual({
      sourceInfo: 'Source n/a',
      statusLabel: 'generated virtual module',
    });

    expect(
      createSiteDevToolsAiResolvedSourceState({
        renderedBytes: 512,
        sourceAvailable: false,
      }),
    ).toEqual({
      sourceInfo: 'Source unavailable',
      statusLabel: 'source unavailable',
    });

    expect(
      createSiteDevToolsAiResolvedSourceState({
        renderedBytes: 1536,
        sourceAvailable: true,
        sourceBytes: 1024,
      }),
    ).toEqual({
      sizeDelta: 'Delta +50.0%',
      sourceInfo: 'Source 1.0 KB',
    });
  });
});
