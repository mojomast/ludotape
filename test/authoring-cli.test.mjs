import test, {after, before} from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {mkdtemp, rm, writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {runScenarios} from '../src/authoring.mjs';
import cartridge from '../examples/basic-counter.mjs';
import scenarios from '../examples/basic-counter.scenarios.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
const cli = join(root, 'bin', 'ludotape.mjs');
let temporary;

function run(args) {
  return spawnSync(process.execPath, [cli, ...args], {cwd: root, encoding: 'utf8'});
}

before(async () => {
  temporary = await mkdtemp(join(tmpdir(), 'ludotape-authoring-cli-'));
});

after(async () => {
  await rm(temporary, {recursive: true, force: true});
});

test('basic counter scenario example demonstrates passing initial, step, and final expectations', () => {
  const result = runScenarios(cartridge, scenarios);
  assert.equal(result.ok, true);
  assert.equal(result.results.length, 1);
  assert.deepEqual(result.diagnostics, []);
});

test('check emits a bounded one-seed JSON report and warnings exit successfully', () => {
  const result = run(['check', 'examples/basic-counter.mjs', '7', '1', '2']);
  assert.equal(result.status, 0, result.stderr);
  const report = JSON.parse(result.stdout);
  assert.equal(report.ok, true);
  assert.equal(report.errors, 0);
  assert.ok(report.warnings > 0);
  assert.deepEqual(report.coverage, {
    bounded: true,
    seeds: 1,
    paths: 2,
    transitions: 1,
    maxDepth: 1,
    maxPaths: 2,
    maxActionsPerState: 100,
    depthLimited: true,
    pathLimited: false,
    actionLimited: false
  });
});

test('check exits 1 when diagnostics contain errors', async () => {
  const core = pathToFileURL(join(root, 'src', 'index.mjs')).href;
  const path = join(temporary, 'nondeterministic.mjs');
  await writeFile(path, `
    import {compileCartridge, defineGame} from ${JSON.stringify(core)};
    let calls = 0;
    export default compileCartridge(defineGame({
      id: 'cli-nondeterministic', version: '1',
      initialState: () => ({n: 0}), actions: () => [],
      transition: state => state, project: state => ({n: state.n, calls: ++calls})
    }));
  `);
  const result = run(['check', path, '0', '0', '1']);
  assert.equal(result.status, 1);
  const report = JSON.parse(result.stdout);
  assert.equal(report.ok, false);
  assert.ok(report.errors > 0);
  assert.ok(report.diagnostics.some(item => item.code === 'E_CHECK_TWIN'));
});

test('test loads named scenarios and exits 1 for scenario failures', async () => {
  const passing = join(temporary, 'named-scenarios.mjs');
  const failing = join(temporary, 'failing-scenarios.mjs');
  await writeFile(passing, `export const scenarios = [{initial: {state: {count: 0}}}];\n`);
  await writeFile(failing, `export default [{name: 'wrong', expect: {state: {count: 99}}}];\n`);

  const pass = run(['test', 'examples/basic-counter.mjs', passing]);
  assert.equal(pass.status, 0, pass.stderr);
  assert.equal(JSON.parse(pass.stdout).ok, true);

  const failure = run(['test', 'examples/basic-counter.mjs', failing]);
  assert.equal(failure.status, 1);
  const report = JSON.parse(failure.stdout);
  assert.equal(report.ok, false);
  assert.equal(report.diagnostics[0].code, 'E_SCENARIO_MISMATCH');
});

test('CLI reports stable errors immediately for missing cartridge and scenario exports', async () => {
  const empty = join(temporary, 'no-exports.mjs');
  await writeFile(empty, 'export const unrelated = true;\n');

  const cartridgeResult = run(['check', empty]);
  assert.equal(cartridgeResult.status, 1);
  assert.equal(cartridgeResult.stdout, '');
  assert.equal(cartridgeResult.stderr, 'E_CLI_CARTRIDGE_EXPORT: cartridge module must export default or named cartridge\n');

  const scenarioResult = run(['test', 'examples/basic-counter.mjs', empty]);
  assert.equal(scenarioResult.status, 1);
  assert.equal(scenarioResult.stdout, '');
  assert.equal(scenarioResult.stderr, 'E_CLI_SCENARIOS_EXPORT: scenario module must export default or named scenarios\n');
});
