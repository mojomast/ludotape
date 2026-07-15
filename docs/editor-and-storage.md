# Editor and storage

`createDraft` is a headless editor for bounded canonical documents. `replace` and `update` create undo points; frozen `snapshot` output includes a value digest; `markSaved` clears dirty history. This is single-session history, not collaborative editing.

The memory repository is ephemeral. The Storage repository accepts browser `localStorage` or a conforming synchronous Web Storage-compatible object: each `setItem`/`removeItem` must either complete or throw without changing that key. Both implementations validate keys, clone values, sort lists, report absent deletes consistently, and expose async `put`, `get`, `delete`, `list`, and `clear`. Namespaced multi-key clear attempts rollback on failure. Hosts remain responsible for quota, consent, migration, and backup.
