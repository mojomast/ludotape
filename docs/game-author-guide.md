# Game author guide

Define a stable `id` and bump `version` whenever behavior changes. `initialState(context)` returns canonical state. `actions(state, context)` returns every currently legal canonical action. `transition(state, action, context)` returns the next canonical state and must not mutate external data. Optional `project` returns view data and `isGoal` supports solving.

Use `context.rng`, never `Math.random`; represent time as actions or state, not wall-clock reads. Keep documents canonical and projections renderer-neutral. Actions should carry enough information to replay but no authority beyond what `actions` currently lists. The host trusts callbacks: never load untrusted game modules.
