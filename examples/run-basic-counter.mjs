import {
  availability,
  createReplay,
  createRun,
  dispatch,
  project,
  verifyReplay
} from '../src/index.mjs';
import {terminalAdapter} from '../src/adapters.mjs';
import cartridge from './basic-counter.mjs';

const run = createRun(cartridge, {seed: 0});
const render = terminalAdapter(text => process.stdout.write(text));

console.log('Initial view:');
project(run, render);

while (availability(run).length > 0) {
  const [action] = availability(run);
  dispatch(run, action);
  console.log(`After turn ${run.turn}:`);
  project(run, render);
}

const replay = createReplay(run);
const verification = verifyReplay(cartridge, replay);
if (!verification.ok) {
  throw new Error(`${verification.error.code}: ${verification.error.message}`);
}

console.log(JSON.stringify({
  final: project(run),
  replayVerified: true,
  turns: verification.turns
}, null, 2));
