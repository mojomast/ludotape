# Architecture

Ludotape is layered without external packages:

1. `src/index.mjs`: canonical data, hashing, RNG, rules, cartridges, runtime, replay, BFS.
2. `src/core-loader.mjs`: the pluggable-core registry — shape validation, wrapping, manifest/directory discovery — sitting conceptually between the core runtime and the authoring layer; see [CORE_SPEC.md](CORE_SPEC.md).
3. `src/cores/`: the reference JS/TS core (`js-ts-core`, delegating to `src/index.mjs`) and a commented custom-core template for authors targeting other cartridge formats.
4. `src/authoring.mjs`: action traces, exact scenarios, and bounded action-tree checks built only on public core behavior.
5. `src/storage.mjs`: opt-in repositories; the core never persists implicitly.
6. `src/editor.mjs`: headless document draft history.
7. `src/adapters.mjs`: view consumers; game logic does not import renderers.
8. `examples/`: real rulesets, documents, and scenario declarations, including `examples/cores/stub-core/`, a minimal working custom core.
9. `studio/`: static browser shell using public APIs.
10. `devkit/`: scaffolding CLIs and programmatic API for new games and new cores.
11. `test/core-conformance.mjs`: the conformance harness that operationally defines whether a core satisfies `CORE_SPEC.md`.
12. `bin/`: Node 20+ CLI; `bench/` and `scripts/` provide evidence and builds.

State and journal are separate. A run is intentionally mutable orchestration around cloned canonical state, while journal entries are frozen snapshots. Cartridge identity binds declarative ruleset coordinates and document, not callback source text; authors must bump the ruleset version whenever callback behavior changes.

Security boundary: ruleset/editor callbacks execute with the authority of their host realm. Adapters are downstream and cannot influence state unless application code dispatches an action. Pluggable cores are trusted code exactly like rulesets: registering or loading a core executes its module with full host authority, and `ICore` conformance is a correctness/capability contract, not a sandboxing or isolation guarantee.

Authoring tools never inject arbitrary runtime state. They create seeded runs and reach observations through canonical actions, preserving action legality, RNG consumption, replay format, and cartridge identity. Scenario declarations are canonical test protocol data. The checker breadth-first explores only configured depth/path/action bounds and reports actual coverage plus truncation flags; its result is evidence, not proof of determinism or correctness. CLI cartridge and scenario modules are trusted imports and execute with Node's process authority.
