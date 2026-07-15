# Ludotape

**Games you can rewind.** Ludotape 0.1.0 is a zero-dependency JavaScript framework for deterministic, replayable, renderer-neutral browser games. It also runs headlessly on Node.js 20+.

## Create your first game

From a source checkout, create `examples/my-counter.mjs`:

```js
import {compileCartridge, defineGame} from '../src/index.mjs';

export const document = {target: 3};

export const game = defineGame({
  id: 'example/my-counter',
  version: '1.0.0',
  metadata: {title: 'My Counter'},

  initialState() {
    return {count: 0};
  },

  actions(state, {document}) {
    return state.count < document.target
      ? [{type: 'increment'}]
      : [];
  },

  transition(state, action) {
    return {count: state.count + 1};
  },

  project(state, {document}) {
    return {count: state.count, target: document.target};
  },

  isGoal(state, {document}) {
    return state.count === document.target;
  }
});

export default compileCartridge(game, document);
```

The required callbacks are `initialState`, `actions`, and `transition`. `project` supplies renderer-neutral view data, while `isGoal` enables the solver. The default compiled-cartridge export lets the CLI load the module.

Check its initial state/actions and solve it:

```sh
node bin/ludotape.mjs validate examples/my-counter.mjs
node bin/ludotape.mjs solve examples/my-counter.mjs 0 3 100
```

Run the checked-in, fully commented version through the complete run/project/replay lifecycle:

```sh
npm run example:basic
```

See [Getting started](docs/getting-started.md) for a headless runner, replay verification, package imports, callback context, and determinism rules.

When the first game is running, the [cartridge authoring toolkit](docs/cartridge-authoring-toolkit.md) adds action traces, exact scenarios, and bounded determinism/replay checks. The checked-in counter demonstrates both CLI workflows:

```sh
node bin/ludotape.mjs check examples/basic-counter.mjs 0 2 100
node bin/ludotape.mjs test examples/basic-counter.mjs examples/basic-counter.scenarios.mjs
```

## Source-checkout quick start

Requires Git and Node.js 20+; no dependency installation is required.

```sh
git clone https://github.com/mojomast/ludotape.git
cd ludotape
npm test
npm run build
npm run smoke
npm run example:basic
node bin/ludotape.mjs serve
```

Open `http://127.0.0.1:8080/studio/`. Studio supports deterministic one-turn rewind, replay verification, accessible tab navigation, and visible keyboard shortcuts. `dist/` is generated and ignored, so build before serving a fresh checkout. The server binds loopback and is for trusted local development only; it is not a production server. Studio currently loads the bundled Warehouse and Card Duel examples; custom games run through the core APIs and CLI.

This tutorial is source-checkout-first. After obtaining Ludotape through your package source, package consumers import core functions from `ludotape`; source-checkout examples use explicit relative `.mjs` paths:

```js
import {createRun, availability, dispatch, project} from 'ludotape';
import cartridge from './my-game.mjs';

const run = createRun(cartridge, {seed: 7});
dispatch(run, availability(run)[0]);
console.log(project(run));
```

## Included

Canonical value digests, identity-bound frozen cartridges, transactional seeded RNG with dice and shuffle helpers, isolated runs and journals, action scripts and rewind reconstruction, strict bounded replay verification with step cursors, exact authoring scenarios, bounded cartridge checks and BFS solving, memory/Web Storage/IndexedDB repositories, undoable draft editing, browser and terminal adapters, Studio, CLI, and three tested example games.

## Trust and scope

Game callbacks and imported cartridges are trusted JavaScript and are **not sandboxed**. Use `context.rng`, never `Math.random()`, for state-affecting randomness. Avoid clocks, I/O, locale-sensitive behavior, mutable globals, and asynchronous races. State, actions, documents, and projections must be canonical values. Bump the game `version` whenever rule behavior changes.

Ludotape is not a production web server, network lockstep protocol, anti-cheat system, physics engine, or asset pipeline.

Start with the [documentation index](docs/README.md), [game author guide](docs/game-author-guide.md), [specification](SPEC.md), and [architecture](ARCHITECTURE.md). See [SECURITY.md](SECURITY.md) for private reporting and [SUPPORT.md](SUPPORT.md) for help. MIT licensed.
