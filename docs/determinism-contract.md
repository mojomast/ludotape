# Determinism contract

Determinism is shared responsibility. Ludotape supplies canonical cloning/hashing and a seeded RNG. Authors must avoid wall clocks, `Math.random`, locale-sensitive operations, host I/O, unordered external data, mutable globals, and asynchronous races in all callbacks. Use finite numeric values and consider integers for portable game arithmetic.

A seed drives one RNG stream: initial-state generation may consume it, and transitions continue it. Replaying repeats that sequence. Callback source is not hashed; bump the ruleset version after any semantic code change.

The test suite establishes behavior on its tested runtime. JavaScript standards reduce variation, but Ludotape does not claim unproven bit-identical results across all engines, architectures, or future versions.
