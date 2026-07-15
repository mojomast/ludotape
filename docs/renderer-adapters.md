# Renderer adapters

`project(run)` validates, clones, and deeply freezes bounded renderer-neutral data. With an adapter, the call is `adapter(view, metadata)`, where metadata is a frozen snapshot containing cartridge identity/rules fields, seed, turn, and state digest—not a live run. Cycles, getters, aliases, excessive depth/nodes/text, and unsupported values are rejected. Projection or renderer failure cannot commit game state.

`semanticAdapter(root)` prepares a fragment before replacing DOM children. `canvasAdapter(canvas, {draw})` invokes `draw(context, view, metadata)`; the default draws bounded JSON text. Input handlers should select an action from `availability(run)` and dispatch it.
