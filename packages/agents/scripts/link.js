import {
  createElapsedTimer,
  formatErrorMessage,
} from '@docs-islands/logger/helper';
import { createLogger } from '@docs-islands/utils/logger';
import { execSync } from 'node:child_process';
import {
  existsSync,
  lstatSync,
  mkdirSync,
  readdirSync,
  readlinkSync,
  rmSync,
  symlinkSync,
} from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const logger = createLogger({
  main: '@docs-islands/agents',
}).getLoggerByGroup('task.link');
const scriptElapsed = createElapsedTimer();

function findProjectRoot() {
  try {
    return execSync('git rev-parse --show-toplevel', {
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
    }).trim();
  } catch {
    return join(__dirname, '..', '..', '..');
  }
}

function ensureDir(dir) {
  if (!existsSync(dir)) {
    logger.info(`creating directory: ${dir}`);
    mkdirSync(dir, { recursive: true });
    logger.success(`directory created: ${dir}`);
  }
}

function createSkillSymlink(source, target) {
  if (existsSync(target)) {
    const stats = lstatSync(target);
    if (stats.isSymbolicLink()) {
      const current = readlinkSync(target);
      const expected = relative(dirname(target), source);
      if (current === expected || current === source) return 'exists';
      rmSync(target);
    } else {
      return 'skipped';
    }
  }
  try {
    const rel = relative(dirname(target), source);
    symlinkSync(
      process.platform === 'win32' ? source : rel,
      target,
      process.platform === 'win32' ? 'junction' : undefined,
    );
    return 'created';
  } catch {
    return 'error';
  }
}

function getSkillDirs(basePath) {
  if (!existsSync(basePath)) return [];
  return readdirSync(basePath, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name);
}

function linkSkillsForTool(projectRoot, skillsBase, toolDir, toolName) {
  logger.info(`${toolName} symlink setup started`);
  const linkElapsed = createElapsedTimer();
  const targetDir = join(projectRoot, toolDir, 'skills');
  const generalSkills = join(skillsBase, 'general');
  const specificSkills = join(skillsBase, toolDir.replace(/^\./, ''));

  ensureDir(targetDir);
  let created = 0,
    existed = 0;

  for (const skill of getSkillDirs(generalSkills)) {
    const r = createSkillSymlink(
      join(generalSkills, skill),
      join(targetDir, skill),
      skill,
    );
    if (r === 'created') created++;
    if (r === 'exists') existed++;
  }
  for (const skill of getSkillDirs(specificSkills)) {
    const r = createSkillSymlink(
      join(specificSkills, skill),
      join(targetDir, skill),
      skill,
    );
    if (r === 'created') created++;
    if (r === 'exists') existed++;
  }
  logger.success(
    `${toolName}: ${created} created, ${existed} exist`,
    linkElapsed(),
  );
}

function main() {
  logger.info('AI tool symlink setup started');
  const mainElapsed = createElapsedTimer();
  const projectRoot = findProjectRoot();
  const skillsBase = join(__dirname, '..', 'skills');

  if (!existsSync(join(skillsBase, 'general'))) {
    logger.warn('skills not organized, skipping');
    return;
  }

  [
    { dir: '.claude', name: 'Claude Code' },
    { dir: '.cursor', name: 'Cursor' },
    { dir: '.agent', name: 'Codex' },
    { dir: '.github', name: 'GitHub Copilot' },
  ].forEach(({ dir, name }) => {
    ensureDir(join(projectRoot, dir));
    linkSkillsForTool(projectRoot, skillsBase, dir, name);
  });
  logger.success('AI tool symlink setup finished', mainElapsed());
}

try {
  main();
} catch (error) {
  logger.error(
    `link setup failed: ${formatErrorMessage(error)}`,
    scriptElapsed(),
  );
  process.exitCode = 1;
}
