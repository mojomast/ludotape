# API reference

- `canonical(value): string` — strict canonical JSON text.
- `digest(value): string` — lowercase SHA-256; strings hash as text, other values canonically.
- `createRng(seed)` — `{next, int(max), pick(items), state}`.
- `defineGame(spec)` — validates and freezes a ruleset.
- `compileCartridge(game, document)` — returns identity-bound cartridge.
- `createRun(cartridge, {seed})` — mutable runtime with separate `state` and `journal`.
- `availability(run)` / `legalActions(run)` — cloned legal actions.
- `dispatch(run, action)` — validates, transitions, journals, returns entry.
- `project(run, adapter?)` — renderer-neutral projection, optionally consumed.
- `createReplay(run)` / `replay.create(run)` — portable replay object.
- `verifyReplay(cartridge, replay)` / `replay.verify` — `{ok,...}` without throwing verification failures.
- `solve(cartridge, options)` — bounded BFS; options include seed, maxDepth, maxNodes, isGoal.
- `createMemoryRepository()`, `createStorageRepository(storage, options)` — async repository methods.
- `createDraft(initial)` — replace, update, undo, snapshot, markSaved.
- `semanticAdapter(root)`, `canvasAdapter(canvas, options)` — browser adapters.

Contract errors are `LudotapeError` values with a stable `code` and message.
