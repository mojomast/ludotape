// suggested package.json script — "benchmark:core": "node bench/core-dispatch.bench.mjs"
// (not wired here; package.json is owned by another work stream)
//
// Deterministic baseline comparing dispatch throughput:
//   (a) direct src/index.mjs createRun + dispatch loop
//   (b) the same cartridge driven through the js-ts core's ICore surface
//       (src/cores/js-ts-core/core.mjs)
//
// Fixed iteration counts only (no wall-clock-adaptive loops); timed with
// process.hrtime.bigint after an untimed warmup pass. Prints a stable-shape JSON
// summary: {benchmark:'core-dispatch', cases:[{name, dispatches, ms, opsPerSec}]}.
//
// If the js-ts core has not landed yet at bench-run time, this script prints a clear
// skip message and exits 0 so CI stays green until it does.
import {availability, createRun, defineCartridge, dispatch} from '../src/index.mjs';

const WARMUP_DISPATCHES = 500;
const DISPATCHES = 5000;

// Inline counter cartridge: always exactly two legal actions ('inc', 'reset'), so the
// dispatch loop never runs dry and never needs to recreate a run mid-measurement.
const counterCartridge = defineCartridge({
  id: 'bench/counter-dispatch',
  version: '1',
  initialState: () => ({count: 0}),
  actions: () => [{type: 'inc'}, {type: 'reset'}],
  transition: (state, action) => (action.type === 'reset' ? {count: 0} : {count: state.count + 1})
});

function elapsedMs(startNs, endNs) {
  return Number(endNs - startNs) / 1e6;
}

function toCase(name, dispatches, ms) {
  const seconds = ms / 1000;
  return {
    name,
    dispatches,
    ms: +ms.toFixed(3),
    opsPerSec: seconds > 0 ? +(dispatches / seconds).toFixed(1) : null
  };
}

function benchDirect() {
  // Untimed warmup.
  let run = createRun(counterCartridge, {seed: 0});
  for (let i = 0; i < WARMUP_DISPATCHES; i++) {
    const actions = availability(run);
    dispatch(run, actions[i % actions.length]);
  }
  // Timed pass on a fresh run.
  run = createRun(counterCartridge, {seed: 0});
  const start = process.hrtime.bigint();
  for (let i = 0; i < DISPATCHES; i++) {
    const actions = availability(run);
    dispatch(run, actions[i % actions.length]);
  }
  const end = process.hrtime.bigint();
  return toCase('direct-index', DISPATCHES, elapsedMs(start, end));
}

async function benchCore() {
  let coreModule;
  try {
    coreModule = await import('../src/cores/js-ts-core/core.mjs');
  } catch {
    return null;
  }
  const core = typeof coreModule.createCore === 'function' ? coreModule.createCore() : coreModule.default;
  if (!core || typeof core.createRun !== 'function' || typeof core.dispatch !== 'function') return null;

  const cartridge = typeof core.loadCartridge === 'function'
    ? await core.loadCartridge(counterCartridge)
    : counterCartridge;

  // Untimed warmup.
  let run = core.createRun(cartridge, {seed: 0});
  for (let i = 0; i < WARMUP_DISPATCHES; i++) {
    const actions = core.availability(run);
    core.dispatch(run, actions[i % actions.length]);
  }
  // Timed pass on a fresh run.
  run = core.createRun(cartridge, {seed: 0});
  const start = process.hrtime.bigint();
  for (let i = 0; i < DISPATCHES; i++) {
    const actions = core.availability(run);
    core.dispatch(run, actions[i % actions.length]);
  }
  const end = process.hrtime.bigint();
  return toCase('js-ts-core', DISPATCHES, elapsedMs(start, end));
}

const cases = [benchDirect()];
const coreCase = await benchCore();
if (coreCase) {
  cases.push(coreCase);
} else {
  console.log('Skipping js-ts-core case: src/cores/js-ts-core/core.mjs not available (or not yet ICore-shaped) at this runtime.');
}

console.log(JSON.stringify({benchmark: 'core-dispatch', cases}, null, 2));
