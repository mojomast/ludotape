// Minimal ICore/CoreMetadata declarations for authors adapting this template.
// This file is intentionally thin: it declares only the shapes a custom core
// author needs to see. For the full typed surface of the built-in JS/TS core
// (CanonicalValue, GameSpec, Cartridge, Run, JournalEntry, Rng, etc.) see the
// reference declarations at ../js-ts-core/types.d.ts -- the ICore/CoreMetadata
// shapes below are kept structurally consistent with that file.

/** Values that survive Ludotape's canonical() encoding. */
export type CanonicalValue =
  | null
  | boolean
  | number
  | string
  | CanonicalValue[]
  | {[key: string]: CanonicalValue};

export interface CoreCapabilities {
  replay: boolean;
  rewind: boolean;
  solve: boolean;
  scenarios: boolean;
}

export interface CoreMetadata {
  format: 'ludotape/core@1';
  id: string;
  version: string;
  name: string;
  description?: string;
  capabilities: CoreCapabilities;
  cartridgeFormats: string[];
}

export interface CoreCartridge {
  format: string;
  identity: string;
  [key: string]: CanonicalValue;
}

export interface CoreRun {
  readonly cartridge: CoreCartridge;
  readonly seed: CanonicalValue;
  readonly state: CanonicalValue;
  readonly journal: CoreJournalEntry[];
  readonly turn: number;
}

export interface CoreJournalEntry {
  index: number;
  action: CanonicalValue;
  before: string;
  after: string;
  [key: string]: CanonicalValue | number | string;
}

export interface CoreSolveResult {
  status: 'solved' | 'unsolved' | 'bounded';
  actions: CanonicalValue[] | null;
  visited: number;
  generated: number;
  depth: number | null;
  state?: CanonicalValue;
}

export interface CoreReplayVerification {
  ok: boolean;
  turns?: number;
  final?: string;
  run?: CoreRun;
  error?: {code: string; message: string};
}

/** The interface every Ludotape core must satisfy. See CORE_SPEC.md. */
export interface ICore {
  readonly metadata: CoreMetadata;

  loadCartridge(source: unknown): CoreCartridge | Promise<CoreCartridge>;
  createRun(cartridge: CoreCartridge, options?: {seed?: CanonicalValue}): CoreRun;
  availability(run: CoreRun): CanonicalValue[];
  dispatch(run: CoreRun, action: CanonicalValue): CoreJournalEntry;
  project(run: CoreRun, adapter?: (view: CanonicalValue, info: CanonicalValue) => unknown, options?: Record<string, unknown>): unknown;

  init?(host: {log(...args: unknown[]): void}): void | Promise<void>;
  teardown?(): void | Promise<void>;
  isGoal?(run: CoreRun): boolean;
  solve?(cartridge: CoreCartridge, options?: Record<string, unknown>): CoreSolveResult;
  createReplay?(run: CoreRun): CanonicalValue;
  verifyReplay?(cartridge: CoreCartridge, replay: CanonicalValue, options?: Record<string, unknown>): CoreReplayVerification;
  rewindRun?(run: CoreRun, turns?: number): CoreRun;

  // Added by the loader's wrapCore(); cores themselves do not implement these.
  tick?(run: CoreRun, action: CanonicalValue): CoreJournalEntry;
  render?(run: CoreRun, adapter?: (view: CanonicalValue, info: CanonicalValue) => unknown, options?: Record<string, unknown>): unknown;
}

/** Every core module entry must export both of these. */
export declare function createCore(): ICore;
declare const core: ICore;
export default core;
