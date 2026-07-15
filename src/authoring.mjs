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
const SCENARIO_KEYS = Object.freeze(['name', 'seed', 'actions', 'steps', 'initial', 'expect', 'maxActions']);
const STEP_KEYS = Object.freeze(['action', 'expect', ...EXPECTATION_KEYS]);
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

function positiveLimit(value, fallback, ceiling, name) {
  const result = value ?? fallback;
  if (!Number.isSafeInteger(result) || result < 1 || result > ceiling) {
    authoringError('E_AUTHORING_LIMIT', `${name} must be an integer from 1 to ${ceiling}`);
  }
  return result;
}

function frozenCanonical(value) {
  const clean = clone(value);
  canonical(clean);
  return deepFreeze(clean);
}

function errorField(error, field) {
  try { return error != null ? error[field] : undefined; }
  catch { return undefined; }
}

function errorMessage(error) {
  const message = errorField(error, 'message');
  try { return typeof message === 'string' ? message : String(error); }
  catch { return 'unknown error'; }
}

function observe(run, step, phase) {
  let state;
  let stateDigest;
  let available;
  let projection;
  for (const [path, operation] of [
    ['state', () => run.state],
    ['stateDigest', () => digest(state)],
    ['availability', () => availability(run)],
    ['projection', () => project(run)]
  ]) {
    try {
      const value = operation();
      if (path === 'state') state = value;
      else if (path === 'stateDigest') stateDigest = value;
      else if (path === 'availability') available = value;
      else projection = value;
    } catch (error) {
      throw new LudotapeError(
        path === 'projection' ? 'E_AUTHORING_PROJECTION' : (errorField(error, 'code') ?? 'E_AUTHORING_OBSERVATION'),
        `${phase} ${path} observation failed: ${errorMessage(error)}`,
        {step, phase, path}
      );
    }
  }
  return {step, state, stateDigest, availability: available, projection};
}

/** Execute an action sequence and capture the complete authoring-visible result. */
export function simulateActions(cartridge, {seed = 0, actions = [], maxActions = 10000} = {}) {
  const bound = limit(maxActions, 10000, LIMITS.maxActions, 'maxActions');
  if (!Array.isArray(actions)) authoringError('E_AUTHORING_ACTIONS', 'actions must be an array');
  if (actions.length > bound) authoringError('E_AUTHORING_LIMIT', `actions exceed maxActions (${bound})`);

  const cleanActions = clone(actions);
  const run = createRun(cartridge, {seed});
  const observations = [observe(run, 0, 'initial')];
  for (let index = 0; index < cleanActions.length; index++) {
    try {
      dispatch(run, cleanActions[index]);
    } catch (error) {
      // Preserve the core error code while giving scenario diagnostics a
      // stable action location, including for callbacks that throw primitives.
      throw new LudotapeError(
        errorField(error, 'code') ?? 'E_AUTHORING_ACTION',
        errorMessage(error),
        {step: index + 1}
      );
    }
    observations.push(observe(run, index + 1, 'post-action'));
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
  catch (error) { return `[unrepresentable: ${errorMessage(error)}]`; }
}

function errorDiagnostic(code, scenario, step, path, message, extra = {}) {
  return {
    severity: 'error', code, scenario, step, path, message,
    ...extra
  };
}

function unsupportedKeys(value, allowed) {
  return Object.keys(value).filter(key => !allowed.includes(key)).sort();
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
  let name = typeof fallbackName === 'string' && fallbackName ? fallbackName : 'scenario-1';
  const diagnostics = [];
  let trace = null;
  try {
    if (!scenario || typeof scenario !== 'object' || Array.isArray(scenario)) {
      throw new LudotapeError('E_SCENARIO_SHAPE', 'scenario must be an object');
    }
    // Snapshot untrusted input before reading fields. clone/canonical reject
    // accessors and also prevent mutation during cartridge callbacks.
    const cleanScenario = clone(scenario);
    canonical(cleanScenario);
    if (typeof cleanScenario.name === 'string' && cleanScenario.name) name = cleanScenario.name;
    const unknown = unsupportedKeys(cleanScenario, SCENARIO_KEYS);
    if (unknown.length) throw new LudotapeError('E_SCENARIO_SHAPE', `unsupported scenario field${unknown.length === 1 ? '' : 's'}: ${unknown.join(', ')}`);
    if (Object.hasOwn(cleanScenario, 'actions') && Object.hasOwn(cleanScenario, 'steps')) {
      throw new LudotapeError('E_SCENARIO_SHAPE', 'scenario cannot contain both actions and steps');
    }

    const seed = cleanScenario.seed ?? 0;
    let actions;
    const stepExpectations = [];
    if (cleanScenario.steps !== undefined) {
      if (!Array.isArray(cleanScenario.steps)) throw new LudotapeError('E_SCENARIO_SHAPE', 'scenario.steps must be an array');
      actions = cleanScenario.steps.map((step, index) => {
        if (!step || typeof step !== 'object' || Array.isArray(step) || !Object.hasOwn(step, 'action')) {
          throw new LudotapeError('E_SCENARIO_SHAPE', `step ${index} must contain an action`);
        }
        const stepUnknown = unsupportedKeys(step, STEP_KEYS);
        if (stepUnknown.length) throw new LudotapeError('E_SCENARIO_SHAPE', `step ${index} has unsupported field${stepUnknown.length === 1 ? '' : 's'}: ${stepUnknown.join(', ')}`);
        if (Object.hasOwn(step, 'expect') && EXPECTATION_KEYS.some(key => Object.hasOwn(step, key))) {
          throw new LudotapeError('E_SCENARIO_SHAPE', `step ${index} cannot combine expect with inline expectations`);
        }
        stepExpectations.push(expectationFromStep(step));
        return step.action;
      });
    } else {
      actions = cleanScenario.actions ?? [];
      if (!Array.isArray(actions)) throw new LudotapeError('E_SCENARIO_SHAPE', 'scenario.actions must be an array');
    }
    trace = simulateActions(cartridge, {seed, actions, maxActions: cleanScenario.maxActions ?? 10000});
    if (cleanScenario.initial !== undefined) compareExpectation(cleanScenario.initial, trace.observations[0], name, 0, diagnostics);
    for (let index = 0; index < stepExpectations.length; index++) {
      if (stepExpectations[index] !== null) compareExpectation(stepExpectations[index], trace.observations[index + 1], name, index + 1, diagnostics);
    }
    if (cleanScenario.expect !== undefined) compareExpectation(cleanScenario.expect, trace.observations.at(-1), name, actions.length, diagnostics);
  } catch (error) {
    const details = errorField(error, 'details');
    const rawStep = errorField(details, 'step');
    const phase = errorField(details, 'phase');
    const path = errorField(details, 'path');
    diagnostics.push(errorDiagnostic(
      errorField(error, 'code') ?? 'E_SCENARIO_EXECUTION', name,
      Number.isSafeInteger(rawStep) ? rawStep : null,
      typeof path === 'string' ? path : 'execution', errorMessage(error),
      typeof phase === 'string' ? {phase} : {}
    ));
  }
  return frozenCanonical({ok: diagnostics.length === 0, name, diagnostics, trace});
}

/** Run scenarios in input order and aggregate their diagnostics. */
export function runScenarios(cartridge, scenarios) {
  let cleanScenarios;
  try {
    if (!Array.isArray(scenarios)) throw new LudotapeError('E_SCENARIO_SHAPE', 'scenarios must be an array');
    cleanScenarios = clone(scenarios);
    canonical(cleanScenarios);
  } catch {
    const result = runScenario(cartridge, null);
    return frozenCanonical({ok: false, results: [result], diagnostics: clone(result.diagnostics)});
  }
  const results = cleanScenarios.map((scenario, index) => runScenario(cartridge, scenario, `scenario-${index + 1}`));
  return frozenCanonical({
    ok: results.every(result => result.ok),
    results,
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
  const pathBound = positiveLimit(maxPaths, 100, LIMITS.maxPaths, 'maxPaths');
  const actionBound = limit(maxActionsPerState, 100, LIMITS.maxActionsPerState, 'maxActionsPerState');
  if (!Array.isArray(seeds)) authoringError('E_AUTHORING_SEEDS', 'seeds must be an array');
  const cleanSeeds = clone(seeds);
  if (cleanSeeds.length === 0) authoringError('E_AUTHORING_SEEDS', 'seeds must contain at least one seed');
  const diagnostics = [];
  let exploredPaths = 0;
  let exploredTransitions = 0;
  let attemptedPaths = 0;
  const exploredSeedIndexes = new Set();
  let depthLimited = false;
  let pathLimited = false;
  let actionLimited = false;

  outer: for (let seedIndex = 0; seedIndex < cleanSeeds.length; seedIndex++) {
    const seed = cleanSeeds[seedIndex];
    const queue = [[]];
    for (let cursor = 0; cursor < queue.length; cursor++) {
      if (attemptedPaths >= pathBound) { pathLimited = true; break outer; }
      const path = queue[cursor];
      attemptedPaths++;
      let left;
      let right;
      try {
        left = simulateActions(cartridge, {seed, actions: path, maxActions: depthBound});
        right = simulateActions(cartridge, {seed, actions: path, maxActions: depthBound});
      } catch (error) {
        const details = errorField(error, 'details');
        const projectionFailure = errorField(error, 'code') === 'E_AUTHORING_PROJECTION';
        diagnostics.push(checkDiagnostic(
          'error', projectionFailure ? 'E_CHECK_PROJECTION' : (errorField(error, 'code') ?? 'E_CHECK_EXECUTION'),
          seed, path, projectionFailure ? 'projection' : (errorField(details, 'path') ?? 'execution'), errorMessage(error),
          errorField(details, 'phase') ? {step: errorField(details, 'step'), phase: errorField(details, 'phase')} : {}
        ));
        continue;
      }
      exploredPaths++;
      exploredSeedIndexes.add(seedIndex);
      if (path.length > 0) exploredTransitions++;

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
      seeds: exploredSeedIndexes.size,
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
