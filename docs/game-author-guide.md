# Game author guide

Define a stable `id` and bump `version` whenever callback behavior changes (callback source is not hashed). `initialState(context)` returns canonical state. `actions(state, context)` returns all legal canonical actions. `transition(state, action, context)` returns next state. Optional `project` returns canonical renderer-neutral view data and `isGoal` supports solving.

Only `initialState` and `transition` receive `context.rng`; use it instead of `Math.random`. `actions`, `project`, and `isGoal` are observational and deliberately receive no consuming RNG. A failed transition rolls back its RNG consumption. Avoid clocks, locale dependence, I/O, mutable globals, getters, aliases, and asynchronous races. Game callbacks are trusted code and must never be loaded from untrusted modules.
