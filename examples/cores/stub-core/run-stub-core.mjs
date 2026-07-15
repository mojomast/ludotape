#!/usr/bin/env node
// Demo: load the stub core, load its sample cartridge, run to completion,
// and print projections at every turn.
//
//   node examples/cores/stub-core/run-stub-core.mjs
import {createCore} from './core.mjs';
import cartridge from './stub-cartridge.mjs';

const core = createCore();
const compiled = core.loadCartridge(cartridge);
const run = core.createRun(compiled, {seed: 0});

console.log(`Loaded cartridge ${compiled.identity.slice(0, 12)} (${compiled.format})`);
console.log('Initial projection:', core.project(run));

while (core.availability(run).length) {
  const [action] = core.availability(run);
  const entry = core.dispatch(run, action);
  console.log(`Turn ${entry.index}: ${action.type} ->`, core.project(run));
}

console.log('Final projection:', core.project(run));
console.log('Goal reached:', core.isGoal(run));
