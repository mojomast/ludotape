# Ludotape devkit

The devkit is the SDK layer on top of Ludotape's deterministic runtime: scaffolding CLIs and a
programmatic API for new games and new pluggable cores, static core validation, an automated
conformance suite, and TypeScript declarations. A **core** is a pluggable runtime that interprets
a cartridge format and exposes the standard run lifecycle (`loadCartridge`, `createRun`,
`availability`, `dispatch`, `project`, ...); Ludotape ships one reference core for its own
JS/TS cartridges, but custom cores can interpret other formats as long as they implement `ICore`
and preserve the same determinism and canonical-value rules. See [CORE_SPEC.md](CORE_SPEC.md) for
the normative interface.

## 60-second quickstarts

Scaffold a new game (module + scenarios file):

```sh
node devkit/create-game.mjs --name my-counter --dir examples --yes
```

Scaffold a new custom core from the commented template:

```sh
node devkit/create-core.mjs --id example/my-core --dir my-core --yes
```

Validate a core directory statically (manifest, entry, exported `createCore`, shape — no gameplay):

```sh
node devkit/validate-core.mjs my-core
```

Run the automated conformance suite against a core and one of its cartridges (exercises gameplay,
determinism, and capability contracts):

```sh
node bin/ludotape.mjs core conformance my-core my-core/sample-cartridge.mjs 0
```

Once installed as a package, the scaffolders are also available as `npx ludotape-create` and
`npx ludotape-create-core`.

## Package subpaths

| Subpath | Points at | Purpose |
|---|---|---|
| `ludotape` | `src/index.mjs` | Core runtime: cartridges, runs, dispatch, replay, solve |
| `ludotape/core` | `src/core-loader.mjs` | `ICore` shape validation, wrapping, registry, manifest/discovery loaders |
| `ludotape/devkit` | `devkit/index.mjs` | `scaffoldGame`, `scaffoldCore`, `validateCore` |
| `ludotape/js-ts-core` | `src/cores/js-ts-core/index.mjs` | Reference JS/TS core + re-exported author-facing runtime API |
| `ludotape/conformance` | `test/core-conformance.mjs` | `runCoreConformance` harness |
| `ludotape/authoring` | `src/authoring.mjs` | Action traces, exact scenarios, bounded cartridge checks |
| `ludotape/adapters` | `src/adapters.mjs` | Semantic, canvas, and terminal projection adapters |
| `ludotape/storage` | `src/storage.mjs` | Memory, Web Storage, and IndexedDB run repositories |
| `ludotape/editor` | `src/editor.mjs` | Headless document draft history |

## CLI commands

`bin/ludotape.mjs` (installed as `ludotape`):

| Command | Description |
|---|---|
| `validate cartridge.mjs [seed]` | Load a cartridge and report initial state/actions |
| `check cartridge.mjs [seed [depth [paths]]]` | Bounded twin-execution determinism/replay check |
| `test cartridge.mjs scenarios.mjs` | Run declared exact scenarios |
| `verify cartridge.mjs replay.json` | Validate and replay a stored replay |
| `solve cartridge.mjs [seed depth nodes]` | Bounded BFS solve |
| `benchmark` | Run the core runtime benchmark |
| `serve [port [host]]` | Serve Studio over loopback for local development |
| `core list` | List registered and discovered cores |
| `core validate <coreDir>` | Static core validation (manifest, entry, shape) |
| `core conformance <coreDir> <cartridge.mjs> [seed]` | Run the conformance suite against a core |

Devkit scaffolding CLIs (installed as `ludotape-create` / `ludotape-create-core`):

| Command | Description |
|---|---|
| `devkit/create-game.mjs [--name --id --dir --title --yes]` | Scaffold a game module + scenarios file |
| `devkit/create-core.mjs [--id --name --dir --yes --force]` | Scaffold a custom core from the template |
| `devkit/validate-core.mjs <coreDir\|manifestPath>` | Same static validation as `core validate`, directly |

## Learn more

| Topic | Doc |
|---|---|
| Devkit and core architecture overview | [docs/devkit-overview.md](docs/devkit-overview.md) |
| Writing a custom core, step by step | [docs/core-authoring-guide.md](docs/core-authoring-guide.md) |
| Built-in JS/TS core API | [docs/js-ts-core-reference.md](docs/js-ts-core-reference.md) |
| `ICore`, manifest, loader/registry, conformance API | [docs/custom-core-reference.md](docs/custom-core-reference.md) |
| Every CLI command | [docs/cli-reference.md](docs/cli-reference.md) |
| Packaging and publishing a core as an npm module | [docs/sdk-publishing-guide.md](docs/sdk-publishing-guide.md) |
| Normative `ICore` specification | [CORE_SPEC.md](CORE_SPEC.md) |

Cores are trusted JavaScript and are **not sandboxed**, exactly like cartridge callbacks — see
[README.md](README.md#trust-and-scope) and [ARCHITECTURE.md](ARCHITECTURE.md) for the full trust
model.
