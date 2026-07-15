# Specification

## Vocabulary

A **ruleset** is a trusted `defineGame` callback bundle. A **document** is bounded canonical authored data. A **cartridge** is a deeply frozen rules/document snapshot exposing `rulesDigest`, `rulesVersion`, and an identity that binds both plus the document. A **run** has private state, RNG state, turn, and append-only journal behind an immutable facade. An **action** is a canonical value listed by `availability`; a **projection** is renderer-neutral canonical view data.

## Canonical values and digests

Canonical values are null, booleans, finite numbers, strings, dense undecorated arrays, and plain data-property objects. Keys sort lexicographically and negative zero becomes zero. Sparse arrays, extra/symbol/accessor/non-enumerable properties, dangerous keys, cycles, shared references, unsupported primitives, class instances, and exceeded depth/node/byte limits are rejected without invoking getters. `sha256Text` hashes raw UTF-8 text. `digest` hashes canonical value text, including JSON quotes for strings.

## Execution

`initialState` and successful `transition` calls may consume the run RNG. Each transition uses a transaction-local stream and commits state, RNG state, turn, and a deeply frozen journal entry together; failure commits nothing. `actions`, `project`, and `isGoal` are observational and receive no RNG. Callback inputs are clones. Cartridge documents and metadata are frozen.

Run state and journal getters return copies. Replays and projections have no aliases to committed internals. Adapters receive a frozen projection and frozen metadata snapshot, not a live run.

## Replay and solver

Replay v1 has exactly `format`, `cartridge`, `seed`, `initial`, `actions`, `checkpoints`, and `final`. Arrays, every digest/checkpoint, seed, depth, action count, nodes, and bytes are strictly validated under hard limits. Verification reconstructs execution and checks every checkpoint. Solving is indexed-queue FIFO BFS; its deduplication key includes visible state, RNG state, and turn. Depth, visited nodes, fanout, generated children, queue, and state bytes have finite integer limits and hard ceilings. Exhaustion is `unsolved`; any reached bound is `bounded`.

## Cores

Execution described above is exposed through pluggable cores: a core is a frozen object implementing the `ICore` interface, interpreting one or more cartridge formats, and providing the standard `loadCartridge`/`createRun`/`availability`/`dispatch`/`project` lifecycle plus optional replay/rewind/solve capabilities. [CORE_SPEC.md](CORE_SPEC.md) is the normative specification for `ICore`, core metadata and manifests, the loader/registry, and conformance; this document's canonical-value and determinism requirements apply unchanged to every core. A core MUST NOT accept non-canonical state, actions, or projections, and MUST consume randomness only through the same seeded RNG discipline as the built-in runtime. The built-in `ludotape/js-ts-core` is the reference implementation of this section, delegating directly to the execution rules above.

## Non-goals

Callback sandboxing, multiplayer consensus, signatures, anti-cheat, continuous-time simulation, DOM ownership, and universal cross-engine floating-point equivalence are not specified.
