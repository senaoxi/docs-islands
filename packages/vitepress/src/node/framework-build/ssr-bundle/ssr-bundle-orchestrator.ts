import type {
  ComponentBundleInfo,
  UsedSnippetContainerType,
} from '#dep-types/component';
import type { RollupOutput } from '#dep-types/rollup';
import { build } from 'vite';
import type { UIFrameworkBuildAdapter } from '../adapter';
import { isOutputChunk } from '../shared';
import { createSSRBundleConfig } from './ssr-bundle-config.js';
import { executeSSRRender } from './ssr-render-executor.js';

export interface OrchestrateSSRBundleOptions {
  srcDir: string;
  base: string;
  ssrTempDir: string;
  assetsDir: string;
  entryPoints: Record<string, string>;
  adapter: UIFrameworkBuildAdapter;
  loggerScopeId: string;
  ssrComponents: ComponentBundleInfo[];
  usedSnippetContainer: Map<string, UsedSnippetContainerType>;
}

export async function orchestrateSSRBundle(
  options: OrchestrateSSRBundleOptions,
): Promise<Map<string, string>> {
  const viteConfig = createSSRBundleConfig(options);
  const result = (await build(viteConfig)) as RollupOutput | RollupOutput[];
  const output = Array.isArray(result) ? result[0] : result;

  if (!output?.output || output.output.length === 0) {
    throw new Error('No output files generated for SSR bundle');
  }

  const renderedComponents = new Map<string, string>();

  for (const chunk of output.output) {
    if (!isOutputChunk(chunk) || !chunk.isEntry) {
      continue;
    }

    await executeSSRRender(
      chunk,
      options.ssrComponents,
      options.ssrTempDir,
      options.adapter,
      options.usedSnippetContainer,
      options.loggerScopeId,
      renderedComponents,
    );
  }

  return renderedComponents;
}
