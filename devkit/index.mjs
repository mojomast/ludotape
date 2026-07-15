// Ludotape devkit: programmatic scaffolding API. Zero dependencies (Node stdlib + repo code
// only). Generated content is deterministic (no timestamps, no randomness).
import {mkdir, writeFile, stat} from 'node:fs/promises';
import {dirname, join, resolve} from 'node:path';
import {LudotapeError} from '../src/index.mjs';
import {gameTemplate} from './templates/game.mjs';
import {scenariosTemplate} from './templates/scenarios.mjs';
import {coreTemplate} from './templates/core.mjs';
import {coreManifestTemplate} from './templates/core-manifest.mjs';
import {sampleCartridgeTemplate} from './templates/sample-cartridge.mjs';
import {coreReadmeTemplate} from './templates/readme.mjs';

export {validateCore} from './validate-core.mjs';

/** Throws E_DEVKIT_EXISTS if `path` already exists and `force` is falsy. */
async function assertWritable(path, force) {
  if (force) return;
  try {
    await stat(path);
  } catch (error) {
    if (error.code === 'ENOENT') return;
    throw error;
  }
  throw new LudotapeError('E_DEVKIT_EXISTS', `refusing to overwrite existing file: ${path}`, {path});
}
async function writeGenerated(path, content) {
  await mkdir(dirname(path), {recursive: true});
  await writeFile(path, content, 'utf8');
  return path;
}

/**
 * Scaffold a new game module + scenarios file from `devkit/templates/`.
 * @param {{name: string, dir: string, id?: string, title?: string, force?: boolean}} options
 * @returns {Promise<{files: string[]}>}
 */
export async function scaffoldGame({name, dir, id, title, force = false} = {}) {
  if (typeof name !== 'string' || !name) throw new LudotapeError('E_DEVKIT_ARGUMENT', 'name is required');
  if (typeof dir !== 'string' || !dir) throw new LudotapeError('E_DEVKIT_ARGUMENT', 'dir is required');
  const gameId = id ?? `example/${name}`;
  const gameTitle = title ?? name;
  const base = resolve(dir);
  const gameFile = join(base, `${name}.mjs`);
  const scenariosFile = join(base, `${name}.scenarios.mjs`);

  await assertWritable(gameFile, force);
  await assertWritable(scenariosFile, force);

  const files = [
    await writeGenerated(gameFile, gameTemplate({id: gameId, title: gameTitle})),
    await writeGenerated(scenariosFile, scenariosTemplate({title: gameTitle}))
  ];
  return {files};
}

/**
 * Scaffold a new custom-core directory (core.mjs, core.manifest.json, sample-cartridge.mjs,
 * README.md) from `devkit/templates/`.
 * @param {{id: string, name?: string, dir: string, force?: boolean}} options
 * @returns {Promise<{files: string[]}>}
 */
export async function scaffoldCore({id, name, dir, force = false} = {}) {
  if (typeof id !== 'string' || !id) throw new LudotapeError('E_DEVKIT_ARGUMENT', 'id is required');
  if (typeof dir !== 'string' || !dir) throw new LudotapeError('E_DEVKIT_ARGUMENT', 'dir is required');
  const coreName = name ?? id;
  const base = resolve(dir);
  const coreFile = join(base, 'core.mjs');
  const manifestFile = join(base, 'core.manifest.json');
  const sampleFile = join(base, 'sample-cartridge.mjs');
  const readmeFile = join(base, 'README.md');

  await assertWritable(coreFile, force);
  await assertWritable(manifestFile, force);
  await assertWritable(sampleFile, force);
  await assertWritable(readmeFile, force);

  const files = [
    await writeGenerated(coreFile, coreTemplate({id, name: coreName})),
    await writeGenerated(manifestFile, coreManifestTemplate({id, name: coreName})),
    await writeGenerated(sampleFile, sampleCartridgeTemplate()),
    await writeGenerated(readmeFile, coreReadmeTemplate({id, name: coreName, dir: base}))
  ];
  return {files};
}
