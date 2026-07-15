# Getting started

Requires Node.js 20+; no install dependencies are needed.

```sh
npm test
node bin/ludotape.mjs validate examples/warehouse-circuit.mjs
node bin/ludotape.mjs solve examples/warehouse-circuit.mjs 0 8 1000
node bin/ludotape.mjs serve
```

Open `http://localhost:8080/studio/`. In code, import `defineGame` and `compileCartridge`, then create a run. Ask for `availability(run)` before `dispatch(run, action)`. Save a replay with `createReplay`; verify it against the exact cartridge with `verifyReplay`.
