/**
 * Ludotape 0.2.0 -- root TypeScript declarations for the `ludotape` package entry.
 *
 * These types describe the runtime shapes exported by `src/index.mjs` plus the shared core
 * types (`CoreMetadata`, `CoreCapabilities`, `ICore`, `CoreRegistry`) used by `ludotape/core`,
 * `ludotape/js-ts-core`, and custom cores. See CORE_SPEC.md for the normative ICore contract
 * and SPEC.md for the base runtime contract.
 *
 * `src/cores/js-ts-core/types.d.ts` declares a parallel, narrower set of game-authoring types
 * for consumers who only import `ludotape/js-ts-core`; the two are meant to stay consistent.
 */

// ---------------------------------------------------------------------------------------------
// Canonical values
// ---------------------------------------------------------------------------------------------

/** A JSON-like value accepted by `canonical()`: no functions, symbols, cycles, or `-0`. */
export type CanonicalValue =
  | null
  | boolean
  | number
  | string
  | CanonicalValue[]
  | {[key: string]: CanonicalValue};

// ---------------------------------------------------------------------------------------------
// RNG
// ---------------------------------------------------------------------------------------------

/** Deterministic RNG returned by `createRng()`. See createRng's doc comment for consumption rules. */
export interface Rng {
  /** Consumes one value; returns a float in [0, 1). */
  next(): number;
  /** Consumes one value; returns an integer in [0, max). */
  int(max: number): number;
  /** Consumes one value; returns a uniformly picked element. */
  pick<T>(items: readonly T[]): T;
  /** Consumes max(items.length - 1, 0) values; returns a new shuffled array. */
  shuffle<T>(items: readonly T[]): T[];
  /** Consumes one value; returns an integer in [1, sides]. */
  die(sides?: number): number;
  /** Consumes exactly `count` values; returns `count` die rolls. */
  dice(sides: number, count: number): number[];
  /** Current internal RNG state (safe to persist/restore via `createRng(seed, state)`). */
  readonly state: number;
}

// ---------------------------------------------------------------------------------------------
// Game / cartridge / run
// ---------------------------------------------------------------------------------------------

/** Context passed to `actions`/`isGoal`/`project` (read-only, no RNG). */
export interface ObserverContext<D = CanonicalValue> {
  readonly document: D;
  readonly seed: CanonicalValue;
  readonly turn: number;
}

/** Context passed to `initialState`/`transition` (adds the seeded `rng`). */
export interface TransitionContext<D = CanonicalValue> extends ObserverContext<D> {
  readonly rng: Rng;
}

/** The specification passed to `defineGame()`. */
export interface GameSpec<S = CanonicalValue, A = CanonicalValue, D = CanonicalValue> {
  id: string;
  version: string;
  metadata?: CanonicalValue;
  initialState(context: TransitionContext<D>): S;
  actions(state: S, context: ObserverContext<D>): A[];
  transition(state: S, action: A, context: TransitionContext<D>): S;
  isGoal?(state: S, context: ObserverContext<D>): boolean;
  project?(state: S, context: ObserverContext<D>): CanonicalValue;
}

/** The frozen result of `defineGame()`. */
export type Game<S = CanonicalValue, A = CanonicalValue, D = CanonicalValue> =
  Readonly<GameSpec<S, A, D>> & {readonly metadata: CanonicalValue};

/** A frozen, identity-bound compiled cartridge (see SPEC.md). */
export interface Cartridge<S = CanonicalValue, A = CanonicalValue, D = CanonicalValue> {
  readonly format: 'ludotape/cartridge@1';
  readonly identity: string;
  readonly rulesDigest: string;
  readonly rulesVersion: string;
  readonly ruleset: Readonly<{id: string; rulesVersion: string; metadata: CanonicalValue}>;
  readonly document: D;
  readonly game: Game<S, A, D>;
}

/** One dispatched action's journal record. */
export interface JournalEntry<A = CanonicalValue> {
  readonly index: number;
  readonly action: A;
  readonly before: string;
  readonly after: string;
  readonly rngBefore: number;
  readonly rngAfter: number;
}

/** A live run: current state, journal, and identity of the compiled cartridge it started from. */
export interface Run<S = CanonicalValue, A = CanonicalValue, D = CanonicalValue> {
  readonly cartridge: Cartridge<S, A, D>;
  readonly seed: CanonicalValue;
  readonly state: S;
  readonly journal: readonly JournalEntry<A>[];
  readonly initialDigest: string;
  readonly turn: number;
}

// ---------------------------------------------------------------------------------------------
// Replay
// ---------------------------------------------------------------------------------------------

/** A portable, bounded replay: a seed + action script + checkpoint digests. */
export interface Replay<A = CanonicalValue> {
  readonly format: 'ludotape/replay@1';
  readonly cartridge: string;
  readonly seed: CanonicalValue;
  readonly initial: string;
  readonly actions: readonly A[];
  readonly checkpoints: readonly string[];
  readonly final: string;
}

/** Result of `verifyReplay()` / `ReplayCursor#verify()`. */
export type VerifyResult<S = CanonicalValue, A = CanonicalValue, D = CanonicalValue> =
  | {ok: true; turns: number; final: string; run: Run<S, A, D>}
  | {ok: false; error: {code: string; message: string}};

/** Incremental step-by-step replay verifier returned by `createReplayCursor()`. */
export interface ReplayCursor<S = CanonicalValue, A = CanonicalValue, D = CanonicalValue> {
  step(): JournalEntry<A>;
  stepAll(): JournalEntry<A>[];
  verify(): VerifyResult<S, A, D>;
  readonly turn: number;
  readonly run: Run<S, A, D>;
  readonly done: boolean;
}

// ---------------------------------------------------------------------------------------------
// Solve
// ---------------------------------------------------------------------------------------------

/** Bounded-search options accepted by `solve()`. All bounds are optional with safe defaults. */
export interface SolveOptions<S = CanonicalValue, D = CanonicalValue> {
  seed?: CanonicalValue;
  maxDepth?: number;
  maxNodes?: number;
  maxActions?: number;
  maxGenerated?: number;
  maxQueue?: number;
  maxStateBytes?: number;
  isGoal?(state: S, context: ObserverContext<D>): boolean;
}

/** Result of `solve()`. */
export type SolveResult<A = CanonicalValue> =
  | {status: 'solved'; actions: A[]; state: CanonicalValue; visited: number; generated: number; depth: number}
  | {status: 'bounded' | 'unsolved'; actions: null; visited: number; generated: number; depth: number | null};

// ---------------------------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------------------------

/** The single coded error type thrown across Ludotape (`error.code` is a stable string). */
export class LudotapeError extends Error {
  readonly name: 'LudotapeError';
  readonly code: string;
  readonly details?: unknown;
  constructor(code: string, message: string, details?: unknown);
}

// ---------------------------------------------------------------------------------------------
// Canonicalization / hashing / RNG factory
// ---------------------------------------------------------------------------------------------

export interface CanonicalOptions {
  maxDepth?: number;
  maxNodes?: number;
  maxBytes?: number;
}

/** Canonical JSON serialization with hostile-object rejection and resource limits. */
export function canonical(value: unknown, options?: CanonicalOptions): string;
/** SHA-256 of a UTF-8 string, as a lowercase hex string. */
export function sha256Text(text: string): string;
/** `sha256Text(canonical(value))`. */
export function digest(value: unknown, options?: CanonicalOptions): string;
/** Alias of `digest`. */
export const valueDigest: typeof digest;
/** Deep-clone a canonical value via `JSON.parse(canonical(value))`. */
export function clone<T>(value: T, options?: CanonicalOptions): T;
/** Recursively `Object.freeze()` a value (cycle-safe). Returns the same reference. */
export function deepFreeze<T>(value: T): T;

/** Create a deterministic RNG. See `Rng` for consumption-rule documentation. */
export function createRng(seed?: CanonicalValue, internalState?: number): Rng;

// ---------------------------------------------------------------------------------------------
// Game/cartridge lifecycle
// ---------------------------------------------------------------------------------------------

/** Validate and freeze a game specification. */
export function defineGame<S = CanonicalValue, A = CanonicalValue, D = CanonicalValue>(
  spec: GameSpec<S, A, D>
): Game<S, A, D>;

/** Compile a game + authoring document into a frozen, identity-bound cartridge. */
export function compileCartridge<S = CanonicalValue, A = CanonicalValue, D = CanonicalValue>(
  game: Game<S, A, D>,
  document?: D
): Cartridge<S, A, D>;

/** `compileCartridge(defineGame(spec), spec.document)` in one step. */
export function defineCartridge<S = CanonicalValue, A = CanonicalValue, D = CanonicalValue>(
  spec: GameSpec<S, A, D> & {document?: D}
): Cartridge<S, A, D>;

/** Create a fresh seeded run from a compiled cartridge. */
export function createRun<S = CanonicalValue, A = CanonicalValue, D = CanonicalValue>(
  cartridge: Cartridge<S, A, D>,
  options?: {seed?: CanonicalValue}
): Run<S, A, D>;

/** Canonical array of actions available from the run's current state. */
export function availability<S = CanonicalValue, A = CanonicalValue, D = CanonicalValue>(
  run: Run<S, A, D>
): A[];
/** Alias of `availability`. */
export const legalActions: typeof availability;

/** Dispatch an available action; mutates the run in place and returns the journal entry. */
export function dispatch<S = CanonicalValue, A = CanonicalValue, D = CanonicalValue>(
  run: Run<S, A, D>,
  action: A
): JournalEntry<A>;

/** Create a fresh seeded run and dispatch a bounded canonical action script against it. */
export function runActions<S = CanonicalValue, A = CanonicalValue, D = CanonicalValue>(
  cartridge: Cartridge<S, A, D>,
  actions: readonly A[],
  options?: {seed?: CanonicalValue; maxActions?: number}
): Run<S, A, D>;

/** Reconstruct a new run a non-negative number of turns in the past. */
export function rewindRun<S = CanonicalValue, A = CanonicalValue, D = CanonicalValue>(
  run: Run<S, A, D>,
  turns?: number
): Run<S, A, D>;

/** Compute the renderer-neutral projection, optionally piping it through an adapter. */
export function project<S = CanonicalValue, A = CanonicalValue, D = CanonicalValue, R = CanonicalValue>(
  run: Run<S, A, D>,
  adapter?: (view: CanonicalValue, info: CanonicalValue) => R,
  options?: {maxDepth?: number; maxNodes?: number; maxBytes?: number}
): R;

// ---------------------------------------------------------------------------------------------
// Replay
// ---------------------------------------------------------------------------------------------

export function createReplay<S = CanonicalValue, A = CanonicalValue, D = CanonicalValue>(
  run: Run<S, A, D>
): Replay<A>;

export function createReplayCursor<S = CanonicalValue, A = CanonicalValue, D = CanonicalValue>(
  cartridge: Cartridge<S, A, D>,
  replay: Replay<A>,
  options?: CanonicalOptions & {maxActions?: number}
): ReplayCursor<S, A, D>;

export function verifyReplay<S = CanonicalValue, A = CanonicalValue, D = CanonicalValue>(
  cartridge: Cartridge<S, A, D>,
  replay: Replay<A>,
  options?: CanonicalOptions & {maxActions?: number}
): VerifyResult<S, A, D>;

/** `{create: createReplay, verify: verifyReplay}`. */
export const replay: {
  create: typeof createReplay;
  verify: typeof verifyReplay;
};

// ---------------------------------------------------------------------------------------------
// Solve
// ---------------------------------------------------------------------------------------------

export function solve<S = CanonicalValue, A = CanonicalValue, D = CanonicalValue>(
  cartridge: Cartridge<S, A, D>,
  options?: SolveOptions<S, D>
): SolveResult<A>;

// ---------------------------------------------------------------------------------------------
// Core types (shared by ludotape/core, ludotape/js-ts-core, and custom cores)
// ---------------------------------------------------------------------------------------------

/** The four required, all-boolean core capability flags. */
export interface CoreCapabilities {
  replay: boolean;
  rewind: boolean;
  solve: boolean;
  scenarios: boolean;
}

/** A core's frozen, canonical metadata (must match its `core.manifest.json`). */
export interface CoreMetadata {
  readonly format: 'ludotape/core@1';
  readonly id: string;
  readonly version: string;
  readonly name: string;
  readonly description?: string;
  readonly capabilities: CoreCapabilities;
  readonly cartridgeFormats: readonly string[];
}

/** Host handed to `ICore#init()`. */
export interface CoreHost {
  log(...args: unknown[]): void;
}

/**
 * The normative ICore interface (see CORE_SPEC.md). `RunT` is the core's own run handle type
 * (opaque to callers); it need not be Ludotape's `Run<S, A, D>`.
 */
export interface ICore<S = CanonicalValue, A = CanonicalValue, D = CanonicalValue, RunT = Run<S, A, D>> {
  readonly metadata: CoreMetadata;

  loadCartridge(source: unknown): Cartridge<S, A, D> | Promise<Cartridge<S, A, D>>;
  createRun(cartridge: Cartridge<S, A, D>, options?: {seed?: CanonicalValue}): RunT;
  availability(run: RunT): A[];
  dispatch(run: RunT, action: A): JournalEntry<A>;
  project(run: RunT, adapter?: (view: CanonicalValue, info: CanonicalValue) => unknown, options?: unknown): unknown;

  init?(host: CoreHost): void | Promise<void>;
  teardown?(): void | Promise<void>;
  isGoal?(run: RunT): boolean;
  solve?(cartridge: Cartridge<S, A, D>, options?: unknown): SolveResult<A>;
  createReplay?(run: RunT): Replay<A>;
  verifyReplay?(cartridge: Cartridge<S, A, D>, replay: Replay<A>, options?: unknown): VerifyResult<S, A, D>;
  rewindRun?(run: RunT, turns?: number): RunT;

  /** Added by the loader's `wrapCore()`; cores themselves do not implement these. */
  tick?(run: RunT, action: A): JournalEntry<A>;
  render?(run: RunT, adapter?: unknown, options?: unknown): unknown;
}

/** One diagnostic row from `validateCoreShape()` / devkit's `validateCore()`. */
export interface CoreDiagnostic {
  severity: 'error' | 'warning';
  code: string;
  path: string;
  message: string;
}

/** Result of `validateCoreShape()` and devkit's `validateCore()`. */
export interface CoreShapeResult {
  ok: boolean;
  diagnostics: CoreDiagnostic[];
}

/** Registry returned by `createCoreRegistry()` / `ludotape/core`'s `defaultRegistry`. */
export interface CoreRegistry {
  register(core: ICore | (() => ICore)): ICore;
  get(id: string): ICore;
  list(): CoreMetadata[];
  resolve(cartridge: Cartridge): ICore;
  unregister(id: string): void;
}
