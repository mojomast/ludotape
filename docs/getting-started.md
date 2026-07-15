# Getting started

Ludotape requires Node.js 20+. The repository has no runtime or development package dependencies.

## 1. Prepare a source checkout

```sh
git clone https://github.com/mojomast/ludotape.git
cd ludotape
npm test
```

This is a complete source-checkout tutorial. The examples below use repository-relative imports such as `../src/index.mjs`. If you obtain Ludotape through a package source, install that package in your application first, then use `from 'ludotape'` and `from 'ludotape/adapters'` instead. Relative ESM imports always include the `.mjs` extension.

## 2. Create a cartridge

A cartridge combines deterministic rules with a canonical document. The document holds editable content; callbacks define behavior. Save this as `examples/my-counter.mjs`:

```js
import {
  compileCartridge,
  defineGame
} from '../src/index.mjs';

export const document = {
  target: 3
};

export const game = defineGame({
  id: 'example/my-counter',
  version: '1.0.0',
  metadata: {
    title: 'My Counter'
  },

  initialState() {
    return {
      count: 0
    };
  },

  actions(state, {document}) {
    return state.count < document.target
      ? [{type: 'increment'}]
      : [];
  },

  transition(state, action) {
    if (action.type !== 'increment') {
      throw new Error('Unsupported action');
    }
    return {
      count: state.count + 1
    };
  },

  project(state, {document}) {
    return {
      complete: state.count === document.target,
      count: state.count,
      target: document.target
    };
  },

  isGoal(state, {document}) {
    return state.count === document.target;
  }
});

export const cartridge = compileCartridge(game, document);
export default cartridge;
```

### What each part does

- `id` is the stable ruleset name.
- `version` must change whenever callback behavior, action meaning, transition order, or RNG use changes.
- `initialState(context)` creates canonical initial state.
- `actions(state, context)` returns every currently legal canonical action in deterministic order.
- `transition(state, action, context)` returns the next canonical state. It does not mutate the run directly.
- `project(state, context)` returns renderer-neutral view data. It is optional; omitting it projects raw state with a warning.
- `isGoal(state, context)` tells the bounded solver when the game is complete.
- The default compiled-cartridge export is the convention expected by the CLI.

`initialState` and `transition` receive `{document, seed, turn, rng}`. Observational callbacks—`actions`, `project`, and `isGoal`—receive `{document, seed, turn}` without consuming RNG.

A quicker starting point is:

```sh
cp examples/basic-counter.mjs examples/my-game.mjs
```

Then change its `id`, title, document, state, actions, transition, projection, and goal.

## 3. Check and solve the game

```sh
node bin/ludotape.mjs validate examples/my-counter.mjs
node bin/ludotape.mjs solve examples/my-counter.mjs 0 3 100
```

`validate` imports the cartridge, creates its initial state, and evaluates initial legal actions. The run and onboarding tests exercise transitions, projections, goals, and replays. The solver command arguments are `cartridge [seed depth nodes]`. CLI seeds are signed 32-bit integers. This game solves at depth 3 with three `{type: 'increment'}` actions. Solver results can be `solved`, `unsolved`, or `bounded`; always use explicit bounds appropriate to the game.

## 4. Run it headlessly

Save this as `examples/run-my-counter.mjs`:

```js
import {
  availability,
  createReplay,
  createRun,
  dispatch,
  project,
  verifyReplay
} from '../src/index.mjs';
import {terminalAdapter} from '../src/adapters.mjs';
import cartridge from './my-counter.mjs';

const run = createRun(cartridge, {seed: 0});
const render = terminalAdapter(text => process.stdout.write(text));

project(run, render);

while (availability(run).length > 0) {
  const [action] = availability(run);
  dispatch(run, action);
  project(run, render);
}

const replay = createReplay(run);
const result = verifyReplay(cartridge, replay);
if (!result.ok) {
  throw new Error(`${result.error.code}: ${result.error.message}`);
}

console.log(`Verified ${result.turns} turns.`);
```

Run it:

```sh
node examples/run-my-counter.mjs
```

`availability()` returns cloned legal actions. `dispatch()` accepts only an action that canonically matches one of those values and advances the run transactionally. `project()` produces view data or passes it to an adapter. The replay is bound to the exact cartridge identity, seed, action sequence, and state checkpoints.

The checked-in equivalent is executable with:

```sh
npm run example:basic
```

## 5. Keep rules deterministic

Use only plain canonical data: `null`, booleans, strings, finite numbers, arrays, and plain objects. Do not put `undefined`, `NaN`, `Infinity`, functions, symbols, dates, class instances, sparse arrays, getters, cycles, or shared object references in documents, state, actions, metadata, or projections. Programmatic seeds are narrower: a safe integer, string, boolean, or `null`.

For authoritative game behavior:

- use `context.rng`, not `Math.random()`;
- do not read wall-clock or animation time;
- do not read network, filesystem, or storage from callbacks;
- do not depend on mutable module globals or asynchronous races;
- avoid locale-sensitive sorting and formatting;
- use stable action shapes such as `{type: 'move', direction: 'left'}`;
- keep display labels and DOM events out of actions;
- use integer ticks for simulation time if the game needs time progression.

Renderers may redraw a projection any number of times and must not dispatch implicitly. In browsers, `requestAnimationFrame()` schedules presentation only; it must not decide authoritative state.

See the [game author guide](game-author-guide.md) and [determinism contract](determinism-contract.md) for the full contract.

## 6. Browser and Studio next steps

Browser modules must be served over HTTP rather than opened through `file://`. Use `<script type="module">`, explicit relative URLs, or an import map for bare package specifiers. Keep native semantic controls—especially legal-action `<button>` elements—even when canvas supplies visual presentation.

The bundled Studio is available after:

```sh
npm run build
node bin/ludotape.mjs serve
```

Open `http://127.0.0.1:8080/studio/`. Studio currently loads only the bundled Warehouse Circuit and Seeded Card Duel modules; it is not an arbitrary custom-module loader. Custom games run through the headless APIs above or through an application-specific browser entry point.

Studio tabs support Arrow keys, Home, and End. When exactly one game action is legal, <kbd>Space</kbd> or <kbd>Enter</kbd> dispatches it. <kbd>Backspace</kbd> or <kbd>Z</kbd> rewinds, <kbd>R</kbd> restarts, and <kbd>E</kbd> opens Replay and focuses Export. Shortcuts do not override form fields or interactive controls.

## 7. Verify the repository and package surface

```sh
npm run check
```

This runs tests, build, benchmark, smoke verification, and a package-artifact check. The local static server is loopback-only and intended for trusted development—not deployment or untrusted cartridges.
