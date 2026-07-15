import test from 'node:test';
import assert from 'node:assert/strict';
import {
  availability,
  createReplay,
  createRun,
  digest,
  dispatch,
  project,
  solve,
  verifyReplay
} from '../src/index.mjs';
import cartridge from '../examples/basic-counter.mjs';

function playToCompletion(seed = 0) {
  const run = createRun(cartridge, {seed});
  for (let turn = 0; turn < 3; turn++) {
    assert.deepEqual(availability(run), [{type: 'increment'}]);
    dispatch(run, {type: 'increment'});
  }
  assert.deepEqual(availability(run), []);
  return run;
}

test('basic counter documents the complete game lifecycle', () => {
  const run = createRun(cartridge, {seed: 0});
  assert.deepEqual(availability(run), [{type: 'increment'}]);

  for (let count = 1; count <= 3; count++) {
    const entry = dispatch(run, {type: 'increment'});
    assert.equal(entry.index, count - 1);
    assert.deepEqual(project(run), {
      complete: count === 3,
      count,
      target: 3
    });
  }

  assert.deepEqual(availability(run), []);
  const replay = createReplay(run);
  const verification = verifyReplay(cartridge, replay);
  assert.equal(verification.ok, true);
  assert.equal(verification.turns, 3);
});

test('basic counter is deterministic for the same seed and actions', () => {
  const first = playToCompletion(7);
  const second = playToCompletion(7);
  assert.equal(digest(first.state), digest(second.state));
  assert.deepEqual(createReplay(first), createReplay(second));
});

test('basic counter can be solved within its documented bounds', () => {
  const result = solve(cartridge, {seed: 0, maxDepth: 3, maxNodes: 100});
  assert.equal(result.status, 'solved');
  assert.equal(result.depth, 3);
  assert.deepEqual(result.actions, [
    {type: 'increment'},
    {type: 'increment'},
    {type: 'increment'}
  ]);
});
