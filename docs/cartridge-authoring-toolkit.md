# Cartridge authoring toolkit

The `ludotape/authoring` subpath turns action scripts into inspectable traces, checks exact scenario expectations, and explores a bounded part of a cartridge's action tree. These tools execute trusted cartridge JavaScript; they are not a sandbox.

For a source checkout, replace package imports with `../src/authoring.mjs` (from `examples/`) or `./src/authoring.mjs` (from the repository root).

## Simulate an action script

`simulateActions(cartridge, options?)` starts a fresh run, observes it before and after every action, creates a replay, verifies that replay, and returns a deeply frozen canonical result. It does not inject state: every state is reached from `initialState` by dispatching available actions.

This command is runnable at the repository root:

```sh
node --input-type=module <<'EOF'
import cartridge from './examples/basic-counter.mjs';
import {simulateActions} from './src/authoring.mjs';

const trace = simulateActions(cartridge, {
  seed: 0,
  actions: [{type: 'increment'}]
});

console.log(trace.format);                    // ludotape/authoring-trace@1
console.log(trace.observations[0].state);     // { count: 0 }
console.log(trace.observations[1].state);     // { count: 1 }
console.log(trace.observations[1].projection);// { complete: false, count: 1, target: 3 }
console.log(trace.verified);                  // true
EOF
```

The result has this shape:

```js
{
  format: 'ludotape/authoring-trace@1',
  seed,
  actions,
  observations: [
    {step, state, stateDigest, availability, projection}
  ],
  replay,       // unchanged ludotape/replay@1 format
  verified: true
}
```

Defaults are `seed: 0`, `actions: []`, and `maxActions: 10000`. `maxActions` may be `0..100000`. An invalid action array produces `E_AUTHORING_ACTIONS`; invalid/exceeded bounds produce `E_AUTHORING_LIMIT`. Dispatch and observation failures throw a `LudotapeError` with a step in `details`. A generated replay that unexpectedly fails verification produces `E_AUTHORING_REPLAY`.

For a simpler script runner that returns the final live run without observations, use core `runActions()` instead.

## Write exact scenarios

A scenario is canonical protocol data. It starts from the cartridge's real initial state and may contain an `actions` array or a `steps` array—never both. Omitting both runs a zero-action scenario, which is useful for checking initial expectations. Expectations are exact canonical equality, not partial-object matching.

Create `examples/my-counter.scenarios.mjs`:

```js
export const scenarios = [
  {
    name: 'count to the target',
    seed: 0,
    initial: {
      state: {count: 0},
      availability: [{type: 'increment'}],
      projection: {complete: false, count: 0, target: 3}
    },
    steps: [
      {
        action: {type: 'increment'},
        expect: {
          state: {count: 1},
          projection: {complete: false, count: 1, target: 3}
        }
      },
      {action: {type: 'increment'}},
      {action: {type: 'increment'}}
    ],
    expect: {
      state: {count: 3},
      availability: [],
      projection: {complete: true, count: 3, target: 3}
    }
  }
];

export default scenarios;
```

Run it programmatically:

```sh
node --input-type=module <<'EOF'
import cartridge from './examples/basic-counter.mjs';
import scenarios from './examples/basic-counter.scenarios.mjs';
import {runScenario, runScenarios} from './src/authoring.mjs';

const one = runScenario(cartridge, scenarios[0]);
const all = runScenarios(cartridge, scenarios);
console.log(one.ok, one.name); // true count to the target
console.log(all.ok, all.diagnostics.length); // true 0
EOF
```

Scenario fields are exactly:

- `name`: optional; a non-empty string overrides the fallback name, otherwise the fallback is used.
- `seed`: optional programmatic seed; default `0`.
- `actions`: an action array, for final-only checks.
- `steps`: `{action, expect?}` entries. Instead of `expect`, a step may put expectation keys inline.
- `initial`: expectations for observation step `0`.
- `expect`: expectations for the final observation.
- `maxActions`: the simulation bound; default `10000`.

An expectation can contain only `state`, `stateDigest`, `availability`, and `projection`. If a key is present, its complete value must match canonically. A step cannot combine `expect` with inline expectation keys.

`runScenario()` and `runScenarios()` return failures rather than throwing for malformed declarations, execution failures, and mismatches. One result is `{ok, name, diagnostics, trace}`; an aggregate is `{ok, results, diagnostics}`. Diagnostics include `severity`, `code`, `scenario`, `step`, `path`, and `message`; mismatches also include `expected` and `actual`. `trace` is `null` if execution could not complete. Common codes are `E_SCENARIO_SHAPE`, `E_SCENARIO_EXPECTATION`, `E_SCENARIO_MISMATCH`, and the underlying execution code such as `E_ILLEGAL_ACTION`.

The checked-in [`basic-counter.scenarios.mjs`](../examples/basic-counter.scenarios.mjs) is the complete executable example.

## Explore bounded behavior

`checkCartridge()` breadth-first explores available canonical actions in their returned order. For each reached path it runs twin simulations, compares observations and replay, verifies replayability, and observes canonical state, availability, and projection.

```sh
node --input-type=module <<'EOF'
import cartridge from './examples/basic-counter.mjs';
import {checkCartridge} from './src/authoring.mjs';

const report = checkCartridge(cartridge, {
  seeds: [0],
  maxDepth: 1,
  maxPaths: 2,
  maxActionsPerState: 10
});

console.log(report.ok, report.errors, report.warnings); // true 0 1
console.log(report.coverage.paths);                     // 2
console.log(report.diagnostics[0].code);                // W_COVERAGE_DEPTH
EOF
```

Defaults are `seeds: [0]`, `maxDepth: 2`, `maxPaths: 100`, and `maxActionsPerState: 100`. Limits and ceilings are:

| Option | Allowed |
| --- | --- |
| `maxDepth` | `0..100` |
| `maxPaths` | `1..100000` |
| `maxActionsPerState` | `0..100000` |

`seeds` must be a non-empty array. Invalid seeds/bounds throw `E_AUTHORING_SEEDS` or `E_AUTHORING_LIMIT`.

The frozen report is:

```js
{
  ok,                 // true exactly when errors === 0
  diagnostics,        // errors and warnings
  coverage: {
    bounded: true,
    seeds, paths, transitions, // actually explored counts
    maxDepth, maxPaths, maxActionsPerState,
    depthLimited, pathLimited, actionLimited
  },
  errors,
  warnings
}
```

Errors include twin-execution differences (`E_CHECK_TWIN`), execution failures, projection failures (`E_CHECK_PROJECTION`), and replay failures (`E_CHECK_REPLAY`). Warnings report duplicate actions and coverage truncation (`W_DUPLICATE_ACTION`, `W_COVERAGE_DEPTH`, `W_COVERAGE_PATHS`, `W_COVERAGE_ACTIONS`, and summary `W_COVERAGE_BOUNDED`). Duplicate canonical actions are reported but only one copy is explored.

A successful bounded report is **evidence, not proof**, of determinism or correctness. Counts describe work actually completed, and any `*Limited` flag or coverage warning identifies omitted behavior. Use representative seeds and bounds in continuous integration, then keep focused scenarios for important rules and regressions.

## CLI `check` and `test`

From a source checkout:

```sh
node bin/ludotape.mjs check examples/basic-counter.mjs 0 1 2
node bin/ludotape.mjs test examples/basic-counter.mjs examples/basic-counter.scenarios.mjs
```

With an installed package, use `ludotape` in place of `node bin/ludotape.mjs`.

```text
ludotape check cartridge.mjs [seed [depth [paths]]]
ludotape test cartridge.mjs scenarios.mjs
```

`check` accepts one signed 32-bit decimal seed and uses `maxActionsPerState: 100`; defaults are seed `0`, depth `2`, and paths `100`. `test` loads a default or named `scenarios` export. Both import a default or named `cartridge` export and print their complete JSON report to stdout.

Exit behavior:

- `check`: `0` when there are no error diagnostics, including when warnings exist; `1` for report errors or command/import/argument failures.
- `test`: `0` when every scenario passes; `1` for scenario, command, import, or argument failures.
- command/import/argument failures are printed as `CODE: message` on stderr instead of a JSON report.

`validate` remains a shallow initial-state/action check. Use `check` for bounded transition/projection/replay exploration and `test` for exact declared behavior.

## Testing practice and primary references

Keep action sequences as reviewable data, use descriptive scenario names, assert externally meaningful projections as well as key state, and add a scenario whenever fixing a regression. Do not copy generated state into an artificial starting point: replay from `initialState` so RNG consumption and action legality remain covered.

Useful primary references:

- [Node.js test runner](https://nodejs.org/api/test.html) for integrating programmatic reports into a test suite.
- [RFC 8259](https://www.rfc-editor.org/rfc/rfc8259) for the underlying JSON data model (Ludotape's canonical-value contract is intentionally stricter).
- [W3C Trace Context](https://www.w3.org/TR/trace-context/) as an example of treating serialized fields as a versioned interoperability protocol; Ludotape actions and replays should receive the same compatibility care.
