import test, {after, before, describe} from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {mkdtemp, mkdir, rm, symlink, writeFile, access} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {scaffoldGame, scaffoldCore, validateCore} from '../devkit/index.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
const createGameCli = join(root, 'devkit', 'create-game.mjs');

/**
 * Generated games/cores `import ... from 'ludotape'`. When they're scaffolded outside this
 * repo (e.g. in a temp dir), Node needs a `node_modules/ludotape` to resolve that bare
 * specifier -- exactly like `npm link` would provide for a real consumer. We symlink it to
 * this checkout so the generated files import/run without any network or `npm install`.
 */
async function withLinkedPackage(dir) {
  await mkdir(join(dir, 'node_modules'), {recursive: true});
  await symlink(root, join(dir, 'node_modules', 'ludotape'), 'dir');
}

let gameDir;
let coreDir;
let badManifestDir;
let cliDir;

before(async () => {
  gameDir = await mkdtemp(join(tmpdir(), 'ludotape-devkit-game-'));
  coreDir = await mkdtemp(join(tmpdir(), 'ludotape-devkit-core-'));
  badManifestDir = await mkdtemp(join(tmpdir(), 'ludotape-devkit-badcore-'));
  cliDir = await mkdtemp(join(tmpdir(), 'ludotape-devkit-cli-'));
  await Promise.all([withLinkedPackage(gameDir), withLinkedPackage(coreDir)]);
});

after(async () => {
  await Promise.all([
    rm(gameDir, {recursive: true, force: true}),
    rm(coreDir, {recursive: true, force: true}),
    rm(badManifestDir, {recursive: true, force: true}),
    rm(cliDir, {recursive: true, force: true})
  ]);
});

describe('scaffoldGame', () => {
  test('generates a game module + scenarios file that compile, run, and dispatch', async () => {
    const {files} = await scaffoldGame({name: 'demo-game', dir: gameDir, id: 'test/demo-game', title: 'Demo Game'});
    assert.equal(files.length, 2);
    for (const file of files) await access(file);

    const gameModule = await import(pathToFileURL(join(gameDir, 'demo-game.mjs')).href);
    const cartridge = gameModule.default;
    assert.equal(cartridge.format, 'ludotape/cartridge@1');
    assert.equal(typeof cartridge.identity, 'string');
    assert.equal(cartridge.game.id, 'test/demo-game');

    // Drive the generated cartridge with the repo's own runtime (relative import; the
    // generated module itself uses the bare 'ludotape' specifier resolved via the symlink).
    const {createRun, availability, dispatch, project} = await import('../src/index.mjs');
    const run = createRun(cartridge, {seed: 0});
    assert.deepEqual(availability(run), [{type: 'increment'}]);
    const entry = dispatch(run, {type: 'increment'});
    assert.equal(entry.index, 0);
    assert.equal(run.turn, 1);
    assert.deepEqual(project(run), {complete: false, count: 1, target: 3});
  });

  test('scenario file exports a valid, matching scenario array', async () => {
    const scenariosModule = await import(pathToFileURL(join(gameDir, 'demo-game.scenarios.mjs')).href);
    const scenarios = scenariosModule.default;
    assert.ok(Array.isArray(scenarios));
    assert.equal(scenarios.length, 1);
    const [scenario] = scenarios;
    assert.equal(typeof scenario.name, 'string');
    assert.equal(scenario.seed, 0);
    assert.ok(scenario.initial && typeof scenario.initial === 'object');
    assert.ok(Array.isArray(scenario.steps));
    assert.ok(scenario.expect && typeof scenario.expect === 'object');

    const {runScenarios} = await import('../src/authoring.mjs');
    const gameModule = await import(pathToFileURL(join(gameDir, 'demo-game.mjs')).href);
    const result = runScenarios(gameModule.default, scenarios);
    assert.equal(result.ok, true);
  });

  test('refuses to overwrite existing files without force (E_DEVKIT_EXISTS)', async () => {
    await assert.rejects(
      scaffoldGame({name: 'demo-game', dir: gameDir, id: 'test/demo-game', title: 'Demo Game'}),
      error => {
        assert.equal(error.code, 'E_DEVKIT_EXISTS');
        return true;
      }
    );
  });

  test('force overwrites existing files', async () => {
    const {files} = await scaffoldGame({name: 'demo-game', dir: gameDir, id: 'test/demo-game', title: 'Demo Game Again', force: true});
    assert.equal(files.length, 2);
  });
});

describe('scaffoldCore + validateCore', () => {
  test('generates a core that passes static validation', async () => {
    const {files} = await scaffoldCore({id: 'test/demo-core', name: 'Demo Core', dir: coreDir});
    assert.equal(files.length, 4);
    for (const file of files) await access(file);

    const report = await validateCore(coreDir);
    assert.deepEqual(report.diagnostics, []);
    assert.equal(report.ok, true);
  });

  test('generated core supports a full smoke lifecycle: loadCartridge, createRun, dispatch, project', async () => {
    const coreModule = await import(pathToFileURL(join(coreDir, 'core.mjs')).href);
    const core = coreModule.createCore();
    assert.equal(core.metadata.format, 'ludotape/core@1');
    assert.equal(core.metadata.id, 'test/demo-core');
    assert.ok(Object.isFrozen(core.metadata));

    const sampleModule = await import(pathToFileURL(join(coreDir, 'sample-cartridge.mjs')).href);
    const cartridge = core.loadCartridge(sampleModule);
    assert.equal(cartridge.format, 'test/demo-core/cartridge@1');
    assert.equal(typeof cartridge.identity, 'string');
    assert.ok(Object.isFrozen(cartridge));

    const run = core.createRun(cartridge, {seed: 0});
    const [action] = core.availability(run);
    assert.deepEqual(action, {type: 'increment'});
    const entry = core.dispatch(run, action);
    assert.equal(typeof entry.before, 'string');
    assert.equal(typeof entry.after, 'string');
    assert.notEqual(entry.before, entry.after);

    const projection = core.project(run);
    assert.deepEqual(projection, {count: 1, target: 3, complete: false});

    // Capability round-trips declared true in the manifest/metadata.
    const replayObj = core.createReplay(run);
    assert.equal(core.verifyReplay(cartridge, replayObj).ok, true);
    const rewound = core.rewindRun(run, 1);
    assert.deepEqual(core.project(rewound), {count: 0, target: 3, complete: false});
    const solved = core.solve(cartridge, {seed: 0});
    assert.equal(solved.status, 'solved');
    assert.equal(solved.actions.length, 3);
  });

  test('reports diagnostics for a corrupted manifest without importing anything', async () => {
    await writeFile(
      join(badManifestDir, 'core.manifest.json'),
      JSON.stringify({
        format: 'not-the-right-format',
        id: 'test/bad-core',
        // missing "version" and "name"
        entry: 'core.mjs', // missing leading './'
        capabilities: {replay: true, rewind: 'nope', solve: true}, // wrong type + missing key
        cartridgeFormats: [],
        extraUnknownKey: true
      }, null, 2)
    );
    const report = await validateCore(badManifestDir);
    assert.equal(report.ok, false);
    const codes = report.diagnostics.map(d => d.code);
    assert.ok(codes.every(code => code === 'E_CORE_MANIFEST'), `expected only E_CORE_MANIFEST diagnostics, got: ${codes.join(', ')}`);
    assert.ok(codes.length >= 5, `expected several manifest diagnostics, got ${codes.length}`);
  });
});

describe('CLI smoke', () => {
  test('create-game.mjs --yes generates files non-interactively', () => {
    const result = spawnSync(process.execPath, [createGameCli, '--yes', '--dir', cliDir, '--name', 'smoke-game'], {cwd: root, encoding: 'utf8'});
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /Created:/);
  });

  test('files from the CLI run exist on disk', async () => {
    await access(join(cliDir, 'smoke-game.mjs'));
    await access(join(cliDir, 'smoke-game.scenarios.mjs'));
  });
});
