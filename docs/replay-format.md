# Replay format

Version 1 is JSON-compatible:

```json
{"format":"ludotape/replay@1","cartridge":"sha256 hex","seed":0,"initial":"sha256 hex","actions":[],"checkpoints":[],"final":"sha256 hex"}
```

`cartridge` prevents use with another ruleset/document identity. `checkpoints[i]` is the digest after `actions[i]`. Verification recreates initial state, dispatches each action through current legality checks, and compares digests. Replays are integrity evidence, not signatures: anyone can edit and recompute an unsigned replay. Treat replay files as untrusted data and game modules as trusted code.
