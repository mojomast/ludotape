import test from 'node:test';
import assert from 'node:assert/strict';
import {
  LudotapeError, canonical, compileCartridge, createReplay, createRng,
  defineCartridge, defineGame, dispatch, rewindRun, runActions
} from '../src/index.mjs';

const gameSpec = {
  id: 'authoring-core',
  version: '1',
  metadata: {genre: 'test'},
  initialState: ({rng}) => ({rolls: [rng.die(12)]}),
  actions: state => state.rolls.length < 5 ? [{type: 'roll'}] : [],
  transition: (state, action, {rng}) => ({rolls: [...state.rolls, rng.die(12)]}),
  project: state => state
};
const document = {title: 'Authoring Core'};
const cartridge = defineCartridge({...gameSpec, document});
const rolls = count => Array.from({length: count}, () => ({type: 'roll'}));
const code = (fn, wanted) => assert.throws(fn, error => error instanceof LudotapeError && error.code === wanted);

test('defineCartridge is identity- and behavior-equivalent to the explicit composition', () => {
  const explicit = compileCartridge(defineGame(gameSpec), document);
  assert.equal(cartridge.identity, explicit.identity);
  assert.deepEqual(runActions(cartridge, rolls(3), {seed: 91}).state, runActions(explicit, rolls(3), {seed: 91}).state);
});

test('defineCartridge reports invalid inputs with stable E_GAME errors', () => {
  for (const input of [null, false, 1, 'game', [], () => ({})]) {
    code(() => defineCartridge(input), 'E_GAME');
  }
});

test('runActions has golden seeded repeatability', () => {
  const first = runActions(cartridge, rolls(3), {seed: 42});
  const second = runActions(cartridge, rolls(3), {seed: 42});
  assert.deepEqual(first.state, {rolls: [8, 6, 11, 9]});
  assert.deepEqual(createReplay(first), createReplay(second));
  assert.equal(first.turn, 3);
});

test('runActions reports the failing index, turn, action, and canonical-safe cause', () => {
  assert.throws(
    () => runActions(cartridge, [{type: 'roll'}, {type: 'nope'}], {seed: 4}),
    error => {
      assert.equal(error.code, 'E_ACTION_SCRIPT');
      assert.equal(error.details.index, 1);
      assert.equal(error.details.turn, 1);
      assert.deepEqual(error.details.action, {type: 'nope'});
      assert.equal(error.details.cause.code, 'E_ILLEGAL_ACTION');
      assert.match(error.details.cause.message, /not currently available/);
      assert.doesNotThrow(() => canonical(error.details));
      return true;
    }
  );
});

test('runActions rejects sparse and over-limit scripts with E_ACTION_SCRIPT', () => {
  const sparse = new Array(1);
  code(() => runActions(cartridge, sparse), 'E_ACTION_SCRIPT');
  code(() => runActions(cartridge, rolls(2), {maxActions: 1}), 'E_ACTION_SCRIPT');
  code(() => runActions(cartridge, [], {maxActions: 1.5}), 'E_ACTION_SCRIPT');
});

test('rewindRun reconstructs a separate earlier run and preserves RNG continuation', () => {
  const original = runActions(cartridge, rolls(3), {seed: 'rewind'});
  const rewound = rewindRun(original, 1);
  assert.notEqual(rewound, original);
  assert.equal(rewound.turn, 2);
  assert.equal(original.turn, 3);
  dispatch(rewound, {type: 'roll'});
  assert.deepEqual(rewound.state, original.state);
  assert.deepEqual(rewound.journal, original.journal);
});

test('rewindRun validates turn bounds with E_REWIND', () => {
  const run = runActions(cartridge, rolls(2));
  for (const turns of [-1, 3, 0.5, Number.MAX_SAFE_INTEGER + 1]) code(() => rewindRun(run, turns), 'E_REWIND');
  code(() => rewindRun({}), 'E_REWIND');
  assert.equal(rewindRun(run, 0).turn, run.turn);
  assert.equal(rewindRun(run, run.turn).turn, 0);
});

test('rewindRun verifies RNG consumption while rebuilding the initial state', () => {
  let calls = 0;
  const nondeterministic = defineCartridge({
    id: 'nondeterministic-initial-rng', version: '1',
    initialState: ({rng}) => {
      rng.next();
      if (calls++ > 0) rng.next();
      return {ready: true};
    },
    actions: () => [{type: 'wait'}],
    transition: state => state
  });
  const untouched = runActions(nondeterministic, [], {seed: 12});
  code(() => rewindRun(untouched, 0), 'E_REWIND');

  calls = 0;
  const advanced = runActions(nondeterministic, [{type: 'wait'}], {seed: 12});
  code(() => rewindRun(advanced, 1), 'E_REWIND');
});

test('RNG shuffle is nonmutating and follows a stable golden sequence', () => {
  const input = [1, 2, 3, 4, 5];
  const rng = createRng(0);
  const shuffled = rng.shuffle(input);
  assert.deepEqual(shuffled, [5, 3, 4, 1, 2]);
  assert.deepEqual(input, [1, 2, 3, 4, 5]);
  assert.notEqual(shuffled, input);
  assert.equal(rng.die(), 3);
  assert.deepEqual(rng.dice(8, 4), [5, 5, 6, 4]);
});

test('RNG helper consumption and bounds are stable', () => {
  const shuffled = createRng(7), advanced = createRng(7);
  shuffled.shuffle([1, 2, 3, 4]);
  for (let index = 0; index < 3; index++) advanced.next();
  assert.equal(shuffled.state, advanced.state);
  assert.equal(shuffled.next(), advanced.next());

  const emptyDice = createRng(3), untouched = createRng(3);
  assert.deepEqual(emptyDice.dice(6, 0), []);
  assert.equal(emptyDice.state, untouched.state);
  assert.ok(createRng(1).die(1) === 1);
  for (const sides of [0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1]) {
    code(() => createRng().die(sides), 'E_RNG');
    code(() => createRng().dice(sides, 1), 'E_RNG');
  }
  for (const count of [-1, 1.5, 100001, Number.MAX_SAFE_INTEGER + 1]) code(() => createRng().dice(6, count), 'E_RNG');
  assert.equal(createRng().dice(1, 100000).length, 100000);
  code(() => createRng().shuffle({length: 0}), 'E_RNG');
});
