// Reference ICore implementation for `ludotape/cartridge@1`, delegating to ../../index.mjs.
// Zero dependencies. No Node-only imports — this module also runs in browsers.
// See /CORE_SPEC.md for the normative ICore contract this file implements.
import {
  LudotapeError,
  clone,
  deepFreeze,
  defineGame,
  compileCartridge,
  createRun as coreCreateRun,
  availability as coreAvailability,
  dispatch as coreDispatch,
  project as coreProject,
  createReplay as coreCreateReplay,
  verifyReplay as coreVerifyReplay,
  rewindRun as coreRewindRun,
  solve as coreSolve
} from '../../index.mjs';

const bad = (code, message, details) => { throw new LudotapeError(code, message, details); };

/** Reduce an arbitrary thrown value to a safe {code, message} pair without invoking getters that may throw. */
function safeCause(error) {
  let code = 'E_UNKNOWN', message = 'Unknown error';
  try { if (typeof error?.code === 'string') code = error.code; } catch {}
  try { if (typeof error?.message === 'string') message = error.message; else message = String(error); } catch {}
  return {code, message};
}

/**
 * Run a delegate call that may invoke a trusted-but-unpredictable game callback.
 * `LudotapeError`s (including their original `code`) pass through unchanged; any other thrown
 * value (a primitive, a hostile object, a foreign Error) surfaces as a coded `LudotapeError`.
 */
function guard(op, fn) {
  try { return fn(); }
  catch (error) {
    if (error instanceof LudotapeError) throw error;
    bad('E_CORE', `${op} failed`, {op, cause: safeCause(error)});
  }
}

const METADATA = deepFreeze({
  format: 'ludotape/core@1',
  id: 'ludotape/js-ts-core',
  version: '0.2.0',
  name: 'JavaScript/TypeScript Core',
  capabilities: {replay: true, rewind: true, solve: true, scenarios: true},
  cartridgeFormats: ['ludotape/cartridge@1']
});

/** True for a value that already looks like a compiled `ludotape/cartridge@1`. */
function isCompiledCartridge(value) {
  return !!value && typeof value === 'object' && !Array.isArray(value)
    && value.format === 'ludotape/cartridge@1'
    && typeof value.identity === 'string' && value.identity.length > 0;
}

/** Validate a candidate compiled cartridge, throwing `E_CORE_CARTRIDGE` for anything untrusted-shaped. */
function ensureCompiledCartridge(value, context) {
  if (!isCompiledCartridge(value)) bad('E_CORE_CARTRIDGE', `${context}: not a compiled ludotape/cartridge@1 object`);
  if (!Object.isFrozen(value)) bad('E_CORE_CARTRIDGE', `${context}: cartridge must be frozen`);
  if (!value.document || typeof value.document !== 'object' || !Object.isFrozen(value.document)) {
    bad('E_CORE_CARTRIDGE', `${context}: cartridge document must be frozen`);
  }
  const game = value.game;
  if (!game || typeof game.initialState !== 'function' || typeof game.actions !== 'function' || typeof game.transition !== 'function') {
    bad('E_CORE_CARTRIDGE', `${context}: cartridge game must expose initialState/actions/transition callbacks`);
  }
  return value;
}

/**
 * Load a cartridge from any of three accepted source shapes:
 *  (a) an already-compiled cartridge (frozen, `format: 'ludotape/cartridge@1'`, string `identity`);
 *  (b) a module namespace object exposing a compiled cartridge via `default` or `cartridge`;
 *  (c) a plain `{game, document}` object, where `game` is a `defineGame` result or a raw game
 *      specification, compiled via `defineGame`/`compileCartridge`.
 * Malformed input always throws a coded `LudotapeError('E_CORE_CARTRIDGE', ...)`, never a raw
 * TypeError. Synchronous — the ICore contract permits `loadCartridge` to be async, but this
 * reference implementation never needs to await anything.
 */
function loadCartridge(source) {
  if (!source || typeof source !== 'object' || Array.isArray(source)) {
    bad('E_CORE_CARTRIDGE', 'cartridge source must be an object');
  }
  // (a) already-compiled cartridge.
  if (isCompiledCartridge(source)) return ensureCompiledCartridge(source, 'compiled cartridge');
  // (b) module namespace object exposing `default` or `cartridge`.
  if (source.default !== undefined || source.cartridge !== undefined) {
    const inner = source.cartridge !== undefined ? source.cartridge : source.default;
    return ensureCompiledCartridge(inner, 'module cartridge export');
  }
  // (c) {game, document} — compile fresh via defineGame/compileCartridge.
  if (source.game !== undefined) {
    let game;
    try { game = defineGame(source.game); }
    catch (error) { bad('E_CORE_CARTRIDGE', 'invalid game specification for cartridge source', {cause: safeCause(error)}); }
    const document = source.document !== undefined ? source.document : {};
    let compiled;
    try { compiled = compileCartridge(game, document); }
    catch (error) { bad('E_CORE_CARTRIDGE', 'could not compile cartridge from game/document source', {cause: safeCause(error)}); }
    return ensureCompiledCartridge(compiled, 'compiled from game/document source');
  }
  bad('E_CORE_CARTRIDGE', 'unrecognized cartridge source: expected a compiled cartridge, a module namespace with a default/cartridge export, or a {game, document} object');
}

function createRun(cartridge, options = {}) {
  return guard('createRun', () => coreCreateRun(cartridge, options));
}
function availability(run) {
  return guard('availability', () => coreAvailability(run));
}
function dispatch(run, action) {
  return guard('dispatch', () => coreDispatch(run, action));
}
function project(run, adapter, options = {}) {
  if (adapter !== undefined && adapter !== null && typeof adapter !== 'function') {
    bad('E_CORE', 'project adapter must be a function if provided');
  }
  return guard('project', () => coreProject(run, adapter, options));
}
/** Boolean goal check, invoking the cartridge's `isGoal` callback the same way `solve()` does. */
function isGoal(run) {
  if (!run || typeof run !== 'object' || !run.cartridge) bad('E_CORE', 'a valid run is required');
  const goal = run.cartridge.game?.isGoal;
  if (typeof goal !== 'function') bad('E_CORE_CAPABILITY', 'cartridge has no isGoal callback');
  const context = deepFreeze({document: run.cartridge.document, seed: clone(run.seed), turn: run.turn});
  return guard('isGoal', () => Boolean(goal(clone(run.state), context)));
}
function solve(cartridge, options = {}) {
  if (!cartridge || typeof cartridge !== 'object') bad('E_CORE', 'a compiled cartridge is required');
  const hasGoal = typeof cartridge.game?.isGoal === 'function' || typeof options?.isGoal === 'function';
  if (!hasGoal) bad('E_CORE_CAPABILITY', 'cartridge has no isGoal callback and no options.isGoal override was provided');
  return guard('solve', () => coreSolve(cartridge, options));
}
function createReplay(run) {
  return guard('createReplay', () => coreCreateReplay(run));
}
function verifyReplay(cartridge, replay, options = {}) {
  if (!cartridge || typeof cartridge !== 'object') bad('E_CORE', 'a compiled cartridge is required');
  if (!replay || typeof replay !== 'object') bad('E_CORE', 'a replay object is required');
  // coreVerifyReplay never throws for replay-shape/mismatch failures — it reports {ok:false, error}.
  return coreVerifyReplay(cartridge, replay, options);
}
function rewindRun(run, turns = 1) {
  return guard('rewindRun', () => coreRewindRun(run, turns));
}

/** Factory returning a fresh, frozen `ICore` instance. May be called multiple times. */
export function createCore() {
  return Object.freeze({
    metadata: METADATA,
    loadCartridge,
    createRun,
    availability,
    dispatch,
    project,
    isGoal,
    solve,
    createReplay,
    verifyReplay,
    rewindRun
  });
}

export default createCore();
