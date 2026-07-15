// Type declarations for the `ludotape/core` subpath (src/core-loader.mjs).
// Wired via the `types` condition on the "./core" entry in package.json exports.

import type {CoreRegistry, CoreShapeResult, ICore} from './ludotape.js';

/** Validate an object's shape against the ICore contract. Never throws. */
export function validateCoreShape(core: unknown): CoreShapeResult;
/** Validate + freeze a core, attaching the `tick`/`render` lifecycle aliases. */
export function wrapCore(core: ICore): ICore;
/** Create a fresh, empty core registry. */
export function createCoreRegistry(): CoreRegistry;
/** Read + validate a `core.manifest.json`, import its entry, and return a wrapped core. */
export function loadCoreFromManifest(manifestPath: string): Promise<ICore>;
/** Scan directories for `core.manifest.json` files one level deep and load each one. */
export function discoverCores(dirs: readonly string[]): Promise<{
  cores: ICore[];
  diagnostics: CoreShapeResult['diagnostics'];
}>;
/** A registry pre-populated with the built-in JS/TS core. */
export const defaultRegistry: CoreRegistry;
