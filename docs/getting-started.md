# Getting started from a source checkout

Requires Git and Node.js 20+; there are no runtime or development package dependencies.

```sh
git clone https://github.com/mojomast/ludotape.git
cd ludotape
npm test
npm run build
npm run smoke
node bin/ludotape.mjs validate examples/warehouse-circuit.mjs
node bin/ludotape.mjs solve examples/warehouse-circuit.mjs 0 8 1000
node bin/ludotape.mjs serve
```

Open `http://127.0.0.1:8080/studio/`. Build first because generated `dist/` is deliberately ignored. The static server serves only `dist/`, binds `127.0.0.1` by default, and is intended only for trusted local development—not deployment or untrusted cartridges.

Package consumers import core functions from `ludotape`; adapters, repositories, and editor APIs use `ludotape/adapters`, `ludotape/storage`, and `ludotape/editor`. Source examples use relative imports so they run directly from a checkout.

## Using Studio

Studio opens on the Play panel after loading an example. Use Help to choose a game and integer seed, Editor to apply cartridge-document JSON, Play to dispatch legal actions or rewind one turn, and Replay to export or verify a replay. Invalid document, seed, and replay input is reported without replacing the last valid run.

When exactly one action is legal, <kbd>Space</kbd> or <kbd>Enter</kbd> dispatches it. <kbd>Backspace</kbd> or <kbd>Z</kbd> rewinds, <kbd>R</kbd> restarts from the editor document and seed, and <kbd>E</kbd> opens Replay and focuses Export. Arrow keys, Home, and End move between Studio tabs. Shortcuts do not override form fields or interactive controls.
