# API reference

## `ludotape`

- `canonical(value, limits?): string` — strict bounded canonical JSON; rejects hostile descriptors, sparse arrays, dangerous keys, cycles, and aliases.
- `sha256Text(text): string` — raw UTF-8 text SHA-256.
- `digest(value, limits?)` / `valueDigest(value, limits?)` — SHA-256 of the canonical **value**. Thus `digest(null) !== digest('null')`.
- `clone(value, limits?)` — canonical clone; `deepFreeze(value)` — recursively freezes data properties.
- `createRng(seed)` — deterministic `{next(), int(max), pick(items), shuffle(items), die(sides?), dice(sides, count), state}`.
- `defineGame(spec)`; `compileCartridge(game, document)` — validate rules and create a deeply frozen, identity-bound cartridge with `rulesDigest` and `rulesVersion`.
- `defineCartridge({...gameSpec, document?})` — shorthand exactly equivalent to `compileCartridge(defineGame(gameSpec), document)`; `document` defaults to `{}`.
- `createRun(cartridge, {seed?})` — opaque frozen facade. `state` and `journal` getters return isolated copies; `turn` is live.
- `availability(run)` / `legalActions(run)` — cloned legal actions.
- `dispatch(run, action)` — legal transactional transition and frozen journal entry.
- `runActions(cartridge, actions, {seed?, maxActions?})` — create a fresh run and dispatch a dense canonical action script in order.
- `rewindRun(run, turns?)` — reconstruct a separate run from its seed and journal; defaults to one turn and verifies state and RNG history while rebuilding.
- `project(run, adapter?, limits?)` — validates/freezes projection; adapter receives `(view, snapshotMetadata)`, never the run.
- `createReplay(run)` / `replay.create(run)` — isolated replay object.
- `createReplayCursor(cartridge, replay, limits?)` — frozen incremental replay controller with `turn`, `run`, `done`, `step()`, `stepAll()`, and `verify()`.
- `verifyReplay(cartridge, replay, limits?)` / `replay.verify(...)` — non-throwing `{ok,...}` for verification failures.
- `solve(cartridge, options?)` — bounded FIFO BFS. Options: `seed`, `maxDepth`, `maxNodes`, `maxActions`, `maxGenerated`, `maxQueue`, `maxStateBytes`, `isGoal`.
- `LudotapeError` — error class with stable `code` and optional `details`.

Only `initialState(context)` and `transition(state, action, context)` receive `context.rng`. Observational `actions`, `project`, and `isGoal` callbacks do not.

### RNG helpers

Programmatic seeds are safe integers, strings, booleans, or `null`; the default is `0`. RNG sequence consumption is part of deterministic rule behavior, so changing helper calls requires a rules-version bump.

| Helper | Result | Sequence values consumed |
| --- | --- | --- |
| `next()` | number in `[0, 1)` | 1 |
| `int(max)` | integer in `[0, max)` | 1 |
| `pick(items)` | one member of a non-empty array | 1 |
| `shuffle(items)` | shuffled shallow copy; input is unchanged | `max(items.length - 1, 0)` |
| `die(sides = 6)` | integer in `[1, sides]` | 1 |
| `dice(sides, count)` | array of `count` die results | exactly `count` |

`max` and `sides` must be positive safe integers. `pick` requires a non-empty array; `shuffle` requires an array. `count` must be a safe integer from `0` through `100000`. Violations throw `E_RNG`. `state` exposes the current unsigned internal state for inspection; game code should not persist or set it.

### Game definition

`defineGame(spec)` requires non-empty `id` and `version` strings plus function-valued `initialState`, `actions`, and `transition`. Optional `project` and `isGoal` values must be functions when present. `metadata` defaults to `{}`.

`compileCartridge(game, document = {})` clones and freezes the document and binds it to the rules identity. Cartridge modules used by the CLI export the compiled cartridge as either `default` or named `cartridge`:

```js
export const game = defineGame({...});
export const document = {...};
export const cartridge = compileCartridge(game, document);
export default cartridge;
```

`defineCartridge()` combines those first two calls:

```js
import {defineCartridge} from 'ludotape';

export default defineCartridge({
  id: 'example/counter',
  version: '1',
  document: {target: 3},
  initialState: () => ({count: 0}),
  actions: (state, {document}) => state.count < document.target ? [{type: 'increment'}] : [],
  transition: state => ({count: state.count + 1})
});
```

See [`examples/basic-counter.mjs`](../examples/basic-counter.mjs) for a complete definition and [`examples/run-basic-counter.mjs`](../examples/run-basic-counter.mjs) for run, projection, and replay usage.

### Action scripts and rewind

`runActions(cartridge, actions, {seed = 0, maxActions = 10000} = {})` accepts at most `100000` actions. `maxActions` is an integer from `0` to `100000`. Script shape, limit, cloning, or dispatch failures throw `E_ACTION_SCRIPT`; `error.details` contains `index`, `turn`, `action`, and a canonical-safe `{code, message}` cause. It returns the live run after the final action and does not create an authoring trace.

`rewindRun(run, turns = 1)` accepts a safe integer from `0` through `run.turn`. It does not mutate the input run. It recreates initial state and re-dispatches retained actions, checking initial state, RNG consumption, and each retained journal entry. Invalid input or reconstruction mismatch throws `E_REWIND`.

## Subpaths

```js
import {semanticAdapter, canvasAdapter, terminalAdapter} from 'ludotape/adapters';
import {createMemoryRepository, createStorageRepository, createIndexedDbRepository} from 'ludotape/storage';
import {createDraft, restoreDraft} from 'ludotape/editor';
import {checkCartridge, runScenario, runScenarios, simulateActions} from 'ludotape/authoring';
```

Repository methods are asynchronous: `put(key,value)`, `get(key)`, `delete(key)`, `list(prefix?)`, and `clear()`. Contract failures are `LudotapeError` values with stable `code` strings.

`createIndexedDbRepository(dbName, storeName, options?)` opens lazily and stores canonical JSON. Its `size` getter is asynchronous and resolves to the object-store count. The factory throws `E_IDB_UNAVAILABLE` immediately when IndexedDB is absent.

Drafts support `replace`, `update`, `undo`, `redo`, `historyLength`, `redoLength`, snapshots, and `markSaved()`. `restoreDraft(snapshot)` validates a `ludotape/draft@1` digest and resumes at the saved revision with empty history.

`terminalAdapter(writeFn, {depth?, indent?})` emits deterministic indented text. `semanticAdapter` emits ARIA tree/list roles, while `canvasAdapter` redraws its last frame when `ResizeObserver` reports a size change.

## `ludotape/authoring`

- `simulateActions(cartridge, {seed = 0, actions = [], maxActions = 10000} = {})` — returns a frozen `ludotape/authoring-trace@1` containing the action script, initial and post-action `{step, state, stateDigest, availability, projection}` observations, a standard `ludotape/replay@1`, and `verified: true`. `maxActions` is `0..100000`.
- `runScenario(cartridge, scenario, fallbackName?)` — scenario result `{ok, name, diagnostics, trace}`. Scenario fields are `name`, `seed`, exactly one of `actions`/`steps`, `initial`, `expect`, and `maxActions`. Expectations support only `state`, `stateDigest`, `availability`, and `projection`, compared by exact canonical equality.
- `runScenarios(cartridge, scenarios)` — ordered aggregate `{ok, results, diagnostics}`; anonymous names are `scenario-N`.
- `checkCartridge(cartridge, {seeds = [0], maxDepth = 2, maxPaths = 100, maxActionsPerState = 100} = {})` — twin-executes a breadth-first bounded action tree and returns `{ok, diagnostics, coverage, errors, warnings}`.

Authoring results are deeply frozen canonical values. `runScenario` and `runScenarios` return scenario shape, expectation, execution, and mismatch failures as diagnostics rather than throwing; `trace` is `null` when execution cannot complete. `simulateActions` and invalid `checkCartridge` options throw. Authoring bounds are:

| Option | Allowed | Failure |
| --- | --- | --- |
| simulation/scenario `maxActions` | `0..100000` | `E_AUTHORING_LIMIT` |
| check `maxDepth` | `0..100` | `E_AUTHORING_LIMIT` |
| check `maxPaths` | `1..100000` | `E_AUTHORING_LIMIT` |
| check `maxActionsPerState` | `0..100000` | `E_AUTHORING_LIMIT` |
| check `seeds` | non-empty array | `E_AUTHORING_SEEDS` |

Simulation also uses `E_AUTHORING_ACTIONS` for a non-array action list, `E_AUTHORING_PROJECTION` for projection observation failure, and `E_AUTHORING_REPLAY` if its generated replay does not verify. Scenario diagnostics commonly use `E_SCENARIO_SHAPE`, `E_SCENARIO_EXPECTATION`, and `E_SCENARIO_MISMATCH`, or preserve an execution error code.

`checkCartridge().ok` means exactly that `errors === 0`; warnings do not make it false. Error diagnostics include `E_CHECK_TWIN`, `E_CHECK_REPLAY`, `E_CHECK_PROJECTION`, and execution errors. Warning codes are `W_DUPLICATE_ACTION`, `W_COVERAGE_DEPTH`, `W_COVERAGE_PATHS`, `W_COVERAGE_ACTIONS`, and `W_COVERAGE_BOUNDED`. Coverage reports actually explored seed/path/transition counts and `depthLimited`, `pathLimited`, and `actionLimited` flags. This bounded result is evidence, not a proof of determinism or correctness.

See the [Cartridge authoring toolkit](cartridge-authoring-toolkit.md) for exact schemas and runnable examples.

## CLI syntax and exit behavior

```text
ludotape validate cartridge.mjs [seed]
ludotape check cartridge.mjs [seed [depth [paths]]]
ludotape test cartridge.mjs scenarios.mjs
ludotape verify cartridge.mjs replay.json
ludotape solve cartridge.mjs [seed [depth [nodes]]]
ludotape benchmark
ludotape serve [port [host]]
```

Cartridge modules export `default` or named `cartridge`; scenario modules export `default` or named `scenarios`. Numeric CLI arguments use strict decimal integer syntax. Seeds are signed 32-bit integers. `check` depth is `0..100` and paths is effectively `1..100000` (zero reaches the authoring API and is rejected); defaults are seed `0`, depth `2`, paths `100`, with `maxActionsPerState` fixed at `100`. `solve` defaults are seed `0`, depth `20`, nodes `10000`, with ceilings `1000` and `1000000`. `serve` defaults to port `8080`, host `127.0.0.1`.

`validate` imports a cartridge, creates initial state, and evaluates initial legal actions; it does **not** execute every transition or projection. `check` performs bounded authoring exploration. `test` runs exact scenarios. `verify` limits replay files to 2 MiB. Application code plays through `createRun`, `availability`, and `dispatch`; there is no implicit game loop or arbitrary Studio module loader.

Commands print JSON on stdout except `serve` and command-level failures; failures print `CODE: message` on stderr. Exit codes are:

- `0`: successful `validate`, `verify`, `test`, or `benchmark`; `check` with zero errors (warnings allowed); solved `solve`.
- `1`: argument/import/runtime failure; failed replay verification; failed scenarios; or a `check` report containing errors.
- `2`: `solve` returned `unsolved` or `bounded`.

`serve` remains running after successful startup and exits according to process/server failure rather than a result report.
