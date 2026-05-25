import { fileURLToPath } from 'node:url';
import type { Plugin } from 'rolldown';
import { createPackageJsonPlugin } from './src/package-plugin';

const packageJsonPath = fileURLToPath(new URL('package.json', import.meta.url));

export default function generatePackageJson(): Plugin {
  return createPackageJsonPlugin({
    packageJsonPath,
  });
}
