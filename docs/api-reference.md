# API reference

## `ludotape`

- `canonical(value, limits?): string` — strict bounded canonical JSON; rejects hostile descriptors, sparse arrays, dangerous keys, cycles, and aliases.
- `sha256Text(text): string` — raw UTF-8 text SHA-256.
- `digest(value, limits?)` / `valueDigest(value, limits?)` — SHA-256 of the canonical **value**. Thus `digest(null) !== digest('null')`.
- `createRng(seed)` — deterministic `{next(), int(max), pick(items), state}`.
- `defineGame(spec)`; `compileCartridge(game, document)` — validate rules and create a deeply frozen, identity-bound cartridge with `rulesDigest` and `rulesVersion`.
- `createRun(cartridge, {seed?})` — opaque frozen facade. `state` and `journal` getters return isolated copies; `turn` is live.
- `availability(run)` / `legalActions(run)` — cloned legal actions.
- `dispatch(run, action)` — legal transactional transition and frozen journal entry.
- `project(run, adapter?, limits?)` — validates/freezes projection; adapter receives `(view, snapshotMetadata)`, never the run.
- `createReplay(run)` / `replay.create(run)` — isolated replay object.
- `verifyReplay(cartridge, replay, limits?)` / `replay.verify(...)` — non-throwing `{ok,...}` for verification failures.
- `solve(cartridge, options?)` — bounded FIFO BFS. Options: `seed`, `maxDepth`, `maxNodes`, `maxActions`, `maxGenerated`, `maxQueue`, `maxStateBytes`, `isGoal`.

Only `initialState(context)` and `transition(state, action, context)` receive `context.rng`. Observational `actions`, `project`, and `isGoal` callbacks do not.

## Subpaths

```js
import {semanticAdapter, canvasAdapter} from 'ludotape/adapters';
import {createMemoryRepository, createStorageRepository} from 'ludotape/storage';
import {createDraft} from 'ludotape/editor';
```

Repository methods are asynchronous: `put(key,value)`, `get(key)`, `delete(key)`, `list(prefix?)`, and `clear()`. Contract failures are `LudotapeError` values with stable `code` strings.
