# SDK publishing guide

This guide describes how to publish a Ludotape **core** as a standalone npm package that consumers can install and register. It covers package layout, naming, `package.json` essentials, a pre-publish checklist, how consumers load your core, and a CI suggestion. It assumes you have already built and conformance-checked a core with the [core authoring guide](core-authoring-guide.md).

Publishing is optional. A core can live inside an application repository and be registered directly; packaging matters when you want to distribute it. Cores are trusted JavaScript — a consumer who installs and registers your core runs it with the authority of their host realm ([Trust and scope](../CORE_SPEC.md#trust-and-scope)).

## Overview

A publishable core is a small ESM package whose entry module follows the core entry convention (a named `createCore()` factory plus a `default` instance) and ships a `core.manifest.json`. Consumers either `import` your entry and `register` it, or point `loadCoreFromManifest` at the installed manifest path.

## Prerequisites

- Node.js 20+. Keep the package **zero runtime dependencies** where possible — Ludotape itself is zero-dependency, and a core needs only Node stdlib, its own logic, and `LudotapeError` from the framework.
- A conformant core: it passes `validate-core` and `runCoreConformance` (see [Custom core reference](custom-core-reference.md#conformance-harness)).
- `ludotape` declared as a peer (or documented prerequisite) so `LudotapeError` and the loader come from the consumer's installed framework rather than a bundled copy.

## Package layout

```text
ludotape-core-<name>/
├── core.mjs             # entry: named createCore() + default instance
├── core.manifest.json   # ludotape/core-manifest@1; entry "./core.mjs"
├── types.d.ts           # TypeScript declarations (optional but recommended)
├── README.md            # what format it interprets, capabilities, usage
├── LICENSE
└── package.json
```

Keep the entry module self-contained. Import `LudotapeError` from the consumer's `ludotape` (a peer), not from a vendored copy, so error `code` identity is shared across the framework and your core.

## Naming convention

- Package name: `ludotape-core-<name>` (or a scoped `@scope/ludotape-core-<name>`). This makes cores discoverable and signals the package type.
- Core `id` and manifest `id`: a `scope/name` convention such as `example/my-core`. The core `id` need not equal the npm package name, but keep it stable — it is the registry key and conformance identity.
- `keywords`: include `ludotape`, `ludotape-core`, and the cartridge format(s) you interpret.

## `package.json` essentials

```json
{
  "name": "ludotape-core-example",
  "version": "0.2.0",
  "description": "A Ludotape core interpreting example/my-cartridge@1.",
  "type": "module",
  "license": "MIT",
  "keywords": ["ludotape", "ludotape-core", "example/my-cartridge@1"],
  "engines": {"node": ">=20"},
  "exports": {
    ".": {
      "types": "./types.d.ts",
      "import": "./core.mjs"
    },
    "./manifest": "./core.manifest.json"
  },
  "files": ["core.mjs", "core.manifest.json", "types.d.ts", "README.md", "LICENSE"],
  "peerDependencies": {"ludotape": ">=0.2"},
  "dependencies": {}
}
```

Notes:

- `"type": "module"` — ESM only, matching Ludotape's `.mjs` convention.
- In `exports`, put the `types` condition **first** in each object, then `import`. Exposing `./manifest` lets consumers resolve the manifest path for `loadCoreFromManifest`.
- `engines.node >= 20` matches the framework floor.
- Keep `dependencies` empty; declare `ludotape` as a peer so the consumer supplies one framework instance.
- `files` ships only the runtime artifacts — no tests, no scaffolding.

## Pre-publish checklist

1. **Static validation** — `node devkit/validate-core.mjs <coreDir>` (or `ludotape core validate <coreDir>`) reports no errors.
2. **Conformance** — `runCoreConformance(createCore, {cartridgeSource, seed: 0})` returns `ok: true` (see the [conformance harness](custom-core-reference.md#conformance-harness)). Ship a sample cartridge for consumers to reproduce it.
3. **Determinism** — no `Date.now`/`Math.random`/IO in run logic; the twin run in conformance passes ([Input/output contract](../CORE_SPEC.md#inputoutput-contract)).
4. **Metadata ↔ manifest match** — `id`, `version`, `name`, `capabilities`, and `cartridgeFormats` are identical in `metadata` and `core.manifest.json`; `entry` starts with `./`; no extra manifest keys.
5. **Pack inspection** — `npm pack` and inspect the tarball; confirm `files` includes exactly `core.mjs`, `core.manifest.json`, types, `README.md`, and `LICENSE`, and nothing else.
6. **Versioning discipline** — semantic versioning tied to behaviour. Bump the **major** when a cartridge-format interpretation or an error `code` meaning changes (mirroring the `rulesVersion` discipline in [SPEC.md](../SPEC.md) and the format policy in [CORE_SPEC.md](../CORE_SPEC.md#versioning-and-compatibility)); bump minor for additive, backward-compatible capabilities; patch for fixes that do not change digests or replays.
7. **Format literals** — `metadata.format` is `ludotape/core@1` and the manifest `format` is `ludotape/core-manifest@1`; a breaking change to either requires an `@2` literal, not a silent change.

## How consumers load your core

Two supported paths.

### Import and register

```js
import {createCoreRegistry} from 'ludotape/core';
import {createCore} from 'ludotape-core-example';   // your named factory export

const registry = createCoreRegistry();
registry.register(createCore);                       // factory or instance both accepted

const core = registry.resolve(cartridge);            // by cartridge.format
const loaded = await core.loadCartridge(cartridge);
const run = core.createRun(loaded, {seed: 0});
```

### Load from the installed manifest

```js
import {createRequire} from 'node:module';
import {loadCoreFromManifest} from 'ludotape/core';

const require = createRequire(import.meta.url);
const manifestPath = require.resolve('ludotape-core-example/manifest');
const core = await loadCoreFromManifest(manifestPath);
```

`loadCoreFromManifest` calls your `createCore()` itself and cross-checks the loaded metadata against the manifest, so a mismatch fails fast with `E_CORE_MANIFEST`.

## CI suggestion

Run these in CI before publish (matching the framework's zero-dependency, `node --test` style):

- `node devkit/validate-core.mjs .` — static validation.
- `node --test` — a test that calls `runCoreConformance` against your core and sample cartridge and asserts `result.ok`.
- `npm pack --dry-run` — confirm the shipped file list.
- Gate the actual publish on a version tag, and use `npm publish --provenance` when your CI supports it.

## Troubleshooting

| Symptom | Code | Fix |
| --- | --- | --- |
| Consumer's `import` resolves but `register` throws | `E_CORE_SHAPE`/`E_CORE_METADATA` | The published entry fails `validateCoreShape`; re-run `validate-core` before publishing. |
| `loadCoreFromManifest` fails after install | `E_CORE_MANIFEST`/`E_CORE_ENTRY` | Ensure `core.manifest.json` and `core.mjs` are in `files`, `entry` is `./core.mjs`, and manifest fields match `metadata`. |
| Consumer cannot resolve `ludotape-core-example/manifest` | — | Add the `./manifest` subpath to `exports` and include `core.manifest.json` in `files`. |
| Error `code` comparisons fail in the consumer app | — | Import `LudotapeError` from the peer `ludotape`, not a bundled copy, so `code` identity is shared. |
| Two cores collide when both registered | `E_CORE_DUPLICATE` | Give each core a distinct `metadata.id`; ids are the registry key. |
| Duplicate framework instance / doubled state | — | Declare `ludotape` as a peer dependency, not a bundled dependency. |

## See also

- [Core authoring guide](core-authoring-guide.md) — build the core you are publishing.
- [Custom core reference](custom-core-reference.md) — loader, registry, manifest, and conformance API.
- [Core specification](../CORE_SPEC.md) — versioning and compatibility policy.
- [CLI reference](cli-reference.md) — `validate-core` and `core conformance`.
- [Devkit and cores overview](devkit-overview.md) — where cores fit in the SDK.
