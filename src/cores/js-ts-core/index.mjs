// Public entry point for the `ludotape/js-ts-core` package/module (see `../../../package.json`
// `exports["./js-ts-core"]`). One-stop import for game authors and for the core loader/registry:
// `import core, {createCore, defineGame, createRun} from 'ludotape/js-ts-core'`.
export {createCore, default} from './core.mjs';

// Author-facing helpers re-exported verbatim from the main runtime, so callers of this module
// never need a second import from '../../index.mjs'.
export {
  defineGame,
  defineCartridge,
  compileCartridge,
  createRun,
  availability,
  dispatch,
  project,
  runActions,
  rewindRun,
  createReplay,
  verifyReplay,
  solve,
  createRng,
  canonical,
  digest,
  clone,
  deepFreeze,
  LudotapeError
} from '../../index.mjs';
