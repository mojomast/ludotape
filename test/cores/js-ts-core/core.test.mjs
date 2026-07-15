import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {defineGame, compileCartridge, canonical, digest, LudotapeError} from '../../../src/index.mjs';
import {createCore, default as defaultCore} from '../../../src/cores/js-ts-core/core.mjs';
import * as jsTsCore from '../../../src/cores/js-ts-core/index.mjs';

// --- Fixture games -----------------------------------------------------------------------

const counterGame = defineGame({
  id: 'test/counter',
  version: '1.0.0',
  metadata: {title: 'Counter'},
  initialState: () => ({count: 0}),
  actions: (state, {document}) => state.count < document.target ? [{type: 'increment'}] : [],
  transition: (state, action) => {
    if (action.type !== 'increment') throw new Error('unsupported action');
    return {count: state.count + 1};
  },
  isGoal: (state, {document}) => state.count === document.target,
  project: (state, {document}) => ({count: state.count, target: document.target, complete: state.count === document.target})
});
const counterCartridge = compileCartridge(counterGame, {target: 3});

// A cartridge whose game has no isGoal callback, to exercise the capability boundary.
const goallessGame = defineGame({
  id: 'test/goalless',
  version: '1.0.0',
  initialState: () => ({count: 0}),
  actions: (state, {document}) => state.count < document.target ? [{type: 'increment'}] : [],
  transition: (state, action) => ({count: state.count + 1})
});
const goallessCartridge = compileCartridge(goallessGame, {target: 2});

// A cartridge whose transition throws a raw string primitive, to exercise the error boundary.
const boundaryGame = defineGame({
  id: 'test/boundary',
  version: '1.0.0',
  initialState: () => ({n: 0}),
  actions: () => [{type: 'explode'}],
  transition: () => { throw 'kaboom'; } // eslint-disable-line no-throw-literal
});
const boundaryCartridge = compileCartridge(boundaryGame, {});

// --- Metadata ------------------------------------------------------------------------------

test('metadata is a deep-frozen canonical value with the required shape', () => {
  const core = createCore();
  const {metadata} = core;
  assert.doesNotThrow(() => canonical(metadata));
  assert.equal(metadata.format, 'ludotape/core@1');
  assert.equal(metadata.id, 'ludotape/js-ts-core');
  assert.equal(metadata.version, '0.2.0');
  assert.equal(metadata.name, 'JavaScript/TypeScript Core');
  assert.deepEqual(metadata.capabilities, {replay: true, rewind: true, solve: true, scenarios: true});
  assert.deepEqual(metadata.cartridgeFormats, ['ludotape/cartridge@1']);
  assert.ok(Object.isFrozen(metadata));
  assert.ok(Object.isFrozen(metadata.capabilities));
  assert.ok(Object.isFrozen(metadata.cartridgeFormats));
});

test('the ICore instance itself is frozen', () => {
  assert.ok(Object.isFrozen(createCore()));
  assert.ok(Object.isFrozen(defaultCore));
});

test('core.manifest.json matches the loaded metadata exactly', () => {
  const manifestPath = fileURLToPath(new URL('../../../src/cores/js-ts-core/core.manifest.json', import.meta.url));
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  const {metadata} = createCore();
  assert.equal(manifest.entry, './core.mjs');
  assert.equal(manifest.id, metadata.id);
  assert.equal(manifest.version, metadata.version);
  assert.equal(manifest.name, metadata.name);
  assert.deepEqual(manifest.capabilities, metadata.capabilities);
  assert.deepEqual(manifest.cartridgeFormats, metadata.cartridgeFormats);
});

// --- createCore ----------------------------------------------------------------------------

test('createCore returns a fresh instance on every call', () => {
  const a = createCore(), b = createCore();
  assert.notEqual(a, b);
  assert.deepEqual(a.metadata, b.metadata);
});

test('index.mjs re-exports createCore, a default core, and the author-facing helpers', () => {
  assert.equal(typeof jsTsCore.createCore, 'function');
  assert.ok(Object.isFrozen(jsTsCore.default));
  for (const name of ['defineGame', 'defineCartridge', 'compileCartridge', 'createRun', 'availability',
    'dispatch', 'project', 'runActions', 'rewindRun', 'createReplay', 'verifyReplay', 'solve',
    'createRng', 'canonical', 'digest', 'clone', 'deepFreeze', 'LudotapeError']) {
    assert.equal(typeof jsTsCore[name], 'function', `expected ${name} to be re-exported as a function`);
  }
});

// --- loadCartridge: accepted shapes ---------------------------------------------------------

test('loadCartridge accepts an already-compiled cartridge', () => {
  const core = createCore();
  const loaded = core.loadCartridge(counterCartridge);
  assert.equal(loaded, counterCartridge);
  assert.equal(loaded.format, 'ludotape/cartridge@1');
});

test('loadCartridge accepts a module namespace object with a default export', () => {
  const core = createCore();
  const loaded = core.loadCartridge({default: counterCartridge});
  assert.equal(loaded, counterCartridge);
});

test('loadCartridge accepts a module namespace object with a cartridge export', () => {
  const core = createCore();
  const loaded = core.loadCartridge({cartridge: counterCartridge});
  assert.equal(loaded, counterCartridge);
});

test('loadCartridge compiles {game, document} from an already-defined game', () => {
  const core = createCore();
  const loaded = core.loadCartridge({game: counterGame, document: {target: 5}});
  assert.equal(loaded.format, 'ludotape/cartridge@1');
  assert.equal(loaded.document.target, 5);
  assert.ok(Object.isFrozen(loaded));
});

test('loadCartridge compiles {game, document} from a raw (un-defineGame\'d) spec', () => {
  const core = createCore();
  const raw = {
    id: 'test/raw-spec',
    version: '1.0.0',
    initialState: () => ({n: 0}),
    actions: () => [],
    transition: state => state
  };
  const loaded = core.loadCartridge({game: raw, document: {}});
  assert.equal(loaded.format, 'ludotape/cartridge@1');
  assert.equal(loaded.game.id, 'test/raw-spec');
});

// --- loadCartridge: rejections ---------------------------------------------------------------

function assertCoreCartridgeError(fn) {
  assert.throws(fn, error => error instanceof LudotapeError && error.code === 'E_CORE_CARTRIDGE');
}

test('loadCartridge rejects non-object sources', () => {
  const core = createCore();
  assertCoreCartridgeError(() => core.loadCartridge(null));
  assertCoreCartridgeError(() => core.loadCartridge(undefined));
  assertCoreCartridgeError(() => core.loadCartridge(42));
  assertCoreCartridgeError(() => core.loadCartridge('cartridge'));
});

test('loadCartridge rejects arrays and unrecognized plain objects', () => {
  const core = createCore();
  assertCoreCartridgeError(() => core.loadCartridge([]));
  assertCoreCartridgeError(() => core.loadCartridge({}));
  assertCoreCartridgeError(() => core.loadCartridge({unrelated: true}));
});

test('loadCartridge rejects a module namespace whose default/cartridge export is not compiled', () => {
  const core = createCore();
  assertCoreCartridgeError(() => core.loadCartridge({default: {}}));
  assertCoreCartridgeError(() => core.loadCartridge({cartridge: {format: 'ludotape/cartridge@1'}})); // missing identity, unfrozen
});

test('loadCartridge rejects an unfrozen or identity-less cartridge-shaped object', () => {
  const core = createCore();
  assertCoreCartridgeError(() => core.loadCartridge({format: 'ludotape/cartridge@1', identity: 'x', document: {}, game: {}}));
});

test('loadCartridge rejects a malformed {game, document} source', () => {
  const core = createCore();
  assertCoreCartridgeError(() => core.loadCartridge({game: {}, document: {}}));
  assertCoreCartridgeError(() => core.loadCartridge({game: {id: 'x'}, document: {}}));
});

// --- Full lifecycle happy path ----------------------------------------------------------------

test('full lifecycle: createRun -> availability -> dispatch -> project -> isGoal -> replay -> rewind -> solve', () => {
  const core = createCore();
  const cartridge = core.loadCartridge(counterCartridge);
  const run = core.createRun(cartridge, {seed: 7});
  assert.equal(run.turn, 0);
  assert.deepEqual(run.state, {count: 0});

  assert.deepEqual(core.availability(run), [{type: 'increment'}]);
  assert.equal(core.isGoal(run), false);

  core.dispatch(run, {type: 'increment'});
  core.dispatch(run, {type: 'increment'});
  assert.equal(run.turn, 2);
  assert.equal(core.isGoal(run), false);

  const projection = core.project(run);
  assert.deepEqual(projection, {count: 2, target: 3, complete: false});

  core.dispatch(run, {type: 'increment'});
  assert.equal(core.isGoal(run), true);
  assert.deepEqual(core.availability(run), []);

  const replay = core.createReplay(run);
  assert.equal(replay.actions.length, 3);
  const verification = core.verifyReplay(cartridge, replay);
  assert.equal(verification.ok, true);
  assert.equal(verification.turns, 3);

  const rewound = core.rewindRun(run, 1);
  assert.equal(rewound.turn, 2);
  assert.equal(core.isGoal(rewound), false);

  const solved = core.solve(cartridge, {seed: 7, maxDepth: 5});
  assert.equal(solved.status, 'solved');
  assert.equal(solved.depth, 3);
  assert.deepEqual(solved.actions, [{type: 'increment'}, {type: 'increment'}, {type: 'increment'}]);
});

test('project accepts an adapter function', () => {
  const core = createCore();
  const run = core.createRun(counterCartridge);
  assert.equal(core.project(run, view => view.count), 0);
});

test('project rejects a non-function adapter with a coded error', () => {
  const core = createCore();
  const run = core.createRun(counterCartridge);
  assert.throws(() => core.project(run, 'not-a-function'), error => error instanceof LudotapeError && error.code === 'E_CORE');
});

// --- Capability boundaries -----------------------------------------------------------------

test('isGoal throws E_CORE_CAPABILITY when the cartridge has no isGoal callback', () => {
  const core = createCore();
  const run = core.createRun(goallessCartridge);
  assert.throws(() => core.isGoal(run), error => error instanceof LudotapeError && error.code === 'E_CORE_CAPABILITY');
});

test('solve throws E_CORE_CAPABILITY when there is no isGoal and no override', () => {
  const core = createCore();
  assert.throws(() => core.solve(goallessCartridge), error => error instanceof LudotapeError && error.code === 'E_CORE_CAPABILITY');
});

test('solve succeeds with an explicit isGoal override', () => {
  const core = createCore();
  const result = core.solve(goallessCartridge, {maxDepth: 4, isGoal: state => state.count === 2});
  assert.equal(result.status, 'solved');
  assert.equal(result.depth, 2);
});

// --- Illegal actions and determinism ---------------------------------------------------------

test('dispatch rejects an illegal action with a coded error', () => {
  const core = createCore();
  const run = core.createRun(counterCartridge);
  assert.throws(
    () => core.dispatch(run, {type: 'decrement'}),
    error => error instanceof LudotapeError && error.code === 'E_ILLEGAL_ACTION'
  );
});

test('twin runs with the same seed and action script produce identical digests', () => {
  const core = createCore();
  const runA = core.createRun(counterCartridge, {seed: 42});
  const runB = core.createRun(counterCartridge, {seed: 42});
  for (let i = 0; i < 3; i++) {
    core.dispatch(runA, core.availability(runA)[0]);
    core.dispatch(runB, core.availability(runB)[0]);
  }
  assert.equal(digest(runA.state), digest(runB.state));
  assert.deepEqual(runA.journal.map(e => e.after), runB.journal.map(e => e.after));
  assert.equal(core.createReplay(runA).final, core.createReplay(runB).final);
});

// --- Error boundary: hostile / primitive throws --------------------------------------------

test('dispatch converts a transition that throws a string primitive into a coded LudotapeError', () => {
  const core = createCore();
  const run = core.createRun(boundaryCartridge);
  let caught;
  try {
    core.dispatch(run, {type: 'explode'});
  } catch (error) {
    caught = error;
  }
  assert.ok(caught instanceof LudotapeError, 'expected a LudotapeError, not a raw thrown value');
  assert.equal(caught.code, 'E_CORE');
  assert.equal(caught.details.op, 'dispatch');
  assert.equal(caught.details.cause.message, 'kaboom');
  // The run must remain unmutated after the failed transition.
  assert.equal(run.turn, 0);
});
