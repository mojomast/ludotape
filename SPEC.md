# Specification

## Vocabulary

A **ruleset** is a `defineGame` callback bundle. A **document** is canonical JSON-compatible authored data. A **cartridge** is a compiled ruleset/document pair whose identity binds the ruleset id, version, metadata, and document. A **run** owns current state, seed, RNG, and a separate append-only **transition journal**. An **action** is a canonical value listed by `availability`. A **projection** is renderer-neutral view data. A **replay** stores identity, seed, actions, and state-digest checkpoints.

## Required behavior

`compileCartridge` computes `SHA-256(canonical({format,ruleset,document}))`. `createRun` evaluates initial state once with a seeded context. `dispatch` rejects actions absent from current availability, clones callback boundaries, advances state, and journals before/after digests. It does not embed journal data in game state. Replay verification reconstructs a run and validates identity, initial digest, each supplied checkpoint, and final digest. Solving is FIFO breadth-first search, deduplicated by state digest and bounded by depth and node count.

Canonical values are null, booleans, finite numbers, strings, arrays, and plain objects. Object keys sort lexicographically; negative zero becomes zero. Undefined, bigint, symbols, functions, non-finite numbers, cycles, and class instances are rejected.

## Non-goals

Sandboxing callbacks, preserving closures in cartridge files, multiplayer consensus, cryptographic signatures, tamper resistance, continuous-time simulation, DOM ownership, and universal engine-independent floating-point equivalence are not specified.
