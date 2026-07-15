# Custom Core Template

A working, heavily-commented skeleton for authoring a Ludotape core that
interprets a cartridge format **other than** the built-in `ludotape/cartridge@1`
JS/TS format. It implements the [ICore contract](../../../CORE_SPEC.md) for a
toy declarative format, `ludotape/custom-cartridge@1`: a document
`{start?, target, step?}` describing "increment a counter from `start` to
`target`, `step` at a time".

Use this template as a starting point for cores that interpret, for example,
a JSON rules DSL, a data-driven board layout, or any other format that isn't
plain JS/TS game code (for that, see `src/cores/js-ts-core/`).

## What's here

- `core.mjs` -- the ICore implementation. Every extension point is marked
  `TODO:`.
- `core.manifest.json` -- the manifest the loader/CLI/devkit use to discover
  and validate this core statically (without importing gameplay code).
- `types.d.ts` -- minimal `ICore`/`CoreMetadata` TypeScript declarations for
  editor tooling.
- `README.md` -- this file.

## How to copy and adapt this template

1. **Copy the directory.** Pick a new location and id, e.g.:

   ```sh
   cp -r src/cores/custom-core-template src/cores/my-format-core
   ```

   (Or use `devkit/create-core.mjs` once available, which scaffolds this
   exact template with your chosen id/name pre-filled.)

2. **Design your cartridge format.** Decide on:
   - a unique cartridge format string, e.g. `'my-org/my-format@1'`
   - the shape of your `document` (the authored, canonical data your rules
     read)
   - what internal `state` looks like

3. **Rewrite the six engine functions in `core.mjs`:**
   - `normalizeDocument(raw)` -- parse/validate the authored document. Throw
     `LudotapeError('E_CORE_CARTRIDGE', ...)` for anything malformed.
   - `initialState(document)` -- derive the starting state.
   - `computeActions(document, state)` -- return the canonical array of legal
     actions for a state. This backs both `availability()` and the illegal-
     action check inside `dispatch()`.
   - `transition(document, state, action, rng)` -- pure state transition.
     Only use `rng` (never `Math.random()`/`Date.now()`) if your rules need
     randomness -- and only inside `transition`/`initialState`.
   - `project(run, adapter)` -- return a renderer-neutral view of the run.
   - `loadCartridge(source)` -- accept both an authoring-shape source (module
     namespace / `{document}`) and an already-compiled cartridge object.

4. **Update `metadata` in `core.mjs`** (id, version, name, description,
   `cartridgeFormats: [YOUR_FORMAT]`) and choose an **honest** `capabilities`
   set:
   - `replay: true` only if `createReplay`/`verifyReplay` actually round-trip
     for your format (the template's journal-based implementation usually
     needs no changes).
   - `rewind: true` only if `rewindRun` actually reconstructs state (the
     template's journal-replay implementation usually needs no changes).
   - `solve: true` only if you keep (or replace) `isGoal`/`solve` with logic
     that's actually correct for your rules. **If your rules branch** (more
     than one legal action per state that matters for solving), replace the
     template's greedy walk with a real bounded search -- see
     `src/index.mjs`'s `solve()` for a reference bounded BFS.
   - `scenarios: false` is fine unless you also build a scenario runner like
     `src/authoring.mjs`'s `runScenarios`.

5. **Update `core.manifest.json`** to match `metadata` **exactly** (`id`,
   `version`, `name`, `capabilities`, `cartridgeFormats`, and `description` if
   present in both). The loader rejects manifest/metadata mismatches with
   `E_CORE_MANIFEST`.

6. **Write a sample cartridge module** for your format (see
   `examples/cores/stub-core/stub-cartridge.mjs` for a minimal pattern) and a
   `run-*.mjs` demo script that loads the core, loads the cartridge, and
   drives it to completion.

7. **Validate and test:**

   ```sh
   node bin/ludotape.mjs core validate src/cores/my-format-core
   node bin/ludotape.mjs core conformance src/cores/my-format-core path/to/sample-cartridge.mjs
   ```

   Both commands use `src/core-loader.mjs` and `test/core-conformance.mjs`
   under the hood -- the same conformance suite the built-in JS/TS core and
   the example stub core must pass.

8. **Register it** by adding it to a `createCoreRegistry()` (or the
   `defaultRegistry`, or `discoverCores([...])` scanning a directory that
   contains it) so it's reachable at runtime.

## Determinism checklist

- Never call `Math.random()`, `Date.now()`, or read locale/timezone data from
  inside `initialState`, `computeActions`, `transition`, `project`, or
  `isGoal`.
- Only consume randomness via the `rng` parameter passed into
  `initialState`/`transition`.
- Keep `state`, `action`, and projection values canonical (no functions,
  symbols, class instances, `undefined`, cycles, or shared references) --
  `canonical()`/`clone()`/`digest()` from `../../index.mjs` will reject
  anything that isn't.
