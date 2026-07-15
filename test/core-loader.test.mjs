import test, {before, after} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp, rm, writeFile, mkdir} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {LudotapeError} from '../src/index.mjs';
import {
  validateCoreShape, wrapCore, createCoreRegistry, loadCoreFromManifest, discoverCores, defaultRegistry
} from '../src/core-loader.mjs';
import {createCore as createStubCore} from '../examples/cores/stub-core/core.mjs';
import stubCartridge from '../examples/cores/stub-core/stub-cartridge.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
const indexHref = pathToFileURL(join(root, 'src', 'index.mjs')).href;
let temporary;

before(async () => { temporary = await mkdtemp(join(tmpdir(), 'ludotape-core-loader-')); });
after(async () => { await rm(temporary, {recursive: true, force: true}); });

// A minimal-but-real fixture core module writer, used to exercise
// loadCoreFromManifest against real files on disk.
function fixtureSource({id = 'fixture/core', version = '1.0.0', name = 'Fixture Core', capabilities = {replay: false, rewind: false, solve: false, scenarios: false}, badExport = false} = {}) {
  const exportLine = badExport ? 'export const notCreateCore = () => coreInstance;' : 'export function createCore() { return coreInstance; }';
  return `
import {LudotapeError, digest, deepFreeze, clone} from ${JSON.stringify(indexHref)};
const metadata = deepFreeze({
  format: 'ludotape/core@1', id: ${JSON.stringify(id)}, version: ${JSON.stringify(version)}, name: ${JSON.stringify(name)},
  capabilities: ${JSON.stringify(capabilities)}, cartridgeFormats: ['fixture/cartridge@1']
});
function loadCartridge(source) {
  const document = deepFreeze(clone(source?.document ?? {}));
  const identity = digest({format: 'fixture/cartridge@1', document});
  return deepFreeze({format: 'fixture/cartridge@1', identity, document});
}
function createRun(cartridge, {seed = 0} = {}) { return {cartridge, seed, state: {n: 0}, journal: [], turn: 0}; }
function availability() { return []; }
function dispatch() { throw new LudotapeError('E_ILLEGAL_ACTION', 'no actions available'); }
function project(run) { return {n: run.state.n}; }
const coreInstance = {metadata, loadCartridge, createRun, availability, dispatch, project};
${exportLine}
export default coreInstance;
`;
}
function manifestFor({id = 'fixture/core', version = '1.0.0', name = 'Fixture Core', capabilities = {replay: false, rewind: false, solve: false, scenarios: false}, entry = './core.mjs', extra = {}} = {}) {
  return {format: 'ludotape/core-manifest@1', id, version, name, entry, capabilities, cartridgeFormats: ['fixture/cartridge@1'], ...extra};
}
async function writeFixture(dirName, {sourceOptions = {}, manifestOptions = {}} = {}) {
  const dir = join(temporary, dirName);
  await mkdir(dir, {recursive: true});
  await writeFile(join(dir, 'core.mjs'), fixtureSource(sourceOptions));
  await writeFile(join(dir, 'core.manifest.json'), JSON.stringify(manifestFor(manifestOptions), null, 2));
  return dir;
}

// --- validateCoreShape ------------------------------------------------------

test('validateCoreShape accepts a well-formed core', () => {
  const {ok, diagnostics} = validateCoreShape(createStubCore());
  assert.equal(ok, true);
  assert.deepEqual(diagnostics, []);
});

test('validateCoreShape rejects non-object input without throwing', () => {
  for (const bad of [null, undefined, 42, 'x', [], () => {}]) {
    const {ok, diagnostics} = validateCoreShape(bad);
    assert.equal(ok, false);
    assert.ok(diagnostics.length >= 1);
  }
});

test('validateCoreShape reports missing required methods', () => {
  const core = createStubCore();
  const {dispatch, ...withoutDispatch} = core;
  const {ok, diagnostics} = validateCoreShape(withoutDispatch);
  assert.equal(ok, false);
  assert.ok(diagnostics.some(d => d.path === 'dispatch' && d.code === 'E_CORE_SHAPE'));
});

test('validateCoreShape reports bad metadata fields', () => {
  const core = createStubCore();
  const broken = {...core, metadata: {...core.metadata, format: 'wrong/format@1', id: ''}};
  const {ok, diagnostics} = validateCoreShape(broken);
  assert.equal(ok, false);
  assert.ok(diagnostics.some(d => d.path === 'metadata.format'));
  assert.ok(diagnostics.some(d => d.path === 'metadata.id'));
});

test('validateCoreShape enforces capability -> method requirements', () => {
  const core = createStubCore();
  const broken = {...core, metadata: {...core.metadata, capabilities: {...core.metadata.capabilities, solve: true}}, solve: undefined, isGoal: undefined};
  const {ok, diagnostics} = validateCoreShape(broken);
  assert.equal(ok, false);
  assert.ok(diagnostics.some(d => d.code === 'E_CORE_CAPABILITY' && d.path === 'solve'));
  assert.ok(diagnostics.some(d => d.code === 'E_CORE_CAPABILITY' && d.path === 'isGoal'));
});

// --- wrapCore ----------------------------------------------------------------

test('wrapCore throws E_CORE_SHAPE for an invalid core', () => {
  assert.throws(() => wrapCore({}), error => error instanceof LudotapeError && error.code === 'E_CORE_SHAPE');
});

test('wrapCore freezes the core and adds equivalent tick/render aliases', () => {
  const core = wrapCore(createStubCore());
  assert.ok(Object.isFrozen(core));
  assert.equal(typeof core.tick, 'function');
  assert.equal(typeof core.render, 'function');

  const cartridge = core.loadCartridge(stubCartridge);
  const runA = core.createRun(cartridge, {seed: 0});
  const runB = core.createRun(cartridge, {seed: 0});
  const [actionA] = core.availability(runA);
  const [actionB] = core.availability(runB);
  const entryViaDispatch = core.dispatch(runA, actionA);
  const entryViaTick = core.tick(runB, actionB);
  assert.equal(entryViaDispatch.after, entryViaTick.after);
  assert.deepEqual(core.project(runA), core.render(runB));
});

// --- createCoreRegistry -------------------------------------------------------

test('registry register/get/list/unregister round trip', () => {
  const registry = createCoreRegistry();
  const wrapped = registry.register(createStubCore());
  assert.equal(wrapped.metadata.id, 'example/stub-core');
  assert.equal(registry.get('example/stub-core'), wrapped);
  assert.deepEqual(registry.list().map(m => m.id), ['example/stub-core']);
  registry.unregister('example/stub-core');
  assert.throws(() => registry.get('example/stub-core'), error => error.code === 'E_CORE_UNKNOWN');
});

test('registry rejects duplicate ids', () => {
  const registry = createCoreRegistry();
  registry.register(createStubCore());
  assert.throws(() => registry.register(createStubCore()), error => error.code === 'E_CORE_DUPLICATE');
});

test('registry.get throws E_CORE_UNKNOWN for an unregistered id', () => {
  const registry = createCoreRegistry();
  assert.throws(() => registry.get('nope/nope'), error => error.code === 'E_CORE_UNKNOWN');
});

test('registry.resolve matches a cartridge format to a registered core', () => {
  const registry = createCoreRegistry();
  registry.register(createStubCore());
  const resolved = registry.resolve(stubCartridge);
  assert.equal(resolved.metadata.id, 'example/stub-core');
  assert.throws(() => registry.resolve({format: 'unknown/format@1'}), error => error.code === 'E_CORE_CARTRIDGE');
});

test('registry accepts a createCore factory function and calls init/teardown hooks', () => {
  const registry = createCoreRegistry();
  let initHost, tornDown = false;
  const factory = () => ({
    metadata: {
      format: 'ludotape/core@1', id: 'fixture/hooked', version: '1.0.0', name: 'Hooked',
      capabilities: {replay: false, rewind: false, solve: false, scenarios: false}, cartridgeFormats: ['fixture/cartridge@1']
    },
    loadCartridge: s => s,
    createRun: () => ({turn: 0}),
    availability: () => [],
    dispatch: () => { throw new LudotapeError('E_ILLEGAL_ACTION', 'none'); },
    project: () => ({}),
    init(host) { initHost = host; },
    teardown() { tornDown = true; }
  });
  const wrapped = registry.register(factory);
  assert.equal(wrapped.metadata.id, 'fixture/hooked');
  assert.equal(typeof initHost.log, 'function');
  assert.equal(tornDown, false);
  registry.unregister('fixture/hooked');
  assert.equal(tornDown, true);
});

// --- defaultRegistry -----------------------------------------------------------

test('defaultRegistry is a working registry object', () => {
  assert.equal(typeof defaultRegistry.register, 'function');
  assert.equal(typeof defaultRegistry.get, 'function');
  assert.equal(typeof defaultRegistry.list, 'function');
  assert.equal(typeof defaultRegistry.resolve, 'function');
  assert.equal(typeof defaultRegistry.unregister, 'function');
  assert.ok(Array.isArray(defaultRegistry.list()));
});

// --- loadCoreFromManifest -------------------------------------------------------

test('loadCoreFromManifest loads a well-formed fixture core', async () => {
  const dir = await writeFixture('happy', {sourceOptions: {id: 'fixture/happy'}, manifestOptions: {id: 'fixture/happy'}});
  const core = await loadCoreFromManifest(join(dir, 'core.manifest.json'));
  assert.equal(core.metadata.id, 'fixture/happy');
  assert.equal(typeof core.tick, 'function');
});

test('loadCoreFromManifest loads the real example stub core', async () => {
  const manifestPath = join(root, 'examples', 'cores', 'stub-core', 'core.manifest.json');
  const core = await loadCoreFromManifest(manifestPath);
  assert.equal(core.metadata.id, 'example/stub-core');
});

test('loadCoreFromManifest rejects a manifest/metadata mismatch with E_CORE_MANIFEST', async () => {
  const dir = await writeFixture('mismatch', {sourceOptions: {id: 'fixture/mismatch', version: '1.0.0'}, manifestOptions: {id: 'fixture/mismatch', version: '9.9.9'}});
  await assert.rejects(loadCoreFromManifest(join(dir, 'core.manifest.json')), error => error.code === 'E_CORE_MANIFEST');
});

test('loadCoreFromManifest rejects unknown manifest keys', async () => {
  const dir = await writeFixture('unknown-key', {sourceOptions: {id: 'fixture/unknown-key'}, manifestOptions: {id: 'fixture/unknown-key', extra: {bogus: true}}});
  await assert.rejects(loadCoreFromManifest(join(dir, 'core.manifest.json')), error => error.code === 'E_CORE_MANIFEST');
});

test('loadCoreFromManifest rejects a non-relative entry path', async () => {
  const dir = join(temporary, 'bad-entry-shape');
  await mkdir(dir, {recursive: true});
  await writeFile(join(dir, 'core.mjs'), fixtureSource({id: 'fixture/bad-entry-shape'}));
  await writeFile(join(dir, 'core.manifest.json'), JSON.stringify(manifestFor({id: 'fixture/bad-entry-shape', entry: 'core.mjs'}), null, 2));
  await assert.rejects(loadCoreFromManifest(join(dir, 'core.manifest.json')), error => error.code === 'E_CORE_MANIFEST');
});

test('loadCoreFromManifest rejects an entry that fails to import with E_CORE_ENTRY', async () => {
  const dir = join(temporary, 'bad-entry-missing');
  await mkdir(dir, {recursive: true});
  await writeFile(join(dir, 'core.manifest.json'), JSON.stringify(manifestFor({id: 'fixture/bad-entry-missing', entry: './does-not-exist.mjs'}), null, 2));
  await assert.rejects(loadCoreFromManifest(join(dir, 'core.manifest.json')), error => error.code === 'E_CORE_ENTRY');
});

test('loadCoreFromManifest rejects an entry that does not export createCore with E_CORE_ENTRY', async () => {
  const dir = await writeFixture('bad-entry-export', {sourceOptions: {id: 'fixture/bad-entry-export', badExport: true}, manifestOptions: {id: 'fixture/bad-entry-export'}});
  await assert.rejects(loadCoreFromManifest(join(dir, 'core.manifest.json')), error => error.code === 'E_CORE_ENTRY');
});

test('loadCoreFromManifest rejects malformed JSON with E_CORE_MANIFEST', async () => {
  const dir = join(temporary, 'bad-json');
  await mkdir(dir, {recursive: true});
  await writeFile(join(dir, 'core.manifest.json'), '{not valid json');
  await assert.rejects(loadCoreFromManifest(join(dir, 'core.manifest.json')), error => error.code === 'E_CORE_MANIFEST');
});

test('loadCoreFromManifest rejects a missing manifest file with E_CORE_MANIFEST', async () => {
  await assert.rejects(loadCoreFromManifest(join(temporary, 'nope', 'core.manifest.json')), error => error.code === 'E_CORE_MANIFEST');
});

// --- discoverCores -------------------------------------------------------------

test('discoverCores finds every real core under examples/cores and src/cores', async () => {
  const {cores, diagnostics} = await discoverCores([join(root, 'examples', 'cores'), join(root, 'src', 'cores')]);
  const ids = cores.map(c => c.metadata.id);
  assert.ok(ids.includes('example/stub-core'));
  assert.ok(ids.includes('ludotape/custom-core-template'));
  assert.deepEqual(diagnostics.filter(d => d.severity === 'error'), []);
});

test('discoverCores turns a broken core into a diagnostic instead of throwing', async () => {
  const dir = await writeFixture('discover-mismatch', {sourceOptions: {id: 'fixture/discover-mismatch', version: '1.0.0'}, manifestOptions: {id: 'fixture/discover-mismatch', version: '2.0.0'}});
  const {cores, diagnostics} = await discoverCores([temporary]);
  assert.ok(!cores.some(c => c.metadata.id === 'fixture/discover-mismatch'));
  assert.ok(diagnostics.some(d => d.code === 'E_CORE_MANIFEST' && d.path.includes('discover-mismatch')));
});

test('discoverCores tolerates a nonexistent directory with a warning diagnostic', async () => {
  const {cores, diagnostics} = await discoverCores([join(temporary, 'does-not-exist')]);
  assert.deepEqual(cores, []);
  assert.ok(diagnostics.some(d => d.severity === 'warning'));
});

test('discoverCores skips subdirectories that have no core.manifest.json', async () => {
  const dir = join(temporary, 'no-manifest-holder', 'not-a-core');
  await mkdir(dir, {recursive: true});
  await writeFile(join(dir, 'readme.txt'), 'not a core');
  const {cores, diagnostics} = await discoverCores([join(temporary, 'no-manifest-holder')]);
  assert.deepEqual(cores, []);
  assert.deepEqual(diagnostics, []);
});
