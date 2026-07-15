# Core authoring guide

This guide takes you from an empty directory to a **conformant, publishing-ready core** — a pluggable runtime that interprets a cartridge format you choose and exposes the standard Ludotape run lifecycle. It is task-oriented and assumes no prior knowledge of the core layer; the normative rules live in the [core specification](../CORE_SPEC.md).

You need a core only when you want to interpret a cartridge format other than `ludotape/cartridge@1`. If your game is expressed with `defineGame`, you are already using the built-in JS/TS core and can skip this guide; see the [game author guide](game-author-guide.md).

## Overview

A core is a frozen object implementing the `ICore` interface: it loads a cartridge, creates seeded runs, enumerates available actions, dispatches them into frozen journal entries, and projects renderer-neutral view data. Optional members add replay, rewind, and solving. The [custom core reference](custom-core-reference.md) documents each member in full; this guide walks the path end to end:

1. Scaffold a core directory.
2. Understand the generated files.
3. Implement each `ICore` method for your format.
4. Keep it deterministic.
5. Author the manifest.
6. Register it.
7. Validate it statically.
8. Run the conformance suite.
9. Walk a complete worked example (the stub core).

## Prerequisites

- Node.js 20+. Zero dependencies.
- Read [Devkit and cores overview](devkit-overview.md) and the [determinism contract](determinism-contract.md).
- Understand canonical values (see [specification](../SPEC.md)) — every value a core accepts or returns as state, action, document, option, journal entry, or projection MUST be canonical.
- A source checkout is assumed. Package consumers substitute the specifiers from the [subpath map](devkit-overview.md#package-subpath-map).

## 1. Scaffold a core

The devkit generates a working document-driven-counter core with your chosen id and name (the same pattern as the checked-in template `src/cores/custom-core-template/`, rendered fresh rather than copied — see [Anatomy of the generated files](#2-anatomy-of-the-generated-files)). From the repository root:

```sh
node devkit/create-core.mjs --id example/my-core --name "My Core" --dir examples/cores/my-core --yes
```

The equivalent for a package consumer (the `ludotape-create-core` bin is installed with the package):

```sh
npx ludotape-create-core --id example/my-core --name "My Core" --dir ./cores/my-core --yes
```

Run without `--yes` for an interactive prompt (built on `node:readline/promises`, zero dependencies). The scaffolder is deterministic: it emits no timestamps. See the [CLI reference](cli-reference.md#ludotape-create-core) for every flag.

The programmatic form is `scaffoldCore` from `devkit/index.mjs` (package: `ludotape/devkit`):

```js
import {scaffoldCore} from '../devkit/index.mjs';

await scaffoldCore({id: 'example/my-core', name: 'My Core', dir: 'examples/cores/my-core'});
```

## 2. Anatomy of the generated files

The scaffolder generates a self-contained, working document-driven-counter `ICore` implementation (the same pattern as the checked-in template `src/cores/custom-core-template/`, but rendered fresh from `devkit/templates/`, not copied):

| File | Role |
| --- | --- |
| `core.mjs` | The entry module. Exports a named `createCore()` factory and a `default` instance. Contains a working `ICore` implementation for a `<id>/cartridge@1` document-driven counter format, with `TODO` markers where you plug in your own cartridge format. |
| `core.manifest.json` | On-disk `ludotape/core-manifest@1` metadata used for discovery and static validation without importing the entry. |
| `sample-cartridge.mjs` | A sample authoring document (`{target: 3}`) for the generated cartridge format, used by `core conformance` and static smoke-testing. |
| `README.md` | How to adapt the generated core to your own cartridge format. |

The entry-module convention is strict (see [Entry-module convention](../CORE_SPEC.md#entry-module-convention)):

- `createCore()` — a factory returning a **fresh** `ICore` instance every call; it MUST be safe to call more than once.
- `default` — the instance produced by exactly one `createCore()` call, for direct `import`.

`loadCoreFromManifest` always calls `createCore()` itself rather than trust `default`, so registries never share one mutable instance.

## 3. Implement each ICore method

Implement your core against your own cartridge format. The required and optional members, with exact signatures, are tabulated in the [custom core reference](custom-core-reference.md#icore-member-contract); the short version:

| Member | Signature | Obligation |
| --- | --- | --- |
| `metadata` | deep-frozen canonical object | Always. Must match the manifest. |
| `loadCartridge(source)` | `(source) => cartridge` (MAY be async) | Always. Return a frozen cartridge with string `format` and `identity`; reject unrecognized `source` shapes with `E_CORE_CARTRIDGE`. |
| `createRun(cartridge, {seed} = {})` | `=> run` | Always. Same rules as `createRun` in `src/index.mjs`; state/journal getters return copies. |
| `availability(run)` | `=> action[]` | Always. Canonical array of currently legal actions in deterministic order. |
| `dispatch(run, action)` | `=> journalEntry` | Always. Frozen journal entry carrying before/after digests; throw a coded error (`E_ILLEGAL_ACTION` or a core-specific code) for an action not in `availability(run)`. |
| `project(run, adapter, options)` | `=> projection` | Always. `adapter`/`options` optional; canonical projection. |
| `init(host)` | `(host) => void` (MAY be async) | Optional. Called once at registration; `host` is `{log(...)}`. |
| `teardown()` | `() => void` (MAY be async) | Optional. Called once at deregistration. |
| `isGoal(run)` / `solve(cartridge, options)` | — | Required iff `capabilities.solve`. |
| `createReplay(run)` / `verifyReplay(cartridge, replay, options)` | — | Required iff `capabilities.replay`. |
| `rewindRun(run, turns)` | — | Required iff `capabilities.rewind`. |

Do **not** implement `tick` or `render`; the loader's `wrapCore` attaches them as exact aliases of `dispatch` and `project`, and overwrites any core-authored versions.

Declare a capability if and only if you implement its methods. The registry and the conformance suite enforce the [capability → method table](../CORE_SPEC.md#capability--method-requirements); a mismatch throws `E_CORE_CAPABILITY`. If you only need play-through and authoring support, set `{replay: false, rewind: false, solve: false, scenarios: true}` — the `scenarios` capability needs no dedicated method because `ludotape/authoring` works only through `availability`/`dispatch`/`project`.

## 4. Determinism rules

A core carries the same determinism obligations as ruleset callbacks:

- Consume randomness only through the run's seeded RNG stream — mirror `context.rng`/`createRng` from `src/index.mjs`. Never call `Date.now`, `performance.now`, `Math.random`, locale-sensitive APIs, or read the network, filesystem, or storage from run logic.
- `availability`, `project`, and `isGoal` are observational: they MUST NOT consume or advance RNG state.
- Two `createRun(cartridge, {seed})` calls with the same cartridge and seed, followed by identical action sequences, MUST produce identical state digests and projections. Conformance verifies this with a determinism twin run.
- All state, actions, documents, options, journal entries, and projections MUST be canonical values. Validate with `canonical()` from `src/index.mjs`.
- Journal entries MUST be deeply frozen and carry before/after state digests, mirroring the journal shape of `src/index.mjs`.

The full contract is [Input/output contract](../CORE_SPEC.md#inputoutput-contract).

## 5. Author the manifest

`core.manifest.json` describes the directory without importing it. Every field must exactly match the loaded core's `metadata` or loading fails with `E_CORE_MANIFEST`; unknown top-level keys are rejected.

```json
{
  "format": "ludotape/core-manifest@1",
  "id": "example/my-core",
  "version": "0.2.0",
  "name": "My Core",
  "description": "A one-line description",
  "entry": "./core.mjs",
  "capabilities": {"replay": true, "rewind": true, "solve": true, "scenarios": true},
  "cartridgeFormats": ["example/my-cartridge@1"]
}
```

Rules (full table in the [custom core reference](custom-core-reference.md#core-manifest-coremanifestjson)):

- `format` MUST equal `ludotape/core-manifest@1`.
- `entry` is a relative path that MUST start with `./`.
- `id`, `version`, `name`, `capabilities`, and `cartridgeFormats` MUST match `metadata` exactly.
- `description` is optional; if present in both manifest and metadata, they MUST match.

## 6. Register the core

Register into your own registry or the built-in default. Source-checkout imports use `src/core-loader.mjs`; package consumers use `ludotape/core`.

```js
import {createCoreRegistry, defaultRegistry} from '../src/core-loader.mjs';
import {createCore} from './core.mjs';

// A fresh, isolated registry:
const registry = createCoreRegistry();
registry.register(createCore());          // accepts an ICore instance...
registry.register(createCore);            // ...or a createCore factory function

// Or add to the registry that already holds the JS/TS core:
defaultRegistry.register(createCore());

const core = registry.get('example/my-core');   // throws E_CORE_UNKNOWN if absent
const selected = registry.resolve(cartridge);    // by cartridge.format; E_CORE_CARTRIDGE if none
```

`register` validates the shape, wraps it (attaching `tick`/`render`), calls `init(host)` if present, and rejects a duplicate id with `E_CORE_DUPLICATE`. To discover cores on disk without hand-registering them:

```js
import {discoverCores} from '../src/core-loader.mjs';

const {cores, diagnostics} = await discoverCores(['examples/cores']);
// A bad core becomes a diagnostic entry, never a thrown error.
```

## 7. Validate statically

Static validation checks the manifest, imports the entry, confirms `createCore` is exported, cross-checks metadata against the manifest, and runs `validateCoreShape` — **without** running gameplay. Use it as a fast pre-flight.

```sh
node devkit/validate-core.mjs examples/cores/my-core
```

It prints a JSON report to stdout and exits `1` on failure. The same check is available through the CLI (`ludotape core validate <coreDir>`) and programmatically as `validateCore(dirOrManifestPath)` from `devkit/index.mjs`. See the [CLI reference](cli-reference.md#core-validate).

## 8. Run conformance

Conformance is the operational definition of "this core satisfies the specification." The harness exercises the live core.

```sh
node bin/ludotape.mjs core conformance examples/cores/my-core example/my-cartridge.mjs 0
```

Programmatically, `runCoreConformance` is exported from `test/core-conformance.mjs` (package: `ludotape/conformance`):

```js
import {runCoreConformance} from '../test/core-conformance.mjs';
import * as cartridgeModule from './my-cartridge.mjs';
import {createCore} from './core.mjs';

const result = await runCoreConformance(createCore, {
  cartridgeSource: cartridgeModule,
  seed: 0,
  maxSteps: 25
});

console.log(result.ok, result.passed, result.failed);
for (const check of result.results) {
  if (!check.ok) console.error(check.name, check.message);
}
```

The harness checks, at minimum: metadata shape and canonicality; `loadCartridge` returns a frozen cartridge with an `identity` and a `format` listed in `cartridgeFormats`; `createRun` determinism; `availability` returns a canonical array; `dispatch` of an available action advances turn and returns a journal entry with before/after digests; `dispatch` of a garbage action throws a coded error; `project` returns a canonical value; every declared capability is cross-checked (replay round-trips through `verifyReplay`, rewind reconstructs, solve returns a status); and a determinism twin run over up to `maxSteps` turns choosing the first available action each turn. The full check list is in the [custom core reference](custom-core-reference.md#conformance-harness) and [Conformance](../CORE_SPEC.md#conformance).

A core MUST pass with `ok: true` to be conformant. Passing establishes contract compliance, not gameplay correctness or performance.

## 9. Worked example — the stub core

The checked-in example core `examples/cores/stub-core/` is a tiny working custom core (id `example/stub-core`, cartridge format `example/stub-cartridge@1`) that passes the conformance suite. Its files:

| File | Role |
| --- | --- |
| `core.mjs` | The `ICore` implementation and `createCore`/`default` exports. |
| `core.manifest.json` | The manifest for `example/stub-core`. |
| `stub-cartridge.mjs` | A sample cartridge in the `example/stub-cartridge@1` format. |
| `run-stub-core.mjs` | A demo script that loads the cartridge, plays it, and projects each turn. |

Run the demo and its conformance check from the repository root:

```sh
node examples/cores/stub-core/run-stub-core.mjs
node bin/ludotape.mjs core conformance examples/cores/stub-core examples/cores/stub-core/stub-cartridge.mjs 0
```

Load and drive the stub core through the loader exactly as a host would:

```js
import {createCoreRegistry} from '../src/core-loader.mjs';
import {createCore} from '../examples/cores/stub-core/core.mjs';
import cartridge from '../examples/cores/stub-core/stub-cartridge.mjs';

const registry = createCoreRegistry();
registry.register(createCore);

const core = registry.resolve(cartridge);        // selects example/stub-core by format
const loaded = await core.loadCartridge(cartridge);
const run = core.createRun(loaded, {seed: 0});

for (const action of core.availability(run)) {
  core.tick(run, action);                        // tick === dispatch
  console.log(core.render(run));                 // render === project
  break;
}
```

Copy the stub core as the starting point for a real core, then replace the cartridge format, state, actions, transition, and projection with your own.

## Troubleshooting

Every core-layer error is a `LudotapeError` with one of these `code` values.

| Code | Cause | Fix |
| --- | --- | --- |
| `E_CORE` | Generic core-layer failure not covered by a more specific code. | Read the message and `details`; usually a downstream condition surfaces a more specific code. |
| `E_CORE_METADATA` | `metadata` failed shape/canonicality validation: missing or invalid `format`, `id`, `version`, `name`, `capabilities`, or `cartridgeFormats`. | Ensure `format` is exactly `ludotape/core@1`, all strings are non-empty, `capabilities` has exactly the four boolean keys, and `cartridgeFormats` is a non-empty array of non-empty strings. |
| `E_CORE_SHAPE` | `wrapCore`/`register` received a core failing `validateCoreShape`: a missing required member, wrong type, or malformed capability table. | Run `validateCoreShape(core)` and read its diagnostics; implement the flagged member. |
| `E_CORE_MANIFEST` | `core.manifest.json` is malformed, has unknown top-level keys, or a field does not match `metadata`. | Reconcile every manifest field with `metadata`; remove extra keys; ensure `entry` starts with `./`. |
| `E_CORE_ENTRY` | The manifest `entry` module cannot be imported, or lacks a named `createCore` export. | Fix the import path/error; export `createCore` (named) and `default`. |
| `E_CORE_DUPLICATE` | `register` was called with an `id` already present in the registry. | Use a distinct `id`, or `unregister(id)` first. |
| `E_CORE_UNKNOWN` | `get(id)` (or a lookup) used an unregistered `id`. | Register the core, or check the id spelling; use `list()` to see registered ids. |
| `E_CORE_CAPABILITY` | A declared capability's required method is missing or failed while exercised. | Implement the method, or set the capability to `false`. |
| `E_CORE_CARTRIDGE` | `resolve(cartridge)` found no core for `cartridge.format`, or `loadCartridge` received an unrecognized `source` shape. | Add the format to `cartridgeFormats`, register a matching core, or pass a supported source. |

## See also

- [Custom core reference](custom-core-reference.md) — member-by-member `ICore`, loader, registry, manifest, and conformance API.
- [JS/TS core reference](js-ts-core-reference.md) — the reference core to model yours on.
- [Core specification](../CORE_SPEC.md) — normative rules.
- [SDK publishing guide](sdk-publishing-guide.md) — package and publish your core.
- [CLI reference](cli-reference.md) — `core` commands and devkit CLIs.
