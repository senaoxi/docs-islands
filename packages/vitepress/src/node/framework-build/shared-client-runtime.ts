import { VITEPRESS_BUILD_LOG_GROUPS } from '#shared/constants/log-groups/build';
import { createElapsedTimer } from '@docs-islands/logger/helper';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { extname } from 'pathe';
import { getVitePressGroupLogger } from '../logger';

export interface SharedClientRuntimeMetafile {
  content: string;
  fileName: string;
}

let sharedClientRuntimeMetafileCache: SharedClientRuntimeMetafile | null = null;

// TODO: Simplify processing; optimize further.
export const getSharedClientRuntimeMetafile = async (
  loggerScopeId: string,
): Promise<SharedClientRuntimeMetafile> => {
  const metafileElapsed = createElapsedTimer();
  if (sharedClientRuntimeMetafileCache) {
    return sharedClientRuntimeMetafileCache;
  }

  const currentFilePath = fileURLToPath(import.meta.url);
  const fileExtension = extname(currentFilePath);
  const __require = createRequire(import.meta.url);
  let clientRuntimePath = __require.resolve(
    '@docs-islands/vitepress/internal/client-runtime',
  );

  if (fileExtension !== '.js') {
    /**
     * The user's site project may import this dependency via a git sub-repo or other development-mode setup.
     * In that case, the built artifacts are not automatically generated, so we proactively fall back to
     * the helper runtime and surface a clearer error if it is still unavailable.
     */
    try {
      clientRuntimePath = __require.resolve(
        '@docs-islands/vitepress/internal-helper/runtime',
      );
    } catch {
      getVitePressGroupLogger(
        VITEPRESS_BUILD_LOG_GROUPS.sharedClientRuntimeMetafile,
        loggerScopeId,
      ).error(
        'This is developer mode, you need to build the @docs-islands/vitepress project first (pnpm build) to complete the build.',
        metafileElapsed(),
      );
      throw new Error(
        'Developer mode detected without built artifacts. Please run "pnpm build" first.',
      );
    }
  }

  const clientRuntimeContent = fs.readFileSync(clientRuntimePath, 'utf8');
  const hash = createHash('sha256')
    .update(clientRuntimeContent)
    .digest('hex')
    .slice(0, 8);
  const clientRuntimeMetafile = {
    content: clientRuntimeContent,
    fileName: `client-runtime.${hash}.js`,
  };

  return (sharedClientRuntimeMetafileCache = clientRuntimeMetafile);
};
