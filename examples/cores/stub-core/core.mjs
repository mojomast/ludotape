// A tiny, WORKING example custom core: a fixed-length tape counter.
//
// Cartridge format: 'example/stub-cartridge@1', document {length: number}.
// State advances a `position` from 0 to `document.length` one step at a
// time via a single `{type: 'advance'}` action. See stub-cartridge.mjs for a
// sample compiled cartridge and run-stub-core.mjs for a runnable demo.
//
// This mirrors the pattern documented in
// src/cores/custom-core-template/README.md, just for a different toy format.
import {canonical, digest, clone, deepFreeze, createRng, LudotapeError} from '../../../src/index.mjs';

const CORE_FORMAT = 'ludotape/core@1';
const CARTRIDGE_FORMAT = 'example/stub-cartridge@1';

function bad(code, message, details) { throw new LudotapeError(code, message, details); }

function normalizeDocument(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) bad('E_CORE_CARTRIDGE', 'stub cartridge document must be an object');
  const length = raw.length;
  if (!Number.isSafeInteger(length) || length < 0) bad('E_CORE_CARTRIDGE', 'document.length must be a non-negative safe integer');
  return {length};
}
function compile(document) {
  const doc = deepFreeze(clone(document));
  const identity = digest({format: CARTRIDGE_FORMAT, document: doc});
  return deepFreeze({format: CARTRIDGE_FORMAT, identity, document: doc});
}
function loadCartridge(source) {
  const raw = source?.default ?? source?.cartridge ?? source;
  if (!raw || typeof raw !== 'object') bad('E_CORE_CARTRIDGE', 'cartridge source must be an object or module namespace');
  // Already-compiled cartridges (like stub-cartridge.mjs's default export)
  // are trusted as-is -- cores/cartridges are trusted code, not sandboxed.
  if (raw.format === CARTRIDGE_FORMAT && typeof raw.identity === 'string' && raw.document) return deepFreeze(clone(raw));
  return compile(normalizeDocument(raw.document ?? raw));
}

const RUNS = new WeakMap();
function runData(run) {
  const d = RUNS.get(run);
  if (!d) bad('E_CORE', 'valid run required');
  return d;
}
function publicRun(d) {
  const run = {};
  Object.defineProperties(run, {
    cartridge: {value: d.cartridge, enumerable: true},
    seed: {value: clone(d.seed), enumerable: true},
    state: {enumerable: true, get: () => clone(d.state)},
    journal: {enumerable: true, get: () => clone(d.journal)},
    turn: {enumerable: true, get: () => d.turn}
  });
  Object.freeze(run);
  RUNS.set(run, d);
  return run;
}
function createRun(cartridge, {seed = 0} = {}) {
  if (!cartridge?.identity || cartridge.format !== CARTRIDGE_FORMAT) bad('E_CORE_CARTRIDGE', 'compiled stub cartridge required');
  const rng = createRng(seed);
  return publicRun({cartridge, seed, state: {position: 0}, rngState: rng.state, turn: 0, journal: []});
}

function computeActions(document, state) {
  return state.position < document.length ? [{type: 'advance'}] : [];
}
function availability(run) {
  const d = runData(run);
  return clone(computeActions(d.cartridge.document, d.state));
}
function sameAction(a, b) { return canonical(a) === canonical(b); }
function transition(document, state, action) {
  if (action.type !== 'advance') bad('E_CORE_CARTRIDGE', `unsupported action type '${action.type}'`);
  return {position: state.position + 1};
}
function dispatch(run, action) {
  const d = runData(run);
  const legal = computeActions(d.cartridge.document, d.state);
  if (!legal.some(x => sameAction(x, action))) bad('E_ILLEGAL_ACTION', 'action is not currently available', {action: clone(action), legal});
  const before = digest(d.state);
  const rng = createRng(0, d.rngState);
  const next = clone(transition(d.cartridge.document, clone(d.state), clone(action), rng));
  const entry = deepFreeze({index: d.turn, action: clone(action), before, after: digest(next), rngBefore: d.rngState, rngAfter: rng.state});
  d.state = next; d.rngState = rng.state; d.turn++; d.journal.push(entry);
  return clone(entry);
}
function project(run, adapter) {
  const d = runData(run);
  const view = deepFreeze({position: d.state.position, length: d.cartridge.document.length, complete: d.state.position >= d.cartridge.document.length});
  if (!adapter) return view;
  const info = deepFreeze({cartridge: {identity: d.cartridge.identity}, seed: clone(d.seed), turn: d.turn, stateDigest: digest(d.state)});
  return adapter(view, info);
}
function isGoal(run) {
  const d = runData(run);
  return d.state.position >= d.cartridge.document.length;
}
function solve(cartridge, options = {}) {
  const seed = options.seed ?? 0;
  const maxDepth = Number.isSafeInteger(options.maxDepth) ? options.maxDepth : 1000;
  const run = createRun(cartridge, {seed});
  const path = [];
  let visited = 0;
  while (!isGoal(run)) {
    if (path.length >= maxDepth) return {status: 'bounded', actions: null, visited, generated: visited, depth: null};
    const actions = availability(run);
    if (!actions.length) return {status: 'unsolved', actions: null, visited, generated: visited, depth: null};
    dispatch(run, actions[0]);
    path.push(actions[0]);
    visited++;
  }
  return {status: 'solved', actions: path, state: clone(runData(run).state), visited, generated: visited, depth: path.length};
}
function createReplay(run) {
  const d = runData(run);
  return clone({
    format: 'example/stub-replay@1', cartridge: d.cartridge.identity, seed: d.seed,
    initial: d.journal.length ? d.journal[0].before : digest(d.state),
    actions: d.journal.map(x => x.action), checkpoints: d.journal.map(x => x.after), final: digest(d.state)
  });
}
function verifyReplay(cartridge, replayValue) {
  try {
    const clean = clone(replayValue);
    if (clean.cartridge !== cartridge.identity) bad('E_IDENTITY', 'cartridge identity mismatch');
    const run = createRun(cartridge, {seed: clean.seed});
    for (let i = 0; i < clean.actions.length; i++) {
      const entry = dispatch(run, clean.actions[i]);
      if (clean.checkpoints[i] !== entry.after) bad('E_CHECKPOINT', `checkpoint ${i} mismatch`);
    }
    if (digest(runData(run).state) !== clean.final) bad('E_FINAL', 'final state mismatch');
    return {ok: true, turns: run.turn, final: clean.final, run};
  } catch (error) {
    return {ok: false, error: {code: error.code ?? 'E_UNKNOWN', message: error.message}};
  }
}
function rewindRun(run, turns = 1) {
  const d = runData(run);
  if (!Number.isSafeInteger(turns) || turns < 0 || turns > d.turn) bad('E_REWIND', `turns must be a safe integer from 0 to ${d.turn}`);
  const target = d.turn - turns;
  const rebuilt = createRun(d.cartridge, {seed: d.seed});
  for (let i = 0; i < target; i++) dispatch(rebuilt, d.journal[i].action);
  return rebuilt;
}

const metadata = deepFreeze({
  format: CORE_FORMAT,
  id: 'example/stub-core',
  version: '0.2.0',
  name: 'Stub Core',
  description: 'Minimal example custom core: a fixed-length tape counter.',
  capabilities: {replay: true, rewind: true, solve: true, scenarios: false},
  cartridgeFormats: [CARTRIDGE_FORMAT]
});

export function createCore() {
  return {metadata, loadCartridge, createRun, availability, dispatch, project, isGoal, solve, createReplay, verifyReplay, rewindRun};
}
export default createCore();
