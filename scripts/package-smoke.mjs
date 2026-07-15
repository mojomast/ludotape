import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';

for (const specifier of ['ludotape', 'ludotape/adapters', 'ludotape/storage', 'ludotape/editor']) {
  await import(specifier);
}

const packed = spawnSync('npm', ['pack', '--dry-run', '--json', '--ignore-scripts'], {
  cwd: new URL('..', import.meta.url),
  encoding: 'utf8'
});
if (packed.status !== 0) {
  throw new Error(`npm pack failed: ${packed.stderr || packed.stdout}`);
}
const [manifest] = JSON.parse(packed.stdout);
const files = new Set(manifest.files.map(file => file.path));
for (const required of [
  'bench/benchmark.mjs',
  'bin/ludotape.mjs',
  'examples/basic-counter.mjs',
  'examples/run-basic-counter.mjs',
  'src/index.mjs'
]) {
  assert.ok(files.has(required), `package is missing ${required}`);
}

console.log(JSON.stringify({ok: true, files: manifest.entryCount}));
