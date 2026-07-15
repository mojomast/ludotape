# Ludotape

**Games you can rewind.** Ludotape is a zero-dependency JavaScript framework for deterministic, replayable, renderer-neutral browser games. It also runs headlessly on Node.js 20+.

## What works

- ruleset definition and document-bound cartridges
- canonical serialization, SHA-256 identities, seeded RNG
- legal-action discovery, dispatch, separate transition journals, projections
- replay creation and checkpoint verification
- bounded breadth-first solving
- explicit in-memory and Web Storage repositories; headless draft editing
- semantic HTML and Canvas adapters plus a static Studio
- Warehouse Circuit and Seeded Card Duel examples
- dependency-free validate, verify, solve, benchmark, and static-server CLI

```js
import {createRun, availability, dispatch, createReplay} from './src/index.mjs';
import cartridge from './examples/warehouse-circuit.mjs';
const run = createRun(cartridge, {seed: 7});
dispatch(run, availability(run)[0]);
console.log(createReplay(run));
```

Run `npm test`, `npm run build`, `npm run benchmark`, and `npm run smoke`. Start Studio with `node bin/ludotape.mjs serve`, then open `/studio/`.

## Trust and scope

Game callbacks are trusted JavaScript and are **not sandboxed**. Determinism requires authors to obey the determinism contract. Identical behavior has been tested in the documented environment, but this project makes no unproven cross-runtime or cross-engine guarantee. Ludotape is not a physics engine, network lockstep protocol, asset pipeline, anti-cheat system, or general-purpose sandbox.

See [SPEC.md](SPEC.md), [ARCHITECTURE.md](ARCHITECTURE.md), and [docs/getting-started.md](docs/getting-started.md). MIT licensed.
