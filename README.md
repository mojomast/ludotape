# Ludotape

**Games you can rewind.** Ludotape 0.1.0 is a zero-dependency JavaScript framework for deterministic, replayable, renderer-neutral browser games. It also runs headlessly on Node.js 20+.

## Source-checkout quick start

```sh
git clone https://github.com/mojomast/ludotape.git
cd ludotape
npm test
npm run build
npm run smoke
node bin/ludotape.mjs validate examples/warehouse-circuit.mjs
node bin/ludotape.mjs serve
```

Open `http://127.0.0.1:8080/studio/`. Studio supports deterministic one-turn rewind, replay verification, accessible tab navigation, and visible keyboard shortcuts. `dist/` is generated and ignored, so build before serving a fresh checkout. The server binds loopback and is for trusted local development only; it is not a production server.

```js
import {createRun, availability, dispatch, createReplay} from 'ludotape';
import cartridge from './examples/warehouse-circuit.mjs';
const run = createRun(cartridge, {seed: 7});
dispatch(run, availability(run)[0]);
console.log(createReplay(run));
```

## Included

Canonical value digests, identity-bound frozen cartridges, transactional seeded RNG, isolated runs and journals, strict bounded replay verification with step cursors, bounded BFS solving, memory/Web Storage/IndexedDB repositories, undoable draft editing, browser and terminal adapters, Studio, CLI, and two example games.

## Trust and scope

Game callbacks and imported cartridges are trusted JavaScript and are **not sandboxed**. Determinism requires the documented callback contract. Ludotape is not a production web server, network lockstep protocol, anti-cheat system, physics engine, or asset pipeline.

Start with the [documentation index](docs/README.md), [specification](SPEC.md), and [architecture](ARCHITECTURE.md). See [SECURITY.md](SECURITY.md) for private reporting and [SUPPORT.md](SUPPORT.md) for help. MIT licensed.
