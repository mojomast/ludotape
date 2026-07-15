# Replay format

Version 1 contains exactly these JSON-compatible fields:

```json
{"format":"ludotape/replay@1","cartridge":"64 lowercase hex","seed":0,"initial":"64 lowercase hex","actions":[],"checkpoints":[],"final":"64 lowercase hex"}
```

`checkpoints.length` must equal `actions.length`; checkpoint `i` is the committed state value digest after action `i`. Verification applies strict byte, depth, node, and action limits, validates seed and every digest, recreates initial state, checks each action through current legality, compares every checkpoint, and compares final state. Stable `E_REPLAY_*` shape/limit codes distinguish malformed input from execution mismatch codes.

Replays are integrity evidence, not signatures: anyone can edit and recompute an unsigned replay. Treat JSON as untrusted input and imported game modules as trusted executable code.
