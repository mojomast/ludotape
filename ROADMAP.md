# Roadmap

Version 0.2.0 is the current release documented in the changelog and package metadata.

## What 0.2.0 delivered

- A formal pluggable-core layer: `CORE_SPEC.md`, the `ICore` interface, `ludotape/core` loader/registry, and a conformance harness (`ludotape/conformance`) that operationally defines "a core satisfies the spec."
- A reference JS/TS core (`ludotape/js-ts-core`) delegating to the existing runtime, plus a working custom-core template and a passing example stub core.
- A devkit (`ludotape/devkit`): scaffolding CLIs and programmatic API for new games and new cores, static core validation, and a TypeScript declaration bundle for the whole package.
- CLI `core list | validate | conformance`, a rewritten CI pipeline (lint/typecheck/test-matrix/conformance/build-smoke/benchmark/tag-gated publish), and a core-dispatch benchmark.

Of the 0.2 candidates named in the previous roadmap: the solver strategy interface, runtime compatibility matrix, and replay migration/checkpoint tooling did not land and carry forward below. Browser integration coverage and Studio accessibility improvements did not land either; Studio still only loads its bundled examples and has not yet been wired to the core registry.

## 0.3 candidates

- Studio multi-core integration: let Studio load arbitrary registered cores and cartridges, not just the bundled examples.
- Replay migration tooling and optional checkpoint intervals.
- A solver strategy interface and richer scenario/report integrations.
- A measured runtime compatibility matrix across supported Node versions and cores.
- WASM-core exploration: whether the `ICore` contract can be satisfied by a WebAssembly-backed core without weakening determinism or trust guarantees.
- A registry (or index) of community-published cores, distinct from the in-process `createCoreRegistry()`.

Bounded checks remain evidence rather than a claim of exhaustive verification. Conformance passing is evidence a core satisfies `CORE_SPEC.md`, not a security or sandboxing guarantee.

Callback sandboxing, authoritative multiplayer, asset bundling, physics, monetization, and anti-cheat are explicitly outside core scope. Roadmap items are intentions, not commitments.
