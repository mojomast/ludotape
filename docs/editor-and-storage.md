# Editor and storage

`createDraft` is a headless editor for canonical documents. `replace` and `update` create undo points; `snapshot` includes a digest; `markSaved` clears dirty history. This is single-session history, not collaborative editing.

Persistence is explicit. The memory repository is ephemeral. The Storage repository accepts `localStorage` or a compatible object and namespaces keys. Both expose async `put`, `get`, `delete`, `list`, and `clear`; values cross clone/JSON boundaries. Core runs never write storage. Handle quotas, user consent, migration, and backup in the host application.
