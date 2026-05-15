import type { ConfigType } from '#dep-types/utils';
import { VITEPRESS_HMR_LOG_GROUPS } from '#shared/constants/log-groups/hmr';
import type { RenderController } from '@docs-islands/core/node/render-controller';
import { createElapsedTimer } from '@docs-islands/logger/helper';
import { join } from 'pathe';
import type { Plugin } from 'vite';
import { normalizePath } from 'vite';
import type { RenderingFrameworkParserManager } from '../core/framework-parser';
import type { RenderingModuleResolution } from '../core/module-resolution';
import { getVitePressGroupLogger } from '../logger';

export function createFrameworkMarkdownHmrPlugin({
  framework,
  frameworkParserManager,
  loggerScopeId,
  name,
  renderController,
  resolution,
  siteConfig,
  wsEvent,
}: {
  framework: string;
  frameworkParserManager: RenderingFrameworkParserManager;
  loggerScopeId: string;
  name: string;
  renderController: RenderController;
  resolution: RenderingModuleResolution;
  siteConfig: ConfigType;
  wsEvent: string;
}): Plugin {
  return {
    name,
    apply: 'serve',
    enforce: 'pre',
    handleHotUpdate: {
      order: 'pre',
      async handler(ctx) {
        const updateElapsed = createElapsedTimer();
        const { file, modules, server, read } = ctx;
        const Logger = getVitePressGroupLogger(
          VITEPRESS_HMR_LOG_GROUPS.markdownUpdate,
          loggerScopeId,
        );

        if (!file.endsWith('.md')) {
          return modules;
        }

        const normalizedId = normalizePath(file);
        const originalContent = await read();

        let oldCompilationContainerImportsByLocalName = new Map<
          string,
          { identifier: string; importedName: string }
        >();

        if (
          renderController.hasCompilationContainerByMarkdownModuleId(
            framework,
            normalizedId,
          )
        ) {
          const oldCompilationContainer =
            await renderController.getCompilationContainerByMarkdownModuleId(
              framework,
              normalizedId,
            );
          oldCompilationContainerImportsByLocalName =
            oldCompilationContainer.importsByLocalName;
        }

        const { code: processedContent } =
          await frameworkParserManager.transformMarkdown(
            originalContent,
            normalizedId,
            resolution.createRuntimeResolver({
              resolveId: server.pluginContainer.resolveId.bind(
                server.pluginContainer,
              ),
              defaultImporter: file,
            }),
          );

        const compilationContainer =
          await renderController.getCompilationContainerByMarkdownModuleId(
            framework,
            normalizedId,
          );

        if (
          oldCompilationContainerImportsByLocalName.size === 0 &&
          compilationContainer.importsByLocalName.size === 0
        ) {
          if (processedContent !== originalContent) {
            ctx.read = async () => processedContent;
          }
          return modules;
        }

        const relativeId = normalizedId.replace(siteConfig.srcDir, '');
        Logger.success(
          `${relativeId} changed, container script content will be re-parsed...`,
          updateElapsed(),
        );

        const updates: Record<
          string,
          { path: string; importedName: string; sourcePath?: string }
        > = {};

        for (const [
          componentName,
          importInfo,
        ] of compilationContainer.importsByLocalName.entries()) {
          updates[componentName] = {
            path: join(
              '/',
              importInfo.identifier.replace(siteConfig.srcDir, ''),
            ),
            importedName: importInfo.importedName,
            sourcePath: importInfo.identifier,
          };
        }

        const missingImports = new Set<string>();
        for (const [
          componentName,
        ] of oldCompilationContainerImportsByLocalName.entries()) {
          if (!compilationContainer.importsByLocalName.has(componentName)) {
            missingImports.add(componentName);
          }
        }

        ctx.read = async () => processedContent;
        server.ws.send({
          type: 'custom',
          event: wsEvent,
          data: {
            updates,
            missingImports: [...missingImports],
          },
        });

        return modules;
      },
    },
  };
}
