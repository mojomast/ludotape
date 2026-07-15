# Architecture

Ludotape is layered without external packages:

1. `src/index.mjs`: canonical data, hashing, RNG, rules, cartridges, runtime, replay, BFS.
2. `src/storage.mjs`: opt-in repositories; the core never persists implicitly.
3. `src/editor.mjs`: headless document draft history.
4. `src/adapters.mjs`: view consumers; game logic does not import renderers.
5. `examples/`: real rulesets and documents.
6. `studio/`: static browser shell using public APIs.
7. `bin/`: Node 20+ CLI; `bench/` and `scripts/` provide evidence and builds.

State and journal are separate. A run is intentionally mutable orchestration around cloned canonical state, while journal entries are frozen snapshots. Cartridge identity binds declarative ruleset coordinates and document, not callback source text; authors must bump the ruleset version whenever callback behavior changes.

Security boundary: ruleset/editor callbacks execute with the authority of their host realm. Adapters are downstream and cannot influence state unless application code dispatches an action.
