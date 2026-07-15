# Changelog

This project follows Keep a Changelog. Semantic-version stability is not promised before 1.0.

## [Unreleased]

## [0.2.0]

- Added `CORE_SPEC.md`, the formal specification of the pluggable core layer: the `ICore` interface, core metadata/manifest schema, loader/registry behavior, conformance, lifecycle, and the `ludotape/core@1` versioning policy.
- Added the `ludotape/core` subpath (`src/core-loader.mjs`): `validateCoreShape`, `wrapCore`, `createCoreRegistry`, `loadCoreFromManifest`, `discoverCores`, and a pre-populated `defaultRegistry`.
- Added the `ludotape/js-ts-core` subpath, the reference JS/TS core implementing `ICore` (id `ludotape/js-ts-core`, all four capabilities) with bundled `types.d.ts` and a one-stop re-export of the author-facing runtime API.
- Added `src/cores/custom-core-template/`, a working, heavily commented template core for building custom cartridge formats against the `ludotape/custom-cartridge@1` shape.
- Added `examples/cores/stub-core/`, a working example custom core (`example/stub-core`) with a sample cartridge and demo runner.
- Added the `ludotape/conformance` subpath (`test/core-conformance.mjs`) exporting `runCoreConformance`, plus new core-loader, conformance, devkit, and JS/TS core test suites.
- Added the `devkit/` package: `scaffoldGame`/`scaffoldCore`/`validateCore` programmatic API (`ludotape/devkit` subpath), the `ludotape-create` and `ludotape-create-core` scaffolding CLIs, static core validation, templates, and a TypeScript config template for game authors.
- Added a root TypeScript declaration bundle (`types/ludotape.d.ts`); package now exposes `types` conditions for the main and `js-ts-core` entry points.
- Added a CLI `core` command group: `core list`, `core validate <coreDir>`, and `core conformance <coreDir> <cartridge.mjs> [seed]`.
- Added `bench/core-dispatch.bench.mjs`, a deterministic benchmark comparing dispatch throughput through the `ICore` surface against the direct core API (roughly 10% overhead).
- Changed CI: rewrote `.github/workflows` into lint, typecheck, test-matrix, conformance, build-smoke, benchmark, and tag-gated dry-run publish jobs; added `scripts/lint.mjs`, `.github/CODEOWNERS`, and a `new-core-request` issue template.
- Changed the `check` script to run `lint` first and added a `benchmark:core` script; no new runtime or development dependencies were introduced, and the trust model is unchanged: cores are trusted code, exactly like cartridges.
- Added the `ludotape/authoring` subpath with frozen action traces, exact declarative scenarios, aggregate diagnostics, and bounded twin-execution cartridge checks.
- Added core `defineCartridge`, bounded `runActions`, verified `rewindRun`, and deterministic nonmutating `shuffle`, `die`, and `dice` RNG helpers.
- Added CLI `check` and `test`, a Basic Counter scenario fixture, package-surface coverage, and a complete cartridge-authoring toolkit guide.
- Added incremental replay cursors, one-time missing-projector warnings, validated solver goals, memoized SHA constants, and a reclaiming BFS queue.
- Added draft redo/history metadata and validated draft restoration.
- Added canonical Web Storage writes, a lazy IndexedDB repository, terminal rendering, responsive canvas redraws, and richer semantic ARIA output.
- Hardened Studio state, parsing and seed errors, deterministic rewind reconstruction, tabs, and keyboard shortcuts.
- Added focused editor, storage, and adapter regression suites.
- Added a readable, runnable Basic Counter cartridge with end-to-end onboarding tests and first-game tutorials.
- Added optional `project` callback validation and package-artifact verification; packaged CLI benchmarks now include their implementation.

## [0.1.0]

- Deterministic core with bounded hostile-safe canonicalization and distinct raw-text/value SHA-256 APIs.
- Deeply frozen identity-bound cartridges, transactional RNG, isolated runs/journals/projections.
- Strict bounded replay validation and execution-state-aware bounded BFS.
- Memory and Web Storage repositories, draft editor, adapters, Studio, two examples, and hardened loopback static server.
- Zero-dependency CLI, 100+ tests, build, smoke, benchmark, documentation, and contribution templates.
