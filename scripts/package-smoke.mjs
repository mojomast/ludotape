import assert from 'node:assert/strict';
import {
  access,
  mkdtemp,
  mkdir,
  readFile,
  readdir,
  rm,
  writeFile
} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const temporary = await mkdtemp(join(tmpdir(), 'ludotape-package-'));
const consumer = join(temporary, 'consumer');

function run(command, args, cwd) {
  const result = spawnSync(command, args, {cwd, encoding: 'utf8'});
  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(' ')} failed:\n${result.stderr || result.stdout}`);
  }
  return result.stdout;
}

try {
  run('npm', ['pack', '--pack-destination', temporary], root);
  const tarballs = (await readdir(temporary)).filter(name => name.endsWith('.tgz'));
  assert.equal(tarballs.length, 1, 'npm pack must create one tarball');

  await mkdir(consumer);
  await writeFile(join(consumer, 'package.json'), '{"private":true,"type":"module"}\n');
  run('npm', [
    'install',
    join(temporary, tarballs[0]),
    '--ignore-scripts',
    '--no-audit',
    '--no-fund'
  ], consumer);

  const packageRoot = join(consumer, 'node_modules', 'ludotape');
  await access(join(packageRoot, 'dist', 'studio', 'index.html'));
  await access(join(packageRoot, 'bench', 'benchmark.mjs'));
  await assert.rejects(access(join(packageRoot, 'bench', 'results.json')));

  run(process.execPath, [
    '--input-type=module',
    '--eval',
    "await Promise.all(['ludotape','ludotape/adapters','ludotape/storage','ludotape/editor','ludotape/authoring'].map(x=>import(x)))"
  ], consumer);

  const cli = join(packageRoot, 'bin', 'ludotape.mjs');
  const example = join(packageRoot, 'examples', 'basic-counter.mjs');
  const validation = JSON.parse(run(process.execPath, [cli, 'validate', example], consumer));
  assert.equal(validation.ok, true);
  const benchmark = JSON.parse(run(process.execPath, [cli, 'benchmark'], consumer));
  assert.equal(benchmark.format, 'ludotape/benchmark@1');
  await assert.rejects(access(join(packageRoot, 'bench', 'results.json')));

  const installedPackage = JSON.parse(await readFile(join(packageRoot, 'package.json'), 'utf8'));
  assert.equal(installedPackage.name, 'ludotape');
  console.log(JSON.stringify({ok: true, package: installedPackage.version}));
} finally {
  await rm(temporary, {recursive: true, force: true});
}
