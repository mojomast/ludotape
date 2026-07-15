/**
 * Render the source of a generated scenarios module matching `templates/game.mjs`'s counter
 * game. Deterministic; depends only on `{title}` (used only in the header comment).
 */
export function scenariosTemplate({title}) {
  return `// Exact-scenario checks for ${title}. Run with:
//   node bin/ludotape.mjs test <game>.mjs <game>.scenarios.mjs
export const scenarios = [
  {
    name: 'count to the target',
    seed: 0,
    initial: {
      state: {count: 0},
      availability: [{type: 'increment'}],
      projection: {complete: false, count: 0, target: 3}
    },
    steps: [
      {
        action: {type: 'increment'},
        expect: {
          state: {count: 1},
          availability: [{type: 'increment'}],
          projection: {complete: false, count: 1, target: 3}
        }
      },
      {
        action: {type: 'increment'},
        expect: {
          state: {count: 2},
          availability: [{type: 'increment'}],
          projection: {complete: false, count: 2, target: 3}
        }
      },
      {action: {type: 'increment'}}
    ],
    expect: {
      state: {count: 3},
      availability: [],
      projection: {complete: true, count: 3, target: 3}
    }
  }
];

export default scenarios;
`;
}
