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

## Platform references

- [MDN: JavaScript modules](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide/Modules)
- [Node.js: ECMAScript modules](https://nodejs.org/api/esm.html)
- [Node.js: test runner](https://nodejs.org/api/test.html)
- [MDN: requestAnimationFrame](https://developer.mozilla.org/en-US/docs/Web/API/Window/requestAnimationFrame)
- [MDN: canvas accessibility](https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/canvas)
- [WCAG 2.2: keyboard accessibility](https://www.w3.org/WAI/WCAG22/Understanding/keyboard.html)
