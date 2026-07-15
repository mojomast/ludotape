# Determinism contract

Determinism is shared responsibility. Ludotape supplies bounded canonical cloning/value hashing and seeded transactional RNG. Authors must avoid wall clocks, `Math.random`, locale-sensitive operations, host I/O, unordered external data, mutable globals, and asynchronous races. Use finite values and prefer integers for portable arithmetic.

A seed drives one committed RNG stream. `initialState` may consume it. Each legal `transition` receives a transaction-local continuation; the continuation commits only when output validates. `actions`, `project`, and `isGoal` receive no RNG and cannot consume the stream. Replay reproduces state and RNG progression. Callback source is not hashed, so bump ruleset version after every semantic code change.

The test suite establishes behavior on tested runtimes. Ludotape does not claim unmeasured bit-identical floating-point results across every engine, architecture, or future version.
