import {
  availability,
  canonical,
  clone,
  createReplay,
  createRun,
  deepFreeze,
  digest,
  dispatch,
  LudotapeError,
  project,
  verifyReplay
} from './index.mjs';

const EXPECTATION_KEYS = Object.freeze(['state', 'stateDigest', 'availability', 'projection']);
const LIMITS = Object.freeze({maxActions: 100000, maxDepth: 100, maxPaths: 100000, maxActionsPerState: 100000});

function authoringError(code, message, details) {
  throw new LudotapeError(code, message, details);
}

function limit(value, fallback, ceiling, name) {
  const result = value ?? fallback;
  if (!Number.isSafeInteger(result) || result < 0 || result > ceiling) {
    authoringError('E_AUTHORING_LIMIT', `${name} must be an integer from 0 to ${ceiling}`);
  }
  return result;
}

function frozenCanonical(value) {
  const clean = clone(value);
  canonical(clean);
  return deepFreeze(clean);
}

function observe(run, step) {
  const state = run.state;
  return {
    step,
    state,
    stateDigest: digest(state),
    availability: availability(run),
    projection: project(run)
  };
}

/** Execute an action sequence and capture the complete authoring-visible result. */
export function simulateActions(cartridge, {seed = 0, actions = [], maxActions = 10000} = {}) {
  const bound = limit(maxActions, 10000, LIMITS.maxActions, 'maxActions');
  if (!Array.isArray(actions)) authoringError('E_AUTHORING_ACTIONS', 'actions must be an array');
  if (actions.length > bound) authoringError('E_AUTHORING_LIMIT', `actions exceed maxActions (${bound})`);

  const cleanActions = clone(actions);
  const run = createRun(cartridge, {seed});
  const observations = [observe(run, 0)];
  for (let index = 0; index < cleanActions.length; index++) {
    try {
      dispatch(run, cleanActions[index]);
    } catch (error) {
      // Preserve the core error code while giving scenario diagnostics a
      // stable action location, including for callbacks that throw primitives.
      throw new LudotapeError(
        error?.code ?? 'E_AUTHORING_ACTION',
        error?.message ?? String(error),
        {step: index + 1}
      );
    }
    observations.push(observe(run, index + 1));
  }
  const replay = createReplay(run);
  const verification = verifyReplay(cartridge, replay, {maxActions: bound});
  if (!verification.ok) {
    authoringError('E_AUTHORING_REPLAY', `generated replay did not verify: ${verification.error.code}: ${verification.error.message}`, verification.error);
  }
  return frozenCanonical({
    format: 'ludotape/authoring-trace@1',
    seed: clone(seed),
    actions: cleanActions,
    observations,
    replay,
    verified: true
  });
}

function safeValue(value) {
  try { return clone(value); }
  catch (error) { return `[unrepresentable: ${error?.message ?? String(error)}]`; }
}

function errorDiagnostic(code, scenario, step, path, message, extra = {}) {
  return {
    severity: 'error', code, scenario, step, path, message,
    ...extra
  };
}

function scenarioName(scenario, index = 0) {
  return typeof scenario?.name === 'string' && scenario.name ? scenario.name : `scenario-${index + 1}`;
}

function expectationFromStep(step) {
  if (!step || typeof step !== 'object' || Array.isArray(step)) return null;
  if (step.expect !== undefined) return step.expect;
  const expectation = {};
  for (const key of EXPECTATION_KEYS) if (Object.hasOwn(step, key)) expectation[key] = step[key];
  return Object.keys(expectation).length ? expectation : null;
}

function compareExpectation(expectation, observation, name, step, diagnostics) {
  if (!expectation || typeof expectation !== 'object' || Array.isArray(expectation)) {
    diagnostics.push(errorDiagnostic('E_SCENARIO_SHAPE', name, step, 'expect', 'expectation must be an object'));
    return;
  }
  for (const key of Object.keys(expectation).sort()) {
    if (!EXPECTATION_KEYS.includes(key)) {
      diagnostics.push(errorDiagnostic('E_SCENARIO_EXPECTATION', name, step, key, `unsupported expectation path: ${key}`));
      continue;
    }
    let expectedText;
    let actualText;
    try {
      expectedText = canonical(expectation[key]);
      actualText = canonical(observation[key]);
    } catch (error) {
      diagnostics.push(errorDiagnostic('E_SCENARIO_EXPECTATION', name, step, key, `expectation is not canonical-safe: ${error.message}`));
      continue;
    }
    if (expectedText !== actualText) {
      diagnostics.push(errorDiagnostic(
        'E_SCENARIO_MISMATCH', name, step, key, `${key} did not match`,
        {expected: safeValue(expectation[key]), actual: safeValue(observation[key])}
      ));
    }
  }
}

/** Run one declarative scenario. Failures are returned as stable diagnostics. */
export function runScenario(cartridge, scenario, fallbackName) {
  const name = typeof scenario?.name === 'string' && scenario.name ? scenario.name : (fallbackName ?? scenarioName(scenario));
  const diagnostics = [];
  let trace = null;
  try {
    if (!scenario || typeof scenario !== 'object' || Array.isArray(scenario)) {
      throw new LudotapeError('E_SCENARIO_SHAPE', 'scenario must be an object');
    }
    const seed = scenario.seed ?? 0;
    let actions;
    let stepExpectations = [];
    if (scenario.steps !== undefined) {
      if (!Array.isArray(scenario.steps)) throw new LudotapeError('E_SCENARIO_SHAPE', 'scenario.steps must be an array');
      actions = scenario.steps.map((step, index) => {
        if (!step || typeof step !== 'object' || Array.isArray(step) || !Object.hasOwn(step, 'action')) {
          throw new LudotapeError('E_SCENARIO_SHAPE', `step ${index} must contain an action`);
        }
        stepExpectations.push(expectationFromStep(step));
        return step.action;
      });
    } else {
      actions = scenario.actions ?? [];
      if (!Array.isArray(actions)) throw new LudotapeError('E_SCENARIO_SHAPE', 'scenario.actions must be an array');
    }
    trace = simulateActions(cartridge, {seed, actions, maxActions: scenario.maxActions ?? 10000});
    if (scenario.initial !== undefined) compareExpectation(scenario.initial, trace.observations[0], name, 0, diagnostics);
    for (let index = 0; index < stepExpectations.length; index++) {
      if (stepExpectations[index] !== null) compareExpectation(stepExpectations[index], trace.observations[index + 1], name, index + 1, diagnostics);
    }
    if (scenario.expect !== undefined) compareExpectation(scenario.expect, trace.observations.at(-1), name, actions.length, diagnostics);
  } catch (error) {
    diagnostics.push(errorDiagnostic(
      error?.code ?? 'E_SCENARIO_EXECUTION', name,
      Number.isSafeInteger(error?.details?.step) ? error.details.step : null,
      'execution', error?.message ?? String(error)
    ));
  }
  return frozenCanonical({ok: diagnostics.length === 0, name, diagnostics, trace});
}

/** Run scenarios in input order and aggregate their diagnostics. */
export function runScenarios(cartridge, scenarios) {
  if (!Array.isArray(scenarios)) {
    const result = runScenario(cartridge, null);
    return frozenCanonical({ok: false, results: [result], diagnostics: clone(result.diagnostics)});
  }
  const results = scenarios.map((scenario, index) => {
    const named = scenario && typeof scenario === 'object' && !Array.isArray(scenario) && !scenario.name
      ? {...scenario, name: scenarioName(scenario, index)} : scenario;
    return runScenario(cartridge, named, `scenario-${index + 1}`);
  });
  return frozenCanonical({
    ok: results.every(result => result.ok),
    results,
    // Keep the aggregate canonical-safe: diagnostics are values, not aliases
    // into the individual scenario results.
    diagnostics: results.flatMap(result => result.diagnostics.map(item => clone(item)))
  });
}

function checkDiagnostic(severity, code, seed, path, location, message, extra = {}) {
  return {severity, code, seed: safeValue(seed), path: safeValue(path), location, message, ...extra};
}

function same(left, right) {
  return canonical(left) === canonical(right);
}

/**
 * Explore a bounded action tree. This supplies evidence about determinism and
 * replayability within the explored bounds; it is deliberately not a proof.
 */
export function checkCartridge(cartridge, {
  seeds = [0], maxDepth = 2, maxPaths = 100, maxActionsPerState = 100
} = {}) {
  const depthBound = limit(maxDepth, 2, LIMITS.maxDepth, 'maxDepth');
  const pathBound = limit(maxPaths, 100, LIMITS.maxPaths, 'maxPaths');
  const actionBound = limit(maxActionsPerState, 100, LIMITS.maxActionsPerState, 'maxActionsPerState');
  if (!Array.isArray(seeds)) authoringError('E_AUTHORING_SEEDS', 'seeds must be an array');
  const cleanSeeds = clone(seeds);
  const diagnostics = [];
  let exploredPaths = 0;
  let exploredTransitions = 0;
  let depthLimited = false;
  let pathLimited = false;
  let actionLimited = false;

  outer: for (const seed of cleanSeeds) {
    const queue = [[]];
    for (let cursor = 0; cursor < queue.length; cursor++) {
      if (exploredPaths >= pathBound) { pathLimited = true; break outer; }
      const path = queue[cursor];
      exploredPaths++;
      let left;
      let right;
      try {
        left = simulateActions(cartridge, {seed, actions: path, maxActions: depthBound});
        right = simulateActions(cartridge, {seed, actions: path, maxActions: depthBound});
      } catch (error) {
        diagnostics.push(checkDiagnostic('error', error?.code ?? 'E_CHECK_EXECUTION', seed, path, 'execution', error?.message ?? String(error)));
        continue;
      }

      for (const field of ['observations', 'replay']) {
        if (!same(left[field], right[field])) {
          diagnostics.push(checkDiagnostic('error', 'E_CHECK_TWIN', seed, path, field, `twin executions produced different ${field}`, {
            expected: safeValue(left[field]), actual: safeValue(right[field])
          }));
        }
      }
      if (!left.verified || !verifyReplay(cartridge, left.replay, {maxActions: depthBound}).ok) {
        diagnostics.push(checkDiagnostic('error', 'E_CHECK_REPLAY', seed, path, 'replay', 'replay verification failed'));
      }
      const current = left.observations.at(-1);
      try { canonical(current.projection); }
      catch (error) {
        diagnostics.push(checkDiagnostic('error', 'E_CHECK_PROJECTION', seed, path, 'projection', `projection is not canonical-safe: ${error.message}`));
      }

      const unique = [];
      const seen = new Map();
      for (let index = 0; index < current.availability.length; index++) {
        const action = current.availability[index];
        const key = canonical(action);
        if (seen.has(key)) {
          diagnostics.push(checkDiagnostic('warning', 'W_DUPLICATE_ACTION', seed, path, 'availability', `duplicate canonical action at indexes ${seen.get(key)} and ${index}`, {action: safeValue(action)}));
        } else {
          seen.set(key, index);
          unique.push(action);
        }
      }

      if (path.length >= depthBound) {
        if (unique.length) depthLimited = true;
        continue;
      }
      if (unique.length > actionBound) {
        actionLimited = true;
        diagnostics.push(checkDiagnostic('warning', 'W_COVERAGE_ACTIONS', seed, path, 'availability', `only ${actionBound} of ${unique.length} unique actions were explored`));
      }
      for (const action of unique.slice(0, actionBound)) {
        queue.push([...path, clone(action)]);
        exploredTransitions++;
      }
    }
  }

  if (depthLimited) diagnostics.push(checkDiagnostic('warning', 'W_COVERAGE_DEPTH', null, [], 'coverage', `exploration reached maxDepth ${depthBound}`));
  if (pathLimited) diagnostics.push(checkDiagnostic('warning', 'W_COVERAGE_PATHS', null, [], 'coverage', `exploration reached maxPaths ${pathBound}`));
  if (actionLimited) diagnostics.push(checkDiagnostic('warning', 'W_COVERAGE_BOUNDED', null, [], 'coverage', 'one or more states exceeded maxActionsPerState'));

  const errors = diagnostics.filter(item => item.severity === 'error').length;
  const warnings = diagnostics.length - errors;
  return frozenCanonical({
    ok: errors === 0,
    diagnostics,
    coverage: {
      bounded: true,
      seeds: cleanSeeds.length,
      paths: exploredPaths,
      transitions: exploredTransitions,
      maxDepth: depthBound,
      maxPaths: pathBound,
      maxActionsPerState: actionBound,
      depthLimited,
      pathLimited,
      actionLimited
    },
    errors,
    warnings
  });
}
