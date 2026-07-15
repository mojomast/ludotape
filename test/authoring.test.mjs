import test from 'node:test';
import assert from 'node:assert/strict';
import {compileCartridge, defineGame, digest} from '../src/index.mjs';
import {checkCartridge, runScenario, runScenarios, simulateActions} from '../src/authoring.mjs';

const game = defineGame({
  id: 'authoring-counter',
  version: '1',
  initialState: ({seed}) => ({n: 0, seed}),
  actions: state => state.n < 2 ? [{type: 'add', amount: 1}, {type: 'add', amount: 2}] : [],
  transition: (state, action) => ({...state, n: state.n + action.amount}),
  project: state => ({text: `${state.n}`})
});
const cartridge = compileCartridge(game);

test('simulateActions captures initial and per-action observations', () => {
  const trace = simulateActions(cartridge, {seed: 7, actions: [{type: 'add', amount: 1}]});
  assert.equal(trace.format, 'ludotape/authoring-trace@1');
  assert.equal(trace.verified, true);
  assert.equal(trace.observations.length, 2);
  assert.deepEqual(trace.observations[0].state, {n: 0, seed: 7});
  assert.deepEqual(trace.observations[1].projection, {text: '1'});
  assert.equal(trace.observations[1].stateDigest, digest({n: 1, seed: 7}));
  assert.equal(trace.replay.format, 'ludotape/replay@1');
});

test('simulateActions returns a deeply frozen canonical-safe value', () => {
  const trace = simulateActions(cartridge);
  assert.ok(Object.isFrozen(trace));
  assert.ok(Object.isFrozen(trace.observations));
  assert.ok(Object.isFrozen(trace.observations[0].state));
  assert.doesNotThrow(() => JSON.stringify(trace));
});

test('simulateActions enforces action limits without partially executing', () => {
  assert.throws(
    () => simulateActions(cartridge, {actions: [{type: 'add', amount: 1}], maxActions: 0}),
    error => error.code === 'E_AUTHORING_LIMIT'
  );
});

test('runScenario checks exact canonical final expectations', () => {
  const result = runScenario(cartridge, {
    name: 'one turn', seed: 3,
    actions: [{type: 'add', amount: 1}],
    expect: {
      state: {seed: 3, n: 1},
      stateDigest: digest({n: 1, seed: 3}),
      availability: [{amount: 1, type: 'add'}, {amount: 2, type: 'add'}],
      projection: {text: '1'}
    }
  });
  assert.equal(result.ok, true);
  assert.deepEqual(result.diagnostics, []);
  assert.ok(Object.isFrozen(result));
});

test('runScenario supports initial and per-step expectations', () => {
  const result = runScenario(cartridge, {
    initial: {state: {n: 0, seed: 0}},
    steps: [{action: {type: 'add', amount: 2}, expect: {projection: {text: '2'}}}]
  });
  assert.equal(result.ok, true);
  assert.equal(result.name, 'scenario-1');
});

test('scenario mismatches are nonthrowing stable diagnostics with context', () => {
  const result = runScenario(cartridge, {
    name: 'wrong result',
    steps: [{action: {type: 'add', amount: 1}, expect: {state: {n: 99, seed: 0}}}]
  });
  assert.equal(result.ok, false);
  assert.deepEqual(result.diagnostics[0], {
    severity: 'error', code: 'E_SCENARIO_MISMATCH', scenario: 'wrong result', step: 1,
    path: 'state', message: 'state did not match',
    expected: {n: 99, seed: 0}, actual: {n: 1, seed: 0}
  });
});

test('scenario execution failures are returned rather than thrown', () => {
  const result = runScenario(cartridge, {name: 'illegal', actions: [{type: 'nope'}]});
  assert.equal(result.ok, false);
  assert.equal(result.diagnostics[0].scenario, 'illegal');
  assert.equal(result.diagnostics[0].path, 'execution');
  assert.equal(result.diagnostics[0].code, 'E_ILLEGAL_ACTION');
  assert.equal(result.diagnostics[0].step, 1);
  assert.equal(result.trace, null);
});

test('runScenarios preserves order, names anonymous scenarios, and aggregates diagnostics', () => {
  const result = runScenarios(cartridge, [
    {actions: []},
    {name: 'bad', expect: {projection: {text: 'no'}}}
  ]);
  assert.equal(result.ok, false);
  assert.equal(result.results[0].name, 'scenario-1');
  assert.equal(result.results[1].name, 'bad');
  assert.equal(result.diagnostics.length, 1);
});

test('runScenarios handles invalid input without throwing', () => {
  const result = runScenarios(cartridge, null);
  assert.equal(result.ok, false);
  assert.equal(result.diagnostics[0].code, 'E_SCENARIO_SHAPE');
});

test('checkCartridge explores twin executions and verifies projections and replays', () => {
  const result = checkCartridge(cartridge, {seeds: [0, 1], maxDepth: 1, maxPaths: 20});
  assert.equal(result.ok, true);
  assert.equal(result.errors, 0);
  assert.equal(result.coverage.seeds, 2);
  assert.ok(result.coverage.paths >= 2);
  assert.ok(result.coverage.transitions >= 2);
  assert.ok(result.diagnostics.some(item => item.code === 'W_COVERAGE_DEPTH'));
  assert.ok(Object.isFrozen(result.coverage));
});

test('checkCartridge reports duplicate canonical actions and explores one copy', () => {
  const duplicates = compileCartridge(defineGame({
    id: 'duplicates', version: '1', initialState: () => ({n: 0}),
    actions: state => state.n ? [] : [{type: 'go'}, {type: 'go'}],
    transition: () => ({n: 1}), project: state => state
  }));
  const result = checkCartridge(duplicates, {maxDepth: 1});
  assert.equal(result.ok, true);
  assert.ok(result.diagnostics.some(item => item.code === 'W_DUPLICATE_ACTION'));
  assert.equal(result.coverage.transitions, 1);
});

test('checkCartridge emits path, depth, and per-state coverage warnings', () => {
  const result = checkCartridge(cartridge, {maxDepth: 0, maxPaths: 1, maxActionsPerState: 1});
  assert.ok(result.diagnostics.some(item => item.code === 'W_COVERAGE_DEPTH'));
  const actionResult = checkCartridge(cartridge, {maxDepth: 1, maxPaths: 1, maxActionsPerState: 1});
  assert.ok(actionResult.diagnostics.some(item => item.code === 'W_COVERAGE_ACTIONS'));
  assert.ok(actionResult.diagnostics.some(item => item.code === 'W_COVERAGE_PATHS'));
  assert.equal(actionResult.coverage.actionLimited, true);
  assert.equal(actionResult.coverage.pathLimited, true);
});

test('checkCartridge catches nondeterministic twin execution as an error', () => {
  let calls = 0;
  const nondeterministic = compileCartridge(defineGame({
    id: 'nondeterministic-authoring-test', version: '1',
    initialState: () => ({value: 1}), actions: () => [],
    transition: state => state, project: state => ({...state, call: ++calls})
  }));
  const result = checkCartridge(nondeterministic, {maxDepth: 0});
  assert.equal(result.ok, false);
  assert.ok(result.diagnostics.some(item => item.code === 'E_CHECK_TWIN'));
});

test('checkCartridge validates bounds', () => {
  assert.throws(() => checkCartridge(cartridge, {maxDepth: -1}), error => error.code === 'E_AUTHORING_LIMIT');
  assert.throws(() => checkCartridge(cartridge, {seeds: 'no'}), error => error.code === 'E_AUTHORING_SEEDS');
});
