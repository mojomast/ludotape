# Security policy

Ludotape callbacks and imported cartridges are trusted JavaScript and are not sandboxed. Never import an untrusted `.mjs` game in the CLI, Studio, or an application. Replay and document JSON are untrusted input. Digests detect mismatch but are not signatures or anti-cheat.

Report vulnerabilities privately through [GitHub private vulnerability reporting](https://github.com/mojomast/ludotape/security/advisories/new). Include affected version, minimal reproduction, impact, and suggested mitigation. Do not open a public issue for an undisclosed vulnerability. The supported line is 0.1.x and the current main branch.
