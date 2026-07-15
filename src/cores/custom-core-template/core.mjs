// ============================================================================
// Ludotape Custom Core Template
// ============================================================================
// This is a WORKING reference implementation of the Ludotape ICore contract
// (see CORE_SPEC.md) for a completely custom, declarative cartridge format:
// 'ludotape/custom-cartridge@1'. It interprets a tiny document shape:
//
//   {start?: number, target: number, step?: number}
//
// ...meaning "increment a counter from `start` to `target`, `step` at a
// time". This is intentionally trivial so the CONTROL FLOW (how a core
// plugs into the loader/registry/CLI/conformance suite) is easy to see.
//
// TO ADAPT THIS TEMPLATE FOR YOUR OWN FORMAT:
//   1. Copy this whole directory (see README.md for exact steps).
//   2. Replace `normalizeDocument` with parsing/validating YOUR document.
//   3. Replace `initialState`, `computeActions`, and `transition` with YOUR
//      rules. These three functions are the entire "engine".
//   4. Replace `project` with YOUR renderer-neutral view shape.
//   5. Update `metadata` (id/version/name/capabilities/cartridgeFormats) and
//      the matching core.manifest.json.
//   6. If your rules can branch, replace the greedy `solve` with a real
//      search (see src/index.mjs's `solve` for a bounded BFS reference).
//
// Every TODO marker below is a concrete extension point.
//
// This core intentionally does NOT delegate to defineGame/compileCartridge/
// createRun from ../../index.mjs (those implement the *built-in* JS/TS
// cartridge format, 'ludotape/cartridge@1'). Instead it reuses only the
// low-level, format-agnostic primitives -- canonical values, digests,
// cloning, freezing, and the deterministic RNG -- to build its own run
// lifecycle from scratch. That is the pattern any custom core follows.
import {canonical, digest, clone, deepFreeze, createRng, LudotapeError} from '../../index.mjs';

const CORE_FORMAT = 'ludotape/core@1';
const CARTRIDGE_FORMAT = 'ludotape/custom-cartridge@1';

function bad(code, message, details) { throw new LudotapeError(code, message, details); }

// ---------------------------------------------------------------------------
// Cartridge loading
// ---------------------------------------------------------------------------
// TODO: replace this with parsing/validating YOUR declarative document shape.
function normalizeDocument(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) bad('E_CORE_CARTRIDGE', 'custom cartridge document must be an object');
  const start = raw.start ?? 0, target = raw.target, step = raw.step ?? 1;
  if (!Number.isSafeInteger(start)) bad('E_CORE_CARTRIDGE', 'document.start must be a safe integer');
  if (!Number.isSafeInteger(target) || target < start) bad('E_CORE_CARTRIDGE', 'document.target must be a safe integer >= start');
  if (!Number.isSafeInteger(step) || step <= 0) bad('E_CORE_CARTRIDGE', 'document.step must be a positive safe integer');
  return {start, target, step};
}
function compile(document) {
  const doc = deepFreeze(clone(document));
  const identity = digest({format: CARTRIDGE_FORMAT, document: doc});
  return deepFreeze({format: CARTRIDGE_FORMAT, identity, document: doc});
}
function loadCartridge(source) {
  // `source` may be: a module namespace / plain object with a `document`
  // property (authoring shape), or an already-compiled custom cartridge
  // (format + identity + document already present -- trusted, not re-signed).
  const raw = source?.default ?? source?.cartridge ?? source;
  if (!raw || typeof raw !== 'object') bad('E_CORE_CARTRIDGE', 'cartridge source must be an object or module namespace');
  if (raw.format === CARTRIDGE_FORMAT && typeof raw.identity === 'string' && raw.document) {
    return compile(normalizeDocument(raw.document));
  }
  return compile(normalizeDocument(raw.document ?? raw));
  // TODO: if your format supports separate "rules" + "document" like the
  // built-in cartridge, fold a rules digest into the identity snapshot too.
}

// ---------------------------------------------------------------------------
// Run lifecycle
// ---------------------------------------------------------------------------
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
// TODO: replace with YOUR initial state derived from the document.
function initialState(document) { return {value: document.start}; }
function createRun(cartridge, {seed = 0} = {}) {
  if (!cartridge?.identity || cartridge.format !== CARTRIDGE_FORMAT) bad('E_CORE_CARTRIDGE', 'compiled custom cartridge required');
  // TODO: consume `rng` here if your setup rules need randomness.
  const rng = createRng(seed);
  const state = initialState(cartridge.document);
  return publicRun({cartridge, seed, state, rngState: rng.state, turn: 0, journal: []});
}

// TODO: replace with YOUR rules for legal actions given (document, state).
function computeActions(document, state) {
  return state.value < document.target ? [{type: 'increment'}] : [];
}
function availability(run) {
  const d = runData(run);
  return clone(computeActions(d.cartridge.document, d.state));
}
function sameAction(a, b) { return canonical(a) === canonical(b); }

// TODO: replace with YOUR transition rules. `rng` is a deterministic RNG
// scoped to this single transition -- never use Math.random/Date.now.
function transition(document, state, action, rng) {
  if (action.type !== 'increment') bad('E_CORE_CARTRIDGE', `unsupported action type '${action.type}'`);
  return {value: state.value + document.step};
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

// TODO: replace with YOUR renderer-neutral projection shape.
function project(run, adapter) {
  const d = runData(run);
  const view = deepFreeze({value: d.state.value, target: d.cartridge.document.target, complete: d.state.value >= d.cartridge.document.target});
  if (!adapter) return view;
  const info = deepFreeze({cartridge: {identity: d.cartridge.identity}, seed: clone(d.seed), turn: d.turn, stateDigest: digest(d.state)});
  return adapter(view, info);
}

function isGoal(run) {
  const d = runData(run);
  return d.state.value >= d.cartridge.document.target;
}

// ---------------------------------------------------------------------------
// Solve (capabilities.solve: true)
// ---------------------------------------------------------------------------
// This template's format has exactly one action available per state, so a
// greedy walk to the goal is equivalent to an exhaustive search. TODO: for a
// branching ruleset, replace this with a real bounded BFS/DFS (see
// src/index.mjs's `solve` for a reference bounded-queue implementation).
function solve(cartridge, options = {}) {
  const seed = options.seed ?? 0;
  const maxDepth = Number.isSafeInteger(options.maxDepth) ? options.maxDepth : 1000;
  const maxNodes = Number.isSafeInteger(options.maxNodes) ? options.maxNodes : 100000;
  const run = createRun(cartridge, {seed});
  const path = [];
  let visited = 0;
  while (!isGoal(run)) {
    if (visited >= maxNodes || path.length >= maxDepth) return {status: 'bounded', actions: null, visited, generated: visited, depth: null};
    const actions = availability(run);
    if (!actions.length) return {status: 'unsolved', actions: null, visited, generated: visited, depth: null};
    dispatch(run, actions[0]);
    path.push(actions[0]);
    visited++;
  }
  return {status: 'solved', actions: path, state: clone(runData(run).state), visited, generated: visited, depth: path.length};
}

// ---------------------------------------------------------------------------
// Replay & rewind (capabilities.replay / capabilities.rewind: true)
// ---------------------------------------------------------------------------
function createReplay(run) {
  const d = runData(run);
  return clone({
    format: 'ludotape/custom-replay@1', cartridge: d.cartridge.identity, seed: d.seed,
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
// Rewind reconstructs a fresh run and replays the retained journal prefix --
// the same "journal reconstruction" strategy src/index.mjs uses for rewindRun.
function rewindRun(run, turns = 1) {
  const d = runData(run);
  if (!Number.isSafeInteger(turns) || turns < 0 || turns > d.turn) bad('E_REWIND', `turns must be a safe integer from 0 to ${d.turn}`);
  const target = d.turn - turns;
  const rebuilt = createRun(d.cartridge, {seed: d.seed});
  for (let i = 0; i < target; i++) dispatch(rebuilt, d.journal[i].action);
  return rebuilt;
}

// ---------------------------------------------------------------------------
// Metadata & core factory
// ---------------------------------------------------------------------------
const metadata = deepFreeze({
  format: CORE_FORMAT,
  id: 'ludotape/custom-core-template',
  version: '0.2.0',
  name: 'Custom Core Template',
  description: 'Reference skeleton for authoring custom Ludotape cores.',
  // Honest capability set for what THIS skeleton actually implements. This
  // format has no branching, no scenario runner, so `scenarios` stays false.
  capabilities: {replay: true, rewind: true, solve: true, scenarios: false},
  cartridgeFormats: [CARTRIDGE_FORMAT]
});

/** Factory: returns a fresh ICore instance. May be called multiple times. */
export function createCore() {
  return {
    metadata,
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
    // TODO: add init(host)/teardown() here if your core needs setup/teardown
    // (host = {log(...)}, called once at registration/deregistration).
  };
}

/** Convenience instance for direct import (`import core from './core.mjs'`). */
export default createCore();
