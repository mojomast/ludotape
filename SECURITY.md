# Security policy

Ludotape callbacks and imported cartridges are trusted JavaScript and are not sandboxed. Never import an untrusted `.mjs` game in the CLI, Studio, or an application. Replay and document JSON should be treated as untrusted input; bound file size and solver limits at application edges. Digests detect mismatch but are not signatures or anti-cheat.

No private disclosure channel is configured in this standalone repository. Until one exists, avoid publishing exploit details: contact the repository owner through the channel from which you received the project. Include affected version, reproduction, impact, and mitigation. Supported line: current unreleased/0.x head only.
