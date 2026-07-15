import {compileCartridge, defineGame} from '../src/index.mjs';

/** Editable content kept separate from deterministic rules. */
export const document = {
  target: 3
};

/** A minimal deterministic game: increment a counter until it reaches its target. */
export const game = defineGame({
  id: 'ludotape/basic-counter',
  version: '1.0.0',
  metadata: {
    title: 'Basic Counter'
  },

  initialState() {
    return {count: 0};
  },

  actions(state, {document}) {
    return state.count < document.target
      ? [{type: 'increment'}]
      : [];
  },

  transition(state, action) {
    if (action.type !== 'increment') throw new Error('Unsupported action');
    return {count: state.count + 1};
  },

  isGoal(state, {document}) {
    return state.count === document.target;
  },

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
