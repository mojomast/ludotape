#!/usr/bin/env node
// Standalone static core validator (CLI + `validateCore()` export). Deliberately does NOT
// import `src/core-loader.mjs`: this file duplicates the minimal manifest/shape rules from
// CORE_SPEC.md so it has no import-order coupling to the loader and also works unmodified
// against externally published cores (outside this repo, where core-loader.mjs would not be
// reachable). Performs NO gameplay execution -- it only parses the manifest, imports the
// entry module, calls `createCore()` once, and inspects metadata/method shape.
import {readFile, stat} from 'node:fs/promises';
import {dirname, join, resolve} from 'node:path';
import {pathToFileURL} from 'node:url';

const ALLOWED_MANIFEST_KEYS = new Set(['format', 'id', 'version', 'name', 'description', 'entry', 'capabilities', 'cartridgeFormats']);
const CAPABILITY_KEYS = ['replay', 'rewind', 'solve', 'scenarios'];
const REQUIRED_METHODS = ['loadCartridge', 'createRun', 'availability', 'dispatch', 'project'];

function makeDiagnostic(severity, code, path, message) {
  return {severity, code, path, message};
}

/** Structural equality for plain JSON-shaped values (objects/arrays/primitives, no cycles). */
function deepEqualJson(a, b) {
  if (a === b) return true;
  if (typeof a !== typeof b || a === null || b === null) return false;
  if (Array.isArray(a) || Array.isArray(b)) {
    if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false;
    return a.every((value, index) => deepEqualJson(value, b[index]));
  }
  if (typeof a === 'object') {
    const aKeys = Object.keys(a).sort(), bKeys = Object.keys(b).sort();
    if (aKeys.length !== bKeys.length || aKeys.some((key, index) => key !== bKeys[index])) return false;
    return aKeys.every(key => deepEqualJson(a[key], b[key]));
  }
  return false;
}

/**
 * Minimal standalone duplicate of `canonical()`'s shape rules (see src/index.mjs), scoped to
 * what a core's `metadata` object needs to satisfy: plain objects/arrays, finite numbers,
 * strings/booleans/null, no functions/symbols/cycles. Throws {message, path} on violation.
 */
function assertPlainCanonical(value, path, seen = new Set()) {
  if (value === null || typeof value === 'boolean' || typeof value === 'string') return;
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throwAt(path, 'non-finite number');
    return;
  }
  if (typeof value !== 'object') throwAt(path, `unsupported value type: ${typeof value}`);
  if (seen.has(value)) throwAt(path, 'cycle or shared reference');
  seen.add(value);
  if (Array.isArray(value)) {
    value.forEach((entry, index) => assertPlainCanonical(entry, `${path}[${index}]`, seen));
    return;
  }
  const proto = Object.getPrototypeOf(value);
  if (proto !== Object.prototype && proto !== null) throwAt(path, 'non-plain object');
  for (const key of Object.keys(value)) assertPlainCanonical(value[key], `${path}.${key}`, seen);
}
function throwAt(path, message) {
  const error = new Error(message);
  error.path = path;
  throw error;
}

/**
 * Statically validate a core directory (or an explicit manifest path) without running any
 * gameplay. Never throws for validation problems -- always resolves to `{ok, diagnostics}`.
 * @param {string} dirOrManifestPath
 * @returns {Promise<{ok: boolean, diagnostics: Array<{severity: string, code: string, path: string, message: string}>}>}
 */
export async function validateCore(dirOrManifestPath) {
  const diagnostics = [];
  const add = (severity, code, path, message) => diagnostics.push(makeDiagnostic(severity, code, path, message));
  const hasErrors = () => diagnostics.some(d => d.severity === 'error');

  if (typeof dirOrManifestPath !== 'string' || !dirOrManifestPath) {
    add('error', 'E_CORE_MANIFEST', '(input)', 'a core directory or manifest path is required');
    return {ok: false, diagnostics};
  }

  const inputPath = resolve(dirOrManifestPath);
  let inputStat = null;
  try { inputStat = await stat(inputPath); } catch { /* handled below */ }

  const coreDir = inputStat && inputStat.isDirectory() ? inputPath : dirname(inputPath);
  const manifestPath = inputStat && inputStat.isDirectory() ? join(inputPath, 'core.manifest.json') : inputPath;

  let manifestRaw;
  try {
    manifestRaw = await readFile(manifestPath, 'utf8');
  } catch (error) {
    add('error', 'E_CORE_MANIFEST', manifestPath, `manifest not found or unreadable: ${error.message}`);
    return {ok: false, diagnostics};
  }

  let manifest;
  try {
    manifest = JSON.parse(manifestRaw);
  } catch (error) {
    add('error', 'E_CORE_MANIFEST', manifestPath, `manifest is not valid JSON: ${error.message}`);
    return {ok: false, diagnostics};
  }
  if (!manifest || typeof manifest !== 'object' || Array.isArray(manifest)) {
    add('error', 'E_CORE_MANIFEST', manifestPath, 'manifest must be a JSON object');
    return {ok: false, diagnostics};
  }

  for (const key of Object.keys(manifest)) {
    if (!ALLOWED_MANIFEST_KEYS.has(key)) add('error', 'E_CORE_MANIFEST', `${manifestPath}#${key}`, `unknown manifest key: ${key}`);
  }
  if (manifest.format !== 'ludotape/core-manifest@1') {
    add('error', 'E_CORE_MANIFEST', `${manifestPath}#format`, "manifest.format must be exactly 'ludotape/core-manifest@1'");
  }
  for (const field of ['id', 'version', 'name', 'entry']) {
    if (typeof manifest[field] !== 'string' || !manifest[field]) add('error', 'E_CORE_MANIFEST', `${manifestPath}#${field}`, `manifest.${field} must be a non-empty string`);
  }
  if (manifest.description !== undefined && typeof manifest.description !== 'string') {
    add('error', 'E_CORE_MANIFEST', `${manifestPath}#description`, 'manifest.description must be a string if present');
  }
  if (typeof manifest.entry === 'string' && !manifest.entry.startsWith('./')) {
    add('error', 'E_CORE_MANIFEST', `${manifestPath}#entry`, "manifest.entry must be a relative path starting with './'");
  }
  if (!manifest.capabilities || typeof manifest.capabilities !== 'object' || Array.isArray(manifest.capabilities)) {
    add('error', 'E_CORE_MANIFEST', `${manifestPath}#capabilities`, 'manifest.capabilities must be an object');
  } else {
    const keys = Object.keys(manifest.capabilities);
    if (keys.length !== CAPABILITY_KEYS.length || !CAPABILITY_KEYS.every(k => k in manifest.capabilities)) {
      add('error', 'E_CORE_MANIFEST', `${manifestPath}#capabilities`, `manifest.capabilities must have exactly the keys: ${CAPABILITY_KEYS.join(', ')}`);
    }
    for (const key of CAPABILITY_KEYS) {
      if (key in manifest.capabilities && typeof manifest.capabilities[key] !== 'boolean') {
        add('error', 'E_CORE_MANIFEST', `${manifestPath}#capabilities.${key}`, `manifest.capabilities.${key} must be a boolean`);
      }
    }
  }
  if (!Array.isArray(manifest.cartridgeFormats) || manifest.cartridgeFormats.length === 0 || !manifest.cartridgeFormats.every(f => typeof f === 'string' && f)) {
    add('error', 'E_CORE_MANIFEST', `${manifestPath}#cartridgeFormats`, 'manifest.cartridgeFormats must be a non-empty array of non-empty strings');
  }

  if (hasErrors() || typeof manifest.entry !== 'string') return {ok: false, diagnostics};

  const entryPath = resolve(coreDir, manifest.entry);
  try {
    const entryStat = await stat(entryPath);
    if (!entryStat.isFile()) throw new Error('not a file');
  } catch (error) {
    add('error', 'E_CORE_ENTRY', entryPath, `entry file does not exist: ${manifest.entry} (${error.message})`);
    return {ok: false, diagnostics};
  }

  let mod;
  try {
    mod = await import(pathToFileURL(entryPath).href);
  } catch (error) {
    add('error', 'E_CORE_ENTRY', entryPath, `failed to import entry module: ${error.message}`);
    return {ok: false, diagnostics};
  }
  if (typeof mod.createCore !== 'function') add('error', 'E_CORE_ENTRY', entryPath, "entry module must export a named 'createCore' function");
  if (mod.default === undefined) add('error', 'E_CORE_ENTRY', entryPath, "entry module must export a 'default' core instance");
  if (hasErrors()) return {ok: false, diagnostics};

  let core;
  try {
    core = mod.createCore();
  } catch (error) {
    add('error', 'E_CORE_ENTRY', entryPath, `createCore() threw: ${error.message}`);
    return {ok: false, diagnostics};
  }
  if (!core || typeof core !== 'object') {
    add('error', 'E_CORE_SHAPE', entryPath, 'createCore() must return an object');
    return {ok: false, diagnostics};
  }

  const metadata = core.metadata;
  let capabilities;
  if (!metadata || typeof metadata !== 'object') {
    add('error', 'E_CORE_SHAPE', `${entryPath}#metadata`, 'core.metadata must be an object');
  } else {
    try {
      assertPlainCanonical(metadata, `${entryPath}#metadata`);
    } catch (error) {
      add('error', 'E_CORE_SHAPE', error.path ?? `${entryPath}#metadata`, `core.metadata must be a canonical value: ${error.message}`);
    }
    if (!Object.isFrozen(metadata)) add('error', 'E_CORE_SHAPE', `${entryPath}#metadata`, 'core.metadata must be frozen (Object.freeze)');

    if (metadata.format !== 'ludotape/core@1') add('error', 'E_CORE_METADATA', `${entryPath}#metadata.format`, "metadata.format must be exactly 'ludotape/core@1'");
    for (const field of ['id', 'version', 'name']) {
      if (metadata[field] !== manifest[field]) add('error', 'E_CORE_METADATA', `${entryPath}#metadata.${field}`, `metadata.${field} must match manifest.${field}`);
    }
    if (manifest.description !== undefined && metadata.description !== undefined && manifest.description !== metadata.description) {
      add('error', 'E_CORE_METADATA', `${entryPath}#metadata.description`, 'metadata.description must match manifest.description when both are present');
    }
    if (!deepEqualJson(metadata.capabilities, manifest.capabilities)) {
      add('error', 'E_CORE_METADATA', `${entryPath}#metadata.capabilities`, 'metadata.capabilities must deep-equal manifest.capabilities');
    }
    if (!deepEqualJson(metadata.cartridgeFormats, manifest.cartridgeFormats)) {
      add('error', 'E_CORE_METADATA', `${entryPath}#metadata.cartridgeFormats`, 'metadata.cartridgeFormats must deep-equal manifest.cartridgeFormats');
    }
    capabilities = metadata.capabilities;
  }

  for (const method of REQUIRED_METHODS) {
    if (typeof core[method] !== 'function') add('error', 'E_CORE_SHAPE', `${entryPath}#${method}`, `core.${method} must be a function`);
  }
  if (capabilities && typeof capabilities === 'object') {
    if (capabilities.replay) {
      if (typeof core.createReplay !== 'function') add('error', 'E_CORE_SHAPE', `${entryPath}#createReplay`, 'capabilities.replay requires core.createReplay');
      if (typeof core.verifyReplay !== 'function') add('error', 'E_CORE_SHAPE', `${entryPath}#verifyReplay`, 'capabilities.replay requires core.verifyReplay');
    }
    if (capabilities.rewind && typeof core.rewindRun !== 'function') add('error', 'E_CORE_SHAPE', `${entryPath}#rewindRun`, 'capabilities.rewind requires core.rewindRun');
    if (capabilities.solve) {
      if (typeof core.solve !== 'function') add('error', 'E_CORE_SHAPE', `${entryPath}#solve`, 'capabilities.solve requires core.solve');
      if (typeof core.isGoal !== 'function') add('error', 'E_CORE_SHAPE', `${entryPath}#isGoal`, 'capabilities.solve requires core.isGoal');
    }
  }

  return {ok: !hasErrors(), diagnostics};
}

async function main() {
  const target = process.argv[2];
  if (!target) {
    console.error('Usage: node devkit/validate-core.mjs <coreDir|manifestPath>');
    process.exitCode = 1;
    return;
  }
  const report = await validateCore(target);
  console.log(JSON.stringify(report, null, 2));
  if (!report.ok) process.exitCode = 1;
}

const invokedDirectly = process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url;
if (invokedDirectly) await main();
