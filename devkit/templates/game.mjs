import {GAME_TEMPLATE_VERSION} from './constants.mjs';

/**
 * Render the source of a generated game module: a working counter-style game built with
 * `defineGame`/`compileCartridge`. Deterministic (no timestamps); depends only on the given
 * `{id, title}`.
 */
export function gameTemplate({id, title}) {
  return `import {compileCartridge, defineGame} from 'ludotape';
// Running from a source checkout without an installed dependency? Use a relative import instead:
// import {compileCartridge, defineGame} from '../src/index.mjs';

/** Editable content kept separate from deterministic rules. */
export const document = {
  target: 3
};

/** A minimal deterministic game: increment a counter until it reaches its target. */
export const game = defineGame({
  id: ${JSON.stringify(id)},
  version: ${JSON.stringify(GAME_TEMPLATE_VERSION)},
  metadata: {
    title: ${JSON.stringify(title)}
  },

  // Called once per run to produce the initial canonical state. Use context.rng for any
  // randomness -- never Math.random or Date.now.
  initialState() {
    return {count: 0};
  },

  // Return the canonical array of actions available from the current state.
  actions(state, {document}) {
    return state.count < document.target
      ? [{type: 'increment'}]
      : [];
  },

  // Pure transition: (state, action, context) -> next canonical state.
  transition(state, action) {
    if (action.type !== 'increment') throw new Error('Unsupported action');
    return {count: state.count + 1};
  },

  // Optional: enables the CLI/solver "solve" command.
  isGoal(state, {document}) {
    return state.count === document.target;
  },

  // Optional: renderer-neutral projection consumed by adapters/UI.
  project(state, {document}) {
    return {
      complete: state.count === document.target,
      count: state.count,
      target: document.target
    };
  }
});

/** Compiled cartridge consumed by the runtime and CLI. */
export const cartridge = compileCartridge(game, document);
export default cartridge;
`;
}
