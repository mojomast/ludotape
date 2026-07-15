// Ludotape core conformance harness. Zero dependencies.
//
// This is an importable LIBRARY, not a node:test file (see
// test/core-conformance.test.mjs for the suite that runs it). It exercises
// any ICore implementation against the standard run lifecycle and reports a
// structured pass/fail breakdown instead of throwing, so it can back both
// `node --test` assertions and the `ludotape core conformance` CLI command.
import {validateCoreShape, wrapCore} from '../src/core-loader.mjs';
import {canonical, digest, clone} from '../src/index.mjs';

/**
 * Run the conformance suite against a core instance or `createCore` factory.
 * @param {object|Function} coreOrFactory
 * @param {object} [options]
 * @param {unknown} [options.cartridgeSource] source passed to loadCartridge()
 * @param {number} [options.seed]
 * @param {number} [options.maxSteps]
 * @returns {Promise<{ok:boolean, passed:number, failed:number, results:Array}>}
 */
export async function runCoreConformance(coreOrFactory, {cartridgeSource, seed = 0, maxSteps = 25} = {}) {
  const results = [];
  async function check(name, fn) {
    try { await fn(); results.push({name, ok: true}); return true; }
    catch (error) { results.push({name, ok: false, message: error?.message ?? String(error)}); return false; }
  }
  const finish = () => {
    const passed = results.filter(r => r.ok).length;
    return {ok: passed === results.length, passed, failed: results.length - passed, results};
  };

  let rawCore;
  const instantiated = await check('core factory/instance is usable', () => {
    rawCore = typeof coreOrFactory === 'function' ? coreOrFactory() : coreOrFactory;
    if (!rawCore || typeof rawCore !== 'object') throw new Error('expected an ICore instance or a createCore() factory returning one');
  });
  if (!instantiated) return finish();

  let core;
  const wrapped = await check('core shape is valid ICore (metadata + required methods)', () => {
    const {ok, diagnostics} = validateCoreShape(rawCore);
    if (!ok) throw new Error(`invalid core shape: ${diagnostics.filter(d => d.severity === 'error').map(d => `${d.path}: ${d.message}`).join('; ')}`);
    core = wrapCore(rawCore);
  });
  if (!wrapped) return finish();

  await check('metadata is a frozen canonical value', () => {
    canonical(core.metadata);
    if (!Object.isFrozen(core.metadata)) throw new Error('metadata is not frozen');
  });

  let cartridge;
  const loaded = await check('loadCartridge produces a frozen cartridge with identity + a declared format', async () => {
    if (cartridgeSource === undefined) throw new Error('options.cartridgeSource is required to run the conformance suite');
    cartridge = await core.loadCartridge(cartridgeSource);
    if (!cartridge || typeof cartridge.format !== 'string' || typeof cartridge.identity !== 'string') throw new Error('cartridge must have string format and identity fields');
    if (!core.metadata.cartridgeFormats.includes(cartridge.format)) throw new Error(`cartridge format '${cartridge.format}' is not listed in metadata.cartridgeFormats`);
    if (!Object.isFrozen(cartridge)) throw new Error('cartridge is not frozen');
  });
  if (!loaded) return finish();

  let runA;
  const created = await check('createRun is deterministic for a fixed seed (twin runs)', () => {
    runA = core.createRun(cartridge, {seed});
    const runB = core.createRun(cartridge, {seed});
    if (digest(clone(runA.state)) !== digest(clone(runB.state))) throw new Error('twin runs diverge on initial state digest');
    if (canonical(core.project(runA)) !== canonical(core.project(runB))) throw new Error('twin runs diverge on initial projection');
  });
  if (!created) return finish();

  await check('availability returns a canonical array', () => {
    const list = core.availability(runA);
    if (!Array.isArray(list)) throw new Error('availability must return an array');
    canonical(list);
  });

  let dispatchedEntry;
  await check('dispatch of an available action advances the run and returns a coded journal entry', () => {
    const list = core.availability(runA);
    if (!list.length) throw new Error('no available actions from the initial state; provide a cartridgeSource with at least one legal action');
    const turnBefore = runA.turn;
    dispatchedEntry = core.dispatch(runA, list[0]);
    if (typeof dispatchedEntry.index !== 'number') throw new Error('journal entry missing numeric index');
    if (dispatchedEntry.action === undefined) throw new Error('journal entry missing action');
    if (typeof dispatchedEntry.before !== 'string' || typeof dispatchedEntry.after !== 'string') throw new Error('journal entry missing before/after digests');
    if (runA.turn !== turnBefore + 1) throw new Error('run.turn did not advance after dispatch');
  });

  await check("dispatch of a garbage action ({type:'__nonexistent__'}) throws a coded error", () => {
    let threw = false;
    try { core.dispatch(runA, {type: '__nonexistent__'}); }
    catch (error) {
      threw = true;
      if (typeof error?.code !== 'string' || !error.code) throw new Error('error thrown for an unavailable action must carry a string .code');
    }
    if (!threw) throw new Error('dispatch of an unavailable action did not throw');
  });

  await check('project returns a canonical value', () => { canonical(core.project(runA)); });

  const caps = core.metadata.capabilities;
  if (caps.replay) {
    await check('capabilities.replay: createReplay()/verifyReplay() round-trip', () => {
      if (typeof core.createReplay !== 'function' || typeof core.verifyReplay !== 'function') throw new Error('capabilities.replay is true but createReplay/verifyReplay are missing');
      const replayValue = core.createReplay(runA);
      const outcome = core.verifyReplay(cartridge, replayValue);
      if (!outcome?.ok) throw new Error(`verifyReplay reported failure: ${outcome?.error?.message ?? 'unknown error'}`);
    });
  }
  if (caps.rewind) {
    await check('capabilities.rewind: rewindRun() reconstructs an earlier state', () => {
      if (typeof core.rewindRun !== 'function') throw new Error('capabilities.rewind is true but rewindRun is missing');
      if (runA.turn < 1 || !dispatchedEntry) throw new Error('need at least one dispatched turn to verify rewind');
      const rewound = core.rewindRun(runA, 1);
      const actual = digest(clone(rewound.state));
      if (actual !== dispatchedEntry.before) throw new Error('rewound state digest does not match the pre-dispatch digest');
    });
  }
  if (caps.solve) {
    await check('capabilities.solve: solve()/isGoal() report a status', () => {
      if (typeof core.solve !== 'function' || typeof core.isGoal !== 'function') throw new Error('capabilities.solve is true but solve/isGoal are missing');
      if (typeof core.isGoal(runA) !== 'boolean') throw new Error('isGoal must return a boolean');
      const outcome = core.solve(cartridge, {seed});
      if (typeof outcome?.status !== 'string') throw new Error('solve must return an object with a string .status');
    });
  }

  await check(`twin determinism across up to ${maxSteps} steps`, () => {
    const left = core.createRun(cartridge, {seed});
    const right = core.createRun(cartridge, {seed});
    for (let step = 0; step < maxSteps; step++) {
      const leftActions = core.availability(left), rightActions = core.availability(right);
      if (canonical(leftActions) !== canonical(rightActions)) throw new Error(`twin runs diverge on available actions at step ${step}`);
      if (!leftActions.length) break;
      const leftEntry = core.dispatch(left, leftActions[0]);
      const rightEntry = core.dispatch(right, rightActions[0]);
      if (leftEntry.after !== rightEntry.after) throw new Error(`twin runs diverge on journal digest at step ${step}`);
      if (canonical(core.project(left)) !== canonical(core.project(right))) throw new Error(`twin runs diverge on projection at step ${step}`);
    }
  });

  return finish();
}
