// Ludotape core loader & registry. Zero dependencies.
//
// A "core" is a pluggable runtime that interprets a cartridge format and
// exposes the standard run lifecycle (see CORE_SPEC.md / the ICore contract).
// This module provides:
//   - validateCoreShape(core)     shape/contract diagnostics, never throws
//   - wrapCore(core)              validate + freeze + add tick/render aliases
//   - createCoreRegistry()        an in-memory registry of wrapped cores
//   - loadCoreFromManifest(path)  Node-only: load a core from core.manifest.json
//   - discoverCores(dirs)         Node-only: scan directories for cores
//   - defaultRegistry             a registry pre-populated with the JS/TS core
//
// The top level of this module stays browser-safe: node:fs/node:path/node:url
// are only ever imported dynamically, inside the async, Node-only functions.
import {LudotapeError, canonical, clone, deepFreeze} from './index.mjs';

const CORE_FORMAT = 'ludotape/core@1';
const MANIFEST_FORMAT = 'ludotape/core-manifest@1';
const REQUIRED_METHODS = ['loadCartridge', 'createRun', 'availability', 'dispatch', 'project'];
const OPTIONAL_METHODS = ['init', 'teardown', 'isGoal', 'solve', 'createReplay', 'verifyReplay', 'rewindRun'];
const CAPABILITY_KEYS = ['replay', 'rewind', 'solve', 'scenarios'];
// A declared capability requires the corresponding method(s) to be present.
const CAPABILITY_METHODS = {replay: ['createReplay', 'verifyReplay'], rewind: ['rewindRun'], solve: ['isGoal', 'solve']};
const MANIFEST_KEYS = new Set(['format', 'id', 'version', 'name', 'description', 'entry', 'capabilities', 'cartridgeFormats']);

function safeCause(error) {
  let code = 'E_UNKNOWN', message = 'Unknown error';
  try { if (typeof error?.code === 'string') code = error.code; } catch {}
  try { message = typeof error?.message === 'string' ? error.message : String(error); } catch {}
  return {code, message};
}

/** Validate an ICore-shaped object. Never throws; returns {ok, diagnostics}. */
export function validateCoreShape(core) {
  const diagnostics = [];
  const push = (severity, code, path, message) => diagnostics.push({severity, code, path, message});
  if (!core || typeof core !== 'object' || Array.isArray(core)) {
    push('error', 'E_CORE_SHAPE', '$', 'core must be a non-null object');
    return {ok: false, diagnostics};
  }
  const metadata = core.metadata;
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) {
    push('error', 'E_CORE_METADATA', 'metadata', 'metadata must be an object');
  } else {
    if (metadata.format !== CORE_FORMAT) push('error', 'E_CORE_METADATA', 'metadata.format', `metadata.format must be '${CORE_FORMAT}'`);
    for (const key of ['id', 'version', 'name']) {
      if (typeof metadata[key] !== 'string' || !metadata[key]) push('error', 'E_CORE_METADATA', `metadata.${key}`, `metadata.${key} must be a non-empty string`);
    }
    if (metadata.description !== undefined && typeof metadata.description !== 'string') push('error', 'E_CORE_METADATA', 'metadata.description', 'metadata.description must be a string if present');
    const caps = metadata.capabilities;
    if (!caps || typeof caps !== 'object' || Array.isArray(caps)) {
      push('error', 'E_CORE_METADATA', 'metadata.capabilities', 'metadata.capabilities must be an object');
    } else {
      for (const key of CAPABILITY_KEYS) if (typeof caps[key] !== 'boolean') push('error', 'E_CORE_METADATA', `metadata.capabilities.${key}`, `metadata.capabilities.${key} must be a boolean`);
    }
    if (!Array.isArray(metadata.cartridgeFormats) || !metadata.cartridgeFormats.length || metadata.cartridgeFormats.some(f => typeof f !== 'string' || !f)) {
      push('error', 'E_CORE_METADATA', 'metadata.cartridgeFormats', 'metadata.cartridgeFormats must be a non-empty array of non-empty strings');
    }
    try { canonical(metadata); } catch (error) { push('error', 'E_CORE_METADATA', 'metadata', `metadata must be a canonical value: ${error.message}`); }
  }
  for (const key of REQUIRED_METHODS) if (typeof core[key] !== 'function') push('error', 'E_CORE_SHAPE', key, `${key} must be a function`);
  for (const key of OPTIONAL_METHODS) if (core[key] !== undefined && typeof core[key] !== 'function') push('error', 'E_CORE_SHAPE', key, `${key} must be a function if provided`);
  if (metadata && metadata.capabilities && typeof metadata.capabilities === 'object') {
    for (const [capability, methods] of Object.entries(CAPABILITY_METHODS)) {
      if (metadata.capabilities[capability] === true) {
        for (const method of methods) if (typeof core[method] !== 'function') push('error', 'E_CORE_CAPABILITY', method, `capabilities.${capability} requires a '${method}' method`);
      }
    }
  }
  const ok = diagnostics.every(d => d.severity !== 'error');
  return {ok, diagnostics};
}

/** Validate, freeze, and attach tick/render lifecycle aliases to a core. */
export function wrapCore(core) {
  const {ok, diagnostics} = validateCoreShape(core);
  if (!ok) {
    const errors = diagnostics.filter(d => d.severity === 'error');
    throw new LudotapeError('E_CORE_SHAPE', `core does not satisfy the ICore contract: ${errors.map(d => `${d.path}: ${d.message}`).join('; ')}`, {diagnostics: errors});
  }
  const wrapped = {};
  for (const key of Object.keys(core)) wrapped[key] = typeof core[key] === 'function' ? core[key].bind(core) : core[key];
  wrapped.tick = wrapped.dispatch;
  wrapped.render = wrapped.project;
  deepFreeze(wrapped.metadata);
  return Object.freeze(wrapped);
}

/** Create an in-memory registry of wrapped cores. */
export function createCoreRegistry() {
  const cores = new Map();
  const host = Object.freeze({log(...args) { if (typeof console !== 'undefined' && console.debug) console.debug('[ludotape/core]', ...args); }});
  function register(coreOrFactory) {
    const instance = typeof coreOrFactory === 'function' ? coreOrFactory() : coreOrFactory;
    const wrapped = wrapCore(instance);
    const id = wrapped.metadata.id;
    if (cores.has(id)) throw new LudotapeError('E_CORE_DUPLICATE', `core '${id}' is already registered`, {id});
    if (typeof wrapped.init === 'function') wrapped.init(host);
    cores.set(id, wrapped);
    return wrapped;
  }
  function get(id) {
    const core = cores.get(id);
    if (!core) throw new LudotapeError('E_CORE_UNKNOWN', `no core registered with id '${id}'`, {id});
    return core;
  }
  function list() { return [...cores.values()].map(core => clone(core.metadata)); }
  function resolve(cartridge) {
    const format = cartridge?.format;
    for (const core of cores.values()) if (core.metadata.cartridgeFormats.includes(format)) return core;
    throw new LudotapeError('E_CORE_CARTRIDGE', `no registered core supports cartridge format '${format}'`, {format});
  }
  function unregister(id) {
    const core = get(id);
    if (typeof core.teardown === 'function') core.teardown();
    cores.delete(id);
  }
  return Object.freeze({register, get, list, resolve, unregister});
}

function validateManifestShape(manifest) {
  if (!manifest || typeof manifest !== 'object' || Array.isArray(manifest)) bad('E_CORE_MANIFEST', 'core manifest must be a JSON object');
  for (const key of Object.keys(manifest)) if (!MANIFEST_KEYS.has(key)) bad('E_CORE_MANIFEST', `unknown core manifest key '${key}'`, {key});
  if (manifest.format !== MANIFEST_FORMAT) bad('E_CORE_MANIFEST', `unsupported core manifest format '${manifest.format}'`);
  for (const key of ['id', 'version', 'name']) if (typeof manifest[key] !== 'string' || !manifest[key]) bad('E_CORE_MANIFEST', `manifest.${key} must be a non-empty string`);
  if (manifest.description !== undefined && typeof manifest.description !== 'string') bad('E_CORE_MANIFEST', 'manifest.description must be a string');
  if (typeof manifest.entry !== 'string' || !manifest.entry.startsWith('./')) bad('E_CORE_MANIFEST', "manifest.entry must be a relative path starting with './'");
  const caps = manifest.capabilities;
  if (!caps || typeof caps !== 'object' || Array.isArray(caps)) bad('E_CORE_MANIFEST', 'manifest.capabilities must be an object');
  else {
    for (const key of CAPABILITY_KEYS) if (typeof caps[key] !== 'boolean') bad('E_CORE_MANIFEST', `manifest.capabilities.${key} must be a boolean`);
    if (Object.keys(caps).some(key => !CAPABILITY_KEYS.includes(key))) bad('E_CORE_MANIFEST', 'manifest.capabilities has unknown keys');
  }
  if (!Array.isArray(manifest.cartridgeFormats) || !manifest.cartridgeFormats.length || manifest.cartridgeFormats.some(f => typeof f !== 'string' || !f)) {
    bad('E_CORE_MANIFEST', 'manifest.cartridgeFormats must be a non-empty array of non-empty strings');
  }
}
function bad(code, message, details) { throw new LudotapeError(code, message, details); }

function crossCheckManifest(manifest, metadata) {
  const mismatches = [];
  for (const key of ['id', 'version', 'name']) if (manifest[key] !== metadata[key]) mismatches.push(key);
  if (manifest.description !== undefined && metadata.description !== undefined && manifest.description !== metadata.description) mismatches.push('description');
  if (canonical(manifest.capabilities) !== canonical(metadata.capabilities)) mismatches.push('capabilities');
  if (canonical(manifest.cartridgeFormats) !== canonical(metadata.cartridgeFormats)) mismatches.push('cartridgeFormats');
  if (mismatches.length) bad('E_CORE_MANIFEST', `core manifest does not match core metadata: ${mismatches.join(', ')}`, {manifest: manifest.id, mismatches});
}

/** Load, validate, and wrap a core described by a core.manifest.json path. (Node-only, async) */
export async function loadCoreFromManifest(manifestPath) {
  const {readFile} = await import('node:fs/promises');
  const {dirname, resolve} = await import('node:path');
  const {pathToFileURL} = await import('node:url');
  let raw;
  try { raw = await readFile(manifestPath, 'utf8'); }
  catch (error) { throw new LudotapeError('E_CORE_MANIFEST', `could not read core manifest at ${manifestPath}`, {cause: safeCause(error)}); }
  let manifest;
  try { manifest = JSON.parse(raw); }
  catch (error) { throw new LudotapeError('E_CORE_MANIFEST', `core manifest is not valid JSON: ${manifestPath}`, {cause: safeCause(error)}); }
  validateManifestShape(manifest);
  const entryPath = resolve(dirname(resolve(manifestPath)), manifest.entry);
  let mod;
  try { mod = await import(pathToFileURL(entryPath).href); }
  catch (error) { throw new LudotapeError('E_CORE_ENTRY', `could not import core entry '${manifest.entry}' for '${manifest.id}'`, {cause: safeCause(error)}); }
  if (typeof mod.createCore !== 'function') throw new LudotapeError('E_CORE_ENTRY', `core entry must export createCore(): ${manifest.entry}`, {manifest: manifest.id});
  let instance;
  try { instance = mod.createCore(); }
  catch (error) { throw new LudotapeError('E_CORE_ENTRY', `createCore() threw while instantiating core '${manifest.id}'`, {cause: safeCause(error)}); }
  const wrapped = wrapCore(instance);
  crossCheckManifest(manifest, wrapped.metadata);
  return wrapped;
}

/** Scan directories for a `core.manifest.json` in each subdirectory and load each core. (Node-only, async) */
export async function discoverCores(dirs) {
  const {readdir, access} = await import('node:fs/promises');
  const {join} = await import('node:path');
  const cores = [], diagnostics = [];
  for (const dir of dirs) {
    let entries;
    try { entries = await readdir(dir, {withFileTypes: true}); }
    catch (error) { diagnostics.push({severity: 'warning', code: 'E_CORE_MANIFEST', path: dir, message: `could not read directory: ${safeCause(error).message}`}); continue; }
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const manifestPath = join(dir, entry.name, 'core.manifest.json');
      try { await access(manifestPath); } catch { continue; } // no manifest here; not an error
      try { cores.push(await loadCoreFromManifest(manifestPath)); }
      catch (error) { diagnostics.push({severity: 'error', code: error?.code ?? 'E_CORE', path: manifestPath, message: error?.message ?? String(error)}); }
    }
  }
  return {cores, diagnostics};
}

// A registry pre-populated with the built-in JS/TS core, if it is present in
// this build. Importing this module never throws even if the JS/TS core is
// unavailable: defaultRegistry simply starts without it in that case, and
// callers may register cores manually via defaultRegistry.register(...).
export const defaultRegistry = createCoreRegistry();
try {
  const jsTsCoreModule = await import('./cores/js-ts-core/core.mjs');
  if (typeof jsTsCoreModule.createCore === 'function') defaultRegistry.register(jsTsCoreModule.createCore);
  else if (jsTsCoreModule.default) defaultRegistry.register(() => jsTsCoreModule.default);
} catch {
  // Bundled JS/TS core not available in this build yet.
}
