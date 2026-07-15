# JS/TS core reference

The **JavaScript/TypeScript core** (`ludotape/js-ts-core`, source `src/cores/js-ts-core/`) is the built-in reference core. It interprets `ludotape/cartridge@1` cartridges by delegating to the 0.1 deterministic core in `src/index.mjs`, so its behaviour, digests, and replays are identical to calling that core directly. Its entry module also re-exports the typed authoring helpers, making it a one-stop import for a TypeScript game author.

This is the complete API reference for the core's own exports and the author-facing surface it re-exports, with exact signatures, error codes, and limits. The narrative introduction is the [game author guide](game-author-guide.md); the loader/registry API is the [custom core reference](custom-core-reference.md).

## Overview

`ludotape/js-ts-core` exports:

- `createCore()` — a factory returning a fresh `ICore` instance.
- `default` — a convenience `ICore` instance (one `createCore()` call).
- the re-exported deterministic API of `ludotape` (`defineGame`, `compileCartridge`, `createRun`, `dispatch`, `solve`, replay helpers, RNG, canonical helpers), typed via `types.d.ts`.

Core metadata: id `ludotape/js-ts-core`, version `0.2.0`, name `JavaScript/TypeScript Core`, all four capabilities `true`, `cartridgeFormats: ['ludotape/cartridge@1']`.

## Prerequisites

- Node.js 20+. Zero dependencies.
- Read [Getting started](getting-started.md) and the [game author guide](game-author-guide.md).
- Canonical values and determinism ([determinism contract](determinism-contract.md), [specification](../SPEC.md)) apply to everything below.
- Source-checkout examples import by relative `.mjs` path; package consumers use `ludotape/js-ts-core` and `ludotape`.

## Core exports

### `createCore()`

Returns a fresh, frozen `ICore` instance. Safe to call more than once; each call is independent. Register it (or the factory itself) with a registry.

```js
import {createCore} from '../src/cores/js-ts-core/index.mjs';   // package: 'ludotape/js-ts-core'
import {createCoreRegistry} from '../src/core-loader.mjs';       // package: 'ludotape/core'

const registry = createCoreRegistry();
registry.register(createCore());
```

### `default`

A ready-made `ICore` instance. Import it when you do not need an independent instance:

```js
import jsTsCore from '../src/cores/js-ts-core/index.mjs';
console.log(jsTsCore.metadata.id);   // ludotape/js-ts-core
```

Note: `loadCoreFromManifest` and registries always call `createCore()` rather than share `default`, so registering `default` directly is discouraged when isolation matters.

### ICore members provided

| Member | Signature | Behaviour |
| --- | --- | --- |
| `metadata` | deep-frozen canonical object | Identity and capabilities described above. |
| `loadCartridge(source)` | `(source) => cartridge` | Accepts a compiled cartridge object (validated: frozen, has `identity`); a module namespace with a `default`/`cartridge` export; or a `{game, document}` / `defineGame`-spec plus document that it compiles via `compileCartridge`/`defineCartridge`. Unrecognized shapes throw `E_CORE_CARTRIDGE` (never an uncaught `TypeError`). Returns a frozen cartridge. |
| `createRun(cartridge, {seed} = {})` | `=> run` | Delegates to `createRun` in `src/index.mjs`. |
| `availability(run)` | `=> action[]` | Delegates to `availability`. |
| `dispatch(run, action)` | `=> journalEntry` | Delegates to `dispatch`; illegal actions throw `E_ILLEGAL_ACTION`. |
| `project(run, adapter, options)` | `=> projection` | Delegates to `project`. |
| `isGoal(run)` | `=> boolean` | Evaluates the cartridge `isGoal` against current state. |
| `solve(cartridge, options)` | `=> solveResult` | Delegates to `solve`. |
| `createReplay(run)` | `=> replay` | Delegates to `createReplay`. |
| `verifyReplay(cartridge, replay, options)` | `=> {ok, error?}` | Delegates to `verifyReplay`. |
| `rewindRun(run, turns)` | `=> run` | Delegates to `rewindRun`. |

The loader additionally attaches `tick` (= `dispatch`) and `render` (= `project`) when the core is wrapped/registered.

## Re-exported deterministic API

The following are re-exported from `src/index.mjs` for one-stop import from `ludotape/js-ts-core`. They are the author-facing surface; a game author typically uses these directly and lets the core layer stay implicit.

### Canonical values, hashing, cloning

| Export | Signature | Returns / throws |
| --- | --- | --- |
| `canonical(value, options?)` | `(value, {maxDepth?, maxNodes?, maxBytes?}) => string` | Strict canonical JSON string. Throws `E_CANONICAL` (non-finite/unsupported/non-plain), `E_CANONICAL_REFERENCE` (cycle or shared reference), `E_CANONICAL_PROPERTY` (symbol/accessor/non-enumerable/invalid array element), `E_CANONICAL_ARRAY` (sparse/decorated array), `E_CANONICAL_KEY` (dangerous key), `E_CANONICAL_LIMIT` (depth/node/byte limit or invalid limit option). |
| `digest(value, options?)` | `(value, limits?) => string` | `sha256Text(canonical(value, options))`. Strings are values, not raw input: `digest(null) !== digest('null')`. |
| `clone(value, options?)` | `(value, limits?) => value` | Canonical clone (`JSON.parse(canonical(...))`). Same throws as `canonical`. |
| `deepFreeze(value)` | `(value) => value` | Recursively freezes data properties; returns the input. |

Note: `sha256Text` and `valueDigest` (the `digest` alias) are part of the `ludotape` entry (`src/index.mjs`) but are **not** re-exported from `ludotape/js-ts-core`; import them from `ludotape` directly if needed.

### RNG

| Export | Signature | Notes |
| --- | --- | --- |
| `createRng(seed = 0, internalState?)` | `=> {next, int, pick, shuffle, die, dice, state}` | Deterministic RNG. Programmatic seeds are a safe integer, string, boolean, or `null` (else `E_SEED`). |

RNG method contract and **sequence consumption** (consumption is part of the stable sequence — changing helper calls is a rules-version change):

| Method | Result | Draws consumed | Throws |
| --- | --- | --- | --- |
| `next()` | number in `[0, 1)` | 1 | — |
| `int(max)` | integer in `[0, max)` | 1 | `E_RNG` if `max` not a positive safe integer |
| `pick(items)` | one member | 1 | `E_RNG` if not a non-empty array |
| `shuffle(items)` | shuffled copy; input unchanged | `max(items.length - 1, 0)` | `E_RNG` if not an array |
| `die(sides = 6)` | integer in `[1, sides]` | 1 | `E_RNG` if `sides` not a positive safe integer |
| `dice(sides, count)` | array of `count` results | exactly `count` | `E_RNG` if `sides` invalid or `count` not in `0..100000` (`MAX_DICE_COUNT`) |

`state` is the current unsigned internal state for inspection only; do not persist or set it in game code.

### Game and cartridge definition

| Export | Signature | Returns / throws |
| --- | --- | --- |
| `defineGame(spec)` | `(spec) => game` | Frozen game. Requires non-empty string `id`, `version`; function `initialState`, `actions`, `transition`; optional function `project`, `isGoal`; `metadata` defaults to `{}`. Throws `E_GAME` on violation. |
| `compileCartridge(game, document = {})` | `=> cartridge` | Deeply frozen, identity-bound `ludotape/cartridge@1` cartridge with `identity`, `rulesDigest`, `rulesVersion`, `ruleset`, `document`, `game`. Throws `E_GAME` if `game.id` is absent. |
| `defineCartridge({...gameSpec, document?})` | `=> cartridge` | Exactly `compileCartridge(defineGame(gameSpec), document)`; `document` defaults to `{}`. Throws `E_GAME`. |

### Runs, actions, dispatch

| Export | Signature | Returns / throws |
| --- | --- | --- |
| `createRun(cartridge, {seed = 0} = {})` | `=> run` | Frozen run façade; `state`/`journal` getters return isolated copies, `turn` is live. Throws `E_CARTRIDGE` if not a compiled cartridge. May throw canonical/`E_SEED` errors from callbacks. |
| `availability(run)` | `=> action[]` | Cloned legal actions. Throws `E_RUN` (invalid run), `E_ACTIONS` (callback did not return an array). `ludotape`'s `legalActions` alias is not re-exported from `ludotape/js-ts-core`. |
| `dispatch(run, action)` | `=> journalEntry` | Frozen journal entry `{index, action, before, after, rngBefore, rngAfter}`. Throws `E_ILLEGAL_ACTION` (action not currently available; `details` has `action`, `legal`), plus any canonical error from the transition. |
| `runActions(cartridge, actions, {seed = 0, maxActions = 10000} = {})` | `=> run` | Creates a fresh run and dispatches a dense canonical action script in order; returns the live run. `maxActions` is `0..100000`. Shape/limit/clone/dispatch failures throw `E_ACTION_SCRIPT` (`details`: `index`, `turn`, `action`, canonical-safe `{code, message}` cause). |
| `rewindRun(run, turns = 1)` | `=> run` | Reconstructs a separate run `turns` (`0..run.turn`) in the past from seed and journal; verifies initial state, RNG history, and each retained entry. Does not mutate the input. Throws `E_REWIND` on invalid input or reconstruction mismatch. |

### Projection

| Export | Signature | Returns / throws |
| --- | --- | --- |
| `project(run, adapter?, options?)` | `=> view` or adapter result | Validates and deeply freezes the projection, then either returns it or passes `(view, snapshotMetadata)` to `adapter` — never the run. `options` are `{maxDepth = 64, maxNodes = 50000, maxBytes = 2*1024*1024}`. Throws `E_RUN`; warns once per cartridge if no `project` callback is defined (raw state is projected). |

### Replay and solver

| Export | Signature | Returns / throws |
| --- | --- | --- |
| `createReplay(run)` | `=> replay` | Isolated `ludotape/replay@1` object: `{format, cartridge, seed, initial, actions, checkpoints, final}`. |
| `verifyReplay(cartridge, replay, options?)` | `=> {ok, turns?, final?, run?, error?}` | Non-throwing: verification failures are returned as `{ok: false, error: {code, message}}`. Codes include `E_IDENTITY`, `E_INITIAL`, `E_CHECKPOINT`, `E_FINAL`, and the `E_REPLAY_*` shape family. |
| `solve(cartridge, options?)` | `=> solveResult` | Bounded FIFO BFS. Options: `seed`, `maxDepth`, `maxNodes`, `maxActions`, `maxGenerated`, `maxQueue`, `maxStateBytes`, `isGoal`. Returns `{status: 'solved'\|'unsolved'\|'bounded', actions, ...}`. Throws `E_SOLVE` (no `isGoal`), `E_SOLVE_LIMIT` (invalid bound). |
| `LudotapeError` | `class` | Error with stable `code` and optional `details`. |

Note: `createReplayCursor` and the `replay.{create,verify}` convenience bundle are part of `ludotape` (`src/index.mjs`) but are **not** re-exported from `ludotape/js-ts-core`; import them from `ludotape` directly.

Replay shape validation throws the `E_REPLAY_*` family: `E_REPLAY_SHAPE`, `E_REPLAY_FIELDS`, `E_REPLAY_FORMAT`, `E_REPLAY_DIGEST`, `E_REPLAY_ARRAY`, `E_REPLAY_CHECKPOINTS`, `E_REPLAY_SEED`, `E_REPLAY_LIMIT`. In `verifyReplay` these surface inside the `{ok: false, error}` result rather than being thrown.

## Error code catalogue

Every failure is a `LudotapeError` with one of these codes.

| Namespace | Codes |
| --- | --- |
| Game/cartridge/run | `E_GAME`, `E_CARTRIDGE`, `E_RUN`, `E_ACTIONS`, `E_ILLEGAL_ACTION`, `E_ACTION_SCRIPT` (+ internal `E_ACTION_SCRIPT_LIMIT`), `E_REWIND` |
| Canonical | `E_CANONICAL`, `E_CANONICAL_LIMIT`, `E_CANONICAL_REFERENCE`, `E_CANONICAL_PROPERTY`, `E_CANONICAL_ARRAY`, `E_CANONICAL_KEY` |
| Hashing/RNG/seed/limit | `E_HASH_TEXT`, `E_RNG`, `E_SEED`, `E_LIMIT` |
| Replay | `E_REPLAY_SHAPE`, `E_REPLAY_FIELDS`, `E_REPLAY_FORMAT`, `E_REPLAY_DIGEST`, `E_REPLAY_ARRAY`, `E_REPLAY_CHECKPOINTS`, `E_REPLAY_SEED`, `E_REPLAY_LIMIT`, `E_IDENTITY`, `E_INITIAL`, `E_CHECKPOINT`, `E_FINAL`, `E_CURSOR_DONE` |
| Solver | `E_SOLVE`, `E_SOLVE_LIMIT` |
| Core layer | `E_CORE`, `E_CORE_METADATA`, `E_CORE_SHAPE`, `E_CORE_MANIFEST`, `E_CORE_ENTRY`, `E_CORE_DUPLICATE`, `E_CORE_UNKNOWN`, `E_CORE_CAPABILITY`, `E_CORE_CARTRIDGE` |

The JS/TS core surfaces `E_CORE_CARTRIDGE` when `loadCartridge` receives an unrecognized source shape, `E_CORE_CAPABILITY` when a declared-capability method is exercised but not functional, and `E_CORE` when a delegate call fails unexpectedly or receives an invalid run/cartridge/adapter. `E_CORE_METADATA`, `E_CORE_SHAPE`, `E_CORE_MANIFEST`, `E_CORE_ENTRY`, `E_CORE_DUPLICATE`, and `E_CORE_UNKNOWN` originate in the core loader/registry (`src/core-loader.mjs`), not the JS/TS core itself; every other code above originates in `src/index.mjs`.

## Limits

| Concern | Defaults | Hard ceilings |
| --- | --- | --- |
| `canonical`/`clone`/`digest` | `maxDepth 100`, `maxNodes 100000`, `maxBytes 8 MiB` | `maxDepth 1000`, `maxNodes 1000000`, `maxBytes 64 MiB` |
| `project` | `maxDepth 64`, `maxNodes 50000`, `maxBytes 2 MiB` | (uses `clone` ceilings) |
| `runActions` `maxActions` | `10000` | `100000` |
| Replay validation | `maxBytes 2 MiB`, `maxActions 10000` | `maxBytes 16 MiB`, `maxActions 100000` |
| `solve` | `maxDepth 20`, `maxNodes 10000`, `maxActions 1000`, `maxGenerated 100000`, `maxQueue 100000`, `maxStateBytes 1 MiB` | `depth 1000`, `nodes 1000000`, `actions 100000`, `generated 5000000`, `queue 1000000`, `stateBytes 8 MiB` |
| `dice` count | — | `MAX_DICE_COUNT 100000` |

RNG consumption rules: `next`/`int`/`pick`/`die` draw 1, `shuffle` draws `max(length - 1, 0)`, `dice` draws `count`.

## Examples

### Run lifecycle

```js
import {createRun, availability, dispatch, project, createReplay, verifyReplay} from '../src/cores/js-ts-core/index.mjs';
import {terminalAdapter} from '../src/adapters.mjs';
import cartridge from './basic-counter.mjs';

const run = createRun(cartridge, {seed: 0});
const render = terminalAdapter(text => process.stdout.write(text));
project(run, render);

while (availability(run).length > 0) {
  dispatch(run, availability(run)[0]);
  project(run, render);
}

const result = verifyReplay(cartridge, createReplay(run));
if (!result.ok) throw new Error(`${result.error.code}: ${result.error.message}`);
console.log(`Verified ${result.turns} turns.`);
```

### Replay with a cursor

```js
import {createRun, dispatch, availability, createReplay} from '../src/cores/js-ts-core/index.mjs';
import {createReplayCursor} from '../src/index.mjs';
import cartridge from './basic-counter.mjs';

const source = createRun(cartridge, {seed: 0});
dispatch(source, availability(source)[0]);
const replay = createReplay(source);

const cursor = createReplayCursor(cartridge, replay);
while (!cursor.done) cursor.step();          // throws E_CHECKPOINT on mismatch
const outcome = cursor.verify();
console.log(outcome.ok, outcome.turns);      // true 1
```

### Solve

```js
import {solve} from '../src/cores/js-ts-core/index.mjs';
import cartridge from './basic-counter.mjs';

const result = solve(cartridge, {seed: 0, maxDepth: 5, maxNodes: 100});
console.log(result.status);                  // solved
console.log(result.actions);                 // [{type:'increment'}, {type:'increment'}, {type:'increment'}]
```

### TypeScript-typed game

The core's `types.d.ts` provides `CanonicalValue`, `GameSpec<S, A, D>`, `Cartridge`, `Run`, `JournalEntry`, `Rng`, `TransitionContext`, `ObserverContext`, `Projection`, `Replay`, `SolveResult`, `ICore`, `CoreMetadata`, and typed `defineGame`/`defineCartridge`/`createRun`/`dispatch`/`availability`/`project`/`isGoal`. Start from `devkit/tsconfig.template.json` (NodeNext, checkJs-friendly).

```ts
import {defineCartridge, createRun, availability, dispatch, project} from 'ludotape/js-ts-core';

interface State { count: number }
interface Action { type: 'increment' }
interface Doc { target: number }

const cartridge = defineCartridge({
  id: 'example/typed-counter',
  version: '1.0.0',
  document: {target: 3} satisfies Doc,
  initialState: (): State => ({count: 0}),
  actions: (state: State, {document}): Action[] =>
    state.count < document.target ? [{type: 'increment'}] : [],
  transition: (state: State): State => ({count: state.count + 1})
});

const run = createRun(cartridge, {seed: 0});
dispatch(run, availability(run)[0]);
console.log(project(run));
```

Generics are supplied through `GameSpec<S, A, D>`; the typed `defineGame`/`defineCartridge` infer state, action, and document types so `transition`, `actions`, and `project` are checked against them.

## Troubleshooting

| Symptom | Code | Fix |
| --- | --- | --- |
| `loadCartridge` throws on a hand-built object | `E_CORE_CARTRIDGE` | Pass a compiled cartridge, a module namespace with `default`/`cartridge`, or a `{game, document}`/spec the core can compile. |
| `dispatch` rejects an action that "looks legal" | `E_ILLEGAL_ACTION` | Dispatch an exact canonical match of a value from `availability(run)`; inspect `error.details.legal`. |
| Replay does not verify after a code change | `E_CHECKPOINT`/`E_FINAL`/`E_IDENTITY` | Rule behaviour or identity changed; bump the game `version` and regenerate replays. |
| `solve` throws instead of returning a status | `E_SOLVE` | Define `isGoal` on the game or pass `options.isGoal`. |
| Non-finite/`undefined`/class instance rejected | `E_CANONICAL*` | Use only canonical values in state, actions, documents, metadata, and projections. |
| A limit option is rejected | `E_CANONICAL_LIMIT`/`E_SOLVE_LIMIT`/`E_REPLAY_LIMIT` | Keep the option a safe integer within the ceilings tabulated above. |

## See also

- [Custom core reference](custom-core-reference.md) — loader, registry, and manifest for cores other than this one.
- [Core authoring guide](core-authoring-guide.md) — build your own core.
- [API reference](api-reference.md) — the same deterministic API from the `ludotape` entry.
- [Core specification](../CORE_SPEC.md) — normative `ICore` and lifecycle.
- [`examples/basic-counter.mjs`](../examples/basic-counter.mjs) — the cartridge used above.
