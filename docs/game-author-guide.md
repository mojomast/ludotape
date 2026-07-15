# Game author guide

A Ludotape game separates rules, editable content, runtime state, actions, and projections. Start from [`examples/basic-counter.mjs`](../examples/basic-counter.mjs) or follow [Getting started](getting-started.md).

## Define rules and content

```js
const game = defineGame({
  id,
  version,
  metadata,
  initialState,
  actions,
  transition,
  project,
  isGoal
});

const cartridge = compileCartridge(game, document);
```

`id` and `version` are required non-empty strings. `initialState`, `actions`, and `transition` are required functions. `project` and `isGoal` are optional functions. `metadata` and `document` must be canonical values.

Callback source code is not hashed into cartridge identity. Keep `id` stable and bump `version` whenever behavior changes, including action meaning or order, transition behavior, goal rules, or RNG consumption. Changing the version, metadata, or document changes cartridge identity and invalidates identity-bound replays.

## Callback contract

| Callback | Purpose | Context | May consume RNG? |
| --- | --- | --- | --- |
| `initialState(context)` | Create initial canonical state | `document`, `seed`, `turn`, `rng` | Yes |
| `actions(state, context)` | Enumerate every legal action | `document`, `seed`, `turn` | No |
| `transition(state, action, context)` | Return next canonical state | `document`, `seed`, `turn`, `rng` | Yes |
| `project(state, context)` | Return renderer-neutral view data | `document`, `seed`, `turn` | No |
| `isGoal(state, context)` | Test solver completion | `document`, `seed`, `turn` | No |

Callbacks are synchronous trusted JavaScript. Inputs are isolated at framework boundaries. Return new canonical values instead of mutating runtime objects. A transition commits state, journal, turn, and RNG progression only after it returns valid canonical state; a failed transition commits nothing.

## Design actions as replay protocol values

Actions are durable protocol data, not UI events. Prefer small stable shapes:

```js
{type: 'move', direction: 'left'}
{type: 'play-card', index: 2}
```

- Give every action a stable `type`.
- Include only information required by `transition`.
- Enumerate actions in deterministic order.
- Do not include functions, labels, timestamps, DOM events, or renderer state.
- Dispatch an exact canonical match for a currently available action.
- Treat shape and meaning changes as rules-version changes.

## Use canonical values

Documents, metadata, state, actions, and projections cross deterministic boundaries. Use `null`, booleans, strings, finite numbers, arrays, and plain objects. Programmatic seeds must be a safe integer, string, boolean, or `null`; CLI seeds are signed 32-bit integers. Avoid:

- `undefined`, `NaN`, and infinity;
- functions, symbols, accessors, and non-enumerable properties;
- dates, maps, sets, typed arrays, and class instances;
- sparse or decorated arrays;
- cycles and shared object references;
- dangerous object keys such as `__proto__`.

Prefer finite integers for portable rules and integer ticks for simulation time.

## Exclude nondeterministic inputs

Use `context.rng` instead of `Math.random()` in `initialState` or `transition`. Never make authoritative state depend on:

- wall-clock, `Date.now()`, `performance.now()`, or animation-frame timing;
- network, filesystem, or storage reads;
- locale-sensitive sorting or formatting;
- mutable module globals;
- asynchronous completion order;
- viewport size, device pixel ratio, or renderer redraw count.

`requestAnimationFrame()` may schedule presentation, but the game advances only through explicit actions. Renderer-local animation and interpolation do not belong in authoritative state or replays.

The RNG provides `next`, `int`, `pick`, nonmutating `shuffle`, `die`, and `dice`. Their consumption count is stable and documented in the [API reference](api-reference.md#rng-helpers). Treat a change from one helper sequence to another as a behavior and rules-version change, even if typical outcomes look equivalent.

## Keep projection and rendering separate

`project()` returns canonical renderer-neutral data. Adapters consume frozen projection snapshots and may redraw them any number of times. They must not alter the run or dispatch actions implicitly.

For browser games, expose legal actions as native buttons and maintain visible focus. Canvas can provide visual presentation, but retain equivalent semantic state and controls outside the bitmap. Announce important turn results and errors through visible text or a restrained status region. Honor reduced-motion preferences when adding animation.

## Test determinism

Use Node's built-in `node:test` runner. At minimum, test that:

1. the initial legal actions are exact;
2. explicit actions produce exact projections;
3. the same cartridge, seed, and action sequence produce identical replay data;
4. replay verification succeeds;
5. illegal or failed transitions leave state, turn, journal, and RNG progression unchanged;
6. bounded solving returns the expected path when `isGoal` is defined.

[`test/onboarding.test.mjs`](../test/onboarding.test.mjs) is an executable example.

## Use scenarios as executable rule examples

Keep important action sequences in a neighboring `*.scenarios.mjs` module. Scenario actions are protocol data and must be exact values returned by `actions()` at that point. Reach every expected state from `initialState`; do not inject an arbitrary state, because that would bypass legality, prior RNG consumption, and replay coverage.

Good scenarios:

- have a descriptive name and an explicit seed when randomness matters;
- assert initial availability so protocol changes are visible;
- use per-step expectations around important branches and a final expectation for the outcome;
- assert renderer-neutral `projection` for player-visible behavior, plus state only where it is a meaningful contract;
- expect complete canonical values—scenario matching is exact, not partial;
- remain small enough that a mismatch points to one rule;
- accompany every fixed regression and every intentional action/projection schema change.

Use `stateDigest` when storing the full state would obscure the example, but remember that a digest failure is less explanatory than a state mismatch. Avoid mechanically snapshotting every field if that would make harmless presentation changes noisy. Review scenario updates as rule changes, not as output regeneration.

Run scenarios through `runScenario`/`runScenarios` or:

```sh
node bin/ludotape.mjs test examples/basic-counter.mjs examples/basic-counter.scenarios.mjs
```

Scenario failures are structured diagnostics with scenario, step, and expectation path. The CLI exits `1` if any scenario fails, making it suitable for continuous integration.

## Interpret bounded cartridge checks correctly

Run `checkCartridge` across representative seeds while developing, then pin practical CLI bounds in continuous integration:

```sh
node bin/ludotape.mjs check examples/basic-counter.mjs 0 2 100
```

The checker explores available actions breadth-first, twin-executes each reached path, checks projections and replay verification, and reports duplicates and coverage truncation. Follow these practices:

- choose depth/path/action bounds from the game's branching factor and CI budget;
- inspect warnings instead of treating exit `0` as exhaustive coverage;
- require `coverage.seeds`, `paths`, and `transitions` appropriate to the intended run;
- treat `depthLimited`, `pathLimited`, and `actionLimited` as explicit omitted behavior;
- run multiple programmatic seeds when randomness changes legal branches (the CLI accepts one seed per invocation);
- pair broad bounded exploration with focused exact scenarios and ordinary unit tests.

Warnings do not make a check fail; error diagnostics do. A clean bounded check is evidence about only the explored paths, never a proof that a cartridge is deterministic or correct. The [cartridge authoring toolkit](cartridge-authoring-toolkit.md) documents exact declaration and report shapes.

## Multiple cores

Ludotape 0.2 adds a pluggable *core* layer. A core is a runtime that interprets a cartridge format and exposes the standard run lifecycle behind one interface. Everything above this section describes the built-in **JS/TS core**, which interprets the `ludotape/cartridge@1` format produced by `defineGame`/`compileCartridge`.

### When you can ignore cores

If you author games with `defineGame` and import from `ludotape` (or `ludotape/js-ts-core`), you are already using the built-in JS/TS core. Nothing in your workflow changes: the default core is selected automatically, and digests, replays, and solver behaviour are identical to the 0.1 framework. Most game authors never touch a core directly.

### When cores matter

Cores become relevant when a game is expressed in a **different cartridge format** — for example a declarative JSON rules document interpreted by a custom core, rather than JavaScript callbacks. A registry resolves a cartridge to the core that can run it by matching `cartridge.format` against each core's `cartridgeFormats`. To run such a cartridge you register the appropriate core and let `resolve(cartridge)` select it:

```js
import {defaultRegistry} from 'ludotape/core';
import cartridge from './my-cartridge.mjs';

const core = defaultRegistry.resolve(cartridge);   // built-in core for ludotape/cartridge@1
const loaded = await core.loadCartridge(cartridge);
const run = core.createRun(loaded, {seed: 0});
core.dispatch(run, core.availability(run)[0]);
console.log(core.project(run));
```

### Choosing a core

- For JavaScript-authored games (`defineGame`), keep using the JS/TS core — no registration needed.
- For a third-party cartridge format, install and register that format's core (see the [SDK publishing guide](sdk-publishing-guide.md) for how cores are distributed).
- To interpret your own format, build a core with the [core authoring guide](core-authoring-guide.md).

### Importing from `ludotape/js-ts-core`

The `ludotape/js-ts-core` subpath re-exports the same typed authoring helpers (`defineGame`, `compileCartridge`, `createRun`, `dispatch`, `project`, `solve`, replay, and RNG) as `ludotape`, plus the core factory. It is a convenient one-stop import for TypeScript game authors:

```js
import {defineCartridge, createRun, availability, dispatch, project} from 'ludotape/js-ts-core';
```

The full surface is documented in the [JS/TS core reference](js-ts-core-reference.md).

### Pointers

- [Devkit and cores overview](devkit-overview.md) — the abstraction and package subpath map.
- [JS/TS core reference](js-ts-core-reference.md) — the built-in core's complete API.
- [Custom core reference](custom-core-reference.md) — loader, registry, and manifest.
- [Core specification](../CORE_SPEC.md) — normative rules.

## Platform references

- [MDN: JavaScript modules](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide/Modules)
- [Node.js: ECMAScript modules](https://nodejs.org/api/esm.html)
- [Node.js: test runner](https://nodejs.org/api/test.html)
- [RFC 8259: JSON](https://www.rfc-editor.org/rfc/rfc8259)
- [MDN: requestAnimationFrame](https://developer.mozilla.org/en-US/docs/Web/API/Window/requestAnimationFrame)
- [MDN: canvas accessibility](https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/canvas)
- [WCAG 2.2: keyboard accessibility](https://www.w3.org/WAI/WCAG22/Understanding/keyboard.html)
