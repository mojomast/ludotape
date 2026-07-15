/// <reference lib="es2017" />
// TypeScript declarations for the Ludotape JS/TS core (`ludotape/js-ts-core`).
// Hand-authored (not generated) — mirrors ../../index.mjs and this directory's core.mjs.
// Zero runtime dependencies; this file describes types only, never compiled to JS.
//
// Generic conventions:
//   S = game state shape, A = action shape, D = authored document shape, P = projection shape.
// Every generic defaults to `CanonicalValue` so consumers can opt into precise typing
// incrementally instead of being forced to parameterize every call site.

/** A JSON-safe leaf or container value: null, boolean, finite number, string, array, or plain object. */
export type CanonicalValue =
  | null
  | boolean
  | number
  | string
  | CanonicalValue[]
  | {[key: string]: CanonicalValue};

/** A seed accepted by {@link createRng}/{@link createRun}: a safe integer, string, boolean, or null. */
export type Seed = number | string | boolean | null;

/** A hex-encoded SHA-256 digest, as produced by {@link digest}. */
export type Digest = string;

/**
 * Deterministic seeded RNG. `next`, `int`, `pick`, and `die` consume one value from the stream;
 * `shuffle` consumes `max(items.length - 1, 0)`; `dice` consumes exactly `count`. These
 * consumption rules are part of the stable, documented sequence — do not rely on any other count.
 */
export interface Rng {
  /** Next float in `[0, 1)`. */
  next(): number;
  /** Next integer in `[0, max)`. `max` must be a positive safe integer. */
  int(max: number): number;
  /** Uniformly pick one element from a non-empty array. */
  pick<T>(items: readonly T[]): T;
  /** Return a new Fisher-Yates shuffled copy of `items`; the input array is not mutated. */
  shuffle<T>(items: readonly T[]): T[];
  /** Roll one die with `sides` faces (default 6), returning a value in `[1, sides]`. */
  die(sides?: number): number;
  /** Roll `count` dice with `sides` faces each, returning an array of length `count`. */
  dice(sides: number, count: number): number[];
  /** Opaque internal RNG state (a `uint32`), useful for resuming a stream via `createRng(seed, state)`. */
  readonly state: number;
}

/** Read-only context passed to observational callbacks (`actions`, `project`, `isGoal`). No RNG. */
export interface ObserverContext<D = CanonicalValue> {
  /** The cartridge's frozen authored document. */
  readonly document: D;
  /** The run's seed, cloned and frozen. */
  readonly seed: Seed;
  /** The run's current turn number (count of committed transitions). */
  readonly turn: number;
}

/** Context passed to `transition`. Extends {@link ObserverContext} with a transaction-scoped RNG. */
export interface TransitionContext<D = CanonicalValue> extends ObserverContext<D> {
  /** Seeded RNG for this transition only. Never use `Math.random()` — determinism depends on this. */
  readonly rng: Rng;
}

/**
 * A game rules specification passed to {@link defineGame}. `initialState`, `actions`, and
 * `transition` are required; `isGoal` and `project` are optional but unlock solving/adapters
 * respectively. All callbacks are trusted, synchronous, and must be free of I/O, clocks, locale
 * dependence, and any randomness not drawn from `context.rng`.
 */
export interface GameSpec<S = CanonicalValue, A = CanonicalValue, D = CanonicalValue> {
  /** Non-empty stable identifier for this ruleset, e.g. `'example/my-counter'`. */
  id: string;
  /** Non-empty rules version string. Bump whenever transition/action/goal behavior changes. */
  version: string;
  /** Arbitrary canonical authoring metadata (title, description, tags, ...). */
  metadata?: CanonicalValue;
  /** Compute the initial state. May consume `context.rng`. */
  initialState(context: TransitionContext<D>): S;
  /** List the actions currently available from `state`. Observational — no RNG. */
  actions(state: S, context: ObserverContext<D>): A[];
  /** Compute the next state for an available `action`. May consume `context.rng`. */
  transition(state: S, action: A, context: TransitionContext<D>): S;
  /** Whether `state` is a goal/terminal state for the solver. Observational — no RNG. */
  isGoal?(state: S, context: ObserverContext<D>): boolean;
  /** Produce a renderer-neutral canonical projection of `state`. Observational — no RNG. */
  project?(state: S, context: ObserverContext<D>): CanonicalValue;
}

/** The frozen, validated result of {@link defineGame} — a trusted ruleset bundle. */
export interface Game<S = CanonicalValue, A = CanonicalValue, D = CanonicalValue> extends GameSpec<S, A, D> {
  readonly metadata: CanonicalValue;
}

/**
 * A deeply frozen rules/document snapshot: the unit consumed by {@link createRun}. `identity`
 * binds `rulesDigest` (the ruleset) and `document` together; two cartridges with the same rules
 * and document always share an `identity`.
 */
export interface Cartridge<S = CanonicalValue, A = CanonicalValue, D = CanonicalValue> {
  readonly format: 'ludotape/cartridge@1';
  /** Digest binding `rulesDigest`, `rulesVersion`, and `document` together. */
  readonly identity: Digest;
  /** Digest of the ruleset (`{id, rulesVersion, metadata}`), independent of the document. */
  readonly rulesDigest: Digest;
  readonly rulesVersion: string;
  readonly ruleset: {readonly id: string; readonly rulesVersion: string; readonly metadata: CanonicalValue};
  /** Frozen authored document (editable content, kept separate from trusted rules). */
  readonly document: D;
  /** The trusted `defineGame` result these rules were compiled from. */
  readonly game: Game<S, A, D>;
}

/** One committed, deeply frozen transition record inside a run's journal. */
export interface JournalEntry<A = CanonicalValue> {
  /** Zero-based index of this transition (also the pre-transition `turn`). */
  readonly index: number;
  readonly action: A;
  /** State digest immediately before this transition. */
  readonly before: Digest;
  /** State digest immediately after this transition. */
  readonly after: Digest;
  /** RNG stream state immediately before this transition. */
  readonly rngBefore: number;
  /** RNG stream state immediately after this transition. */
  readonly rngAfter: number;
}

/**
 * An isolated, immutable-facade run: private state/RNG/journal behind frozen getters. Returned
 * by {@link createRun} and consumed by {@link availability}/{@link dispatch}/{@link project}.
 * `state`, `journal`, and `seed` getters always return fresh clones — never live aliases.
 */
export interface Run<S = CanonicalValue, A = CanonicalValue, D = CanonicalValue> {
  readonly cartridge: Cartridge<S, A, D>;
  readonly seed: Seed;
  /** Current state, cloned fresh on every read. */
  readonly state: S;
  /** Full journal so far, cloned and deep-frozen fresh on every read. */
  readonly journal: readonly JournalEntry<A>[];
  /** Digest of the initial state (turn 0, before any transitions). */
  readonly initialDigest: Digest;
  /** Number of committed transitions so far. */
  readonly turn: number;
}

/** Replay v1: exactly these seven fields, nothing more. See SPEC.md "Replay and solver". */
export interface Replay<A = CanonicalValue> {
  readonly format: 'ludotape/replay@1';
  /** The cartridge `identity` this replay was recorded against. */
  readonly cartridge: Digest;
  readonly seed: Seed;
  /** Digest of the initial state. */
  readonly initial: Digest;
  readonly actions: readonly A[];
  /** One post-transition state digest per action, same length as `actions`. */
  readonly checkpoints: readonly Digest[];
  /** Digest of the final state after replaying every action. */
  readonly final: Digest;
}

/** Result of a successful or failed verification ({@link verifyReplay}/{@link ReplayCursor.verify}). */
export type VerifyResult<S = CanonicalValue, A = CanonicalValue, D = CanonicalValue> =
  | {readonly ok: true; readonly turns: number; readonly final: Digest; readonly run: Run<S, A, D>}
  | {readonly ok: false; readonly error: {readonly code: string; readonly message: string}};

/** Incremental, step-by-step replay verifier created by {@link createReplayCursor}. */
export interface ReplayCursor<S = CanonicalValue, A = CanonicalValue, D = CanonicalValue> {
  /** Dispatch and verify exactly the next action. Throws `E_CURSOR_DONE` if already done. */
  step(): JournalEntry<A>;
  /** Dispatch and verify every remaining action, returning the journal entries produced. */
  stepAll(): JournalEntry<A>[];
  /** Run `stepAll()` and check the final digest, catching and reporting any failure. */
  verify(): VerifyResult<S, A, D>;
  /** Number of actions verified so far. */
  readonly turn: number;
  /** The underlying run, advanced through the verified prefix. */
  readonly run: Run<S, A, D>;
  /** Whether every action in the replay has been verified. */
  readonly done: boolean;
}

/** Options accepted by {@link solve}. All limits are optional finite integer ceilings. */
export interface SolveOptions<S = CanonicalValue, D = CanonicalValue> {
  seed?: Seed;
  /** Override the cartridge's `isGoal` callback for this solve call. */
  isGoal?(state: S, context: ObserverContext<D>): boolean;
  maxDepth?: number;
  maxNodes?: number;
  maxActions?: number;
  maxGenerated?: number;
  maxQueue?: number;
  maxStateBytes?: number;
}

/** Result of {@link solve}: BFS over available actions, deduplicated by (state, RNG, turn). */
export type SolveResult<A = CanonicalValue, S = CanonicalValue> =
  | {readonly status: 'solved'; readonly actions: A[]; readonly state: S; readonly visited: number; readonly generated: number; readonly depth: number}
  | {readonly status: 'unsolved' | 'bounded'; readonly actions: null; readonly visited: number; readonly generated: number; readonly depth: null};

/** Options accepted by {@link runActions}. */
export interface RunActionsOptions {
  seed?: Seed;
  maxActions?: number;
}

/** Per-scenario/per-step result shape used by the authoring toolkit (`ludotape/authoring`). */
export interface ScenarioResult {
  readonly ok: boolean;
  readonly name: string;
  readonly diagnostics: readonly {
    readonly severity: 'error' | 'warning';
    readonly code: string;
    readonly scenario: string;
    readonly step: number | null;
    readonly path: string;
    readonly message: string;
    readonly [key: string]: CanonicalValue | string | number | null;
  }[];
  readonly trace: CanonicalValue | null;
}

/** Thrown by every coded Ludotape failure. `code` is a stable machine-readable identifier. */
export class LudotapeError extends Error {
  constructor(code: string, message?: string, details?: unknown);
  readonly name: 'LudotapeError';
  readonly code: string;
  readonly details?: unknown;
}

/** All four capability flags an `ICore` must declare, matching `ludotape/core@1`. */
export interface CoreCapabilities {
  readonly replay: boolean;
  readonly rewind: boolean;
  readonly solve: boolean;
  readonly scenarios: boolean;
}

/** Deep-frozen canonical metadata identifying a core, per the `ludotape/core@1` core manifest spec. */
export interface CoreMetadata {
  readonly format: 'ludotape/core@1';
  readonly id: string;
  readonly version: string;
  readonly name: string;
  readonly description?: string;
  readonly capabilities: CoreCapabilities;
  readonly cartridgeFormats: readonly string[];
}

/**
 * A pluggable runtime that interprets a cartridge format and exposes the standard run lifecycle.
 * See `/CORE_SPEC.md` for the normative contract. `init`/`teardown` are added by the loader/host,
 * not implemented by every core; `isGoal`/`solve`/`createReplay`/`verifyReplay`/`rewindRun` are
 * required exactly when the corresponding `metadata.capabilities` flag is `true`.
 */
export interface ICore<S = CanonicalValue, A = CanonicalValue, D = CanonicalValue> {
  readonly metadata: CoreMetadata;
  /**
   * Accepts an already-compiled cartridge, a module namespace object exposing one via
   * `default`/`cartridge`, or (core-specific) an authoring shape such as `{game, document}`.
   * MAY be async. Always returns (or resolves to) a frozen cartridge with string `format`
   * and `identity` fields; malformed input throws a coded `LudotapeError`, never a raw TypeError.
   */
  loadCartridge(source: unknown): Cartridge<S, A, D> | Promise<Cartridge<S, A, D>>;
  createRun(cartridge: Cartridge<S, A, D>, options?: {seed?: Seed}): Run<S, A, D>;
  availability(run: Run<S, A, D>): A[];
  dispatch(run: Run<S, A, D>, action: A): JournalEntry<A>;
  project<P = CanonicalValue>(run: Run<S, A, D>, adapter?: (view: CanonicalValue, info: CanonicalValue) => P, options?: {maxDepth?: number; maxNodes?: number; maxBytes?: number}): P;
  init?(host: {log(...args: unknown[]): void}): void | Promise<void>;
  teardown?(): void | Promise<void>;
  isGoal?(run: Run<S, A, D>): boolean;
  solve?(cartridge: Cartridge<S, A, D>, options?: SolveOptions<S, D>): SolveResult<A, S>;
  createReplay?(run: Run<S, A, D>): Replay<A>;
  verifyReplay?(cartridge: Cartridge<S, A, D>, replay: Replay<A>, options?: {maxDepth?: number; maxBytes?: number; maxActions?: number}): VerifyResult<S, A, D>;
  rewindRun?(run: Run<S, A, D>, turns?: number): Run<S, A, D>;
}

/** Validate and freeze a game specification. Throws `E_GAME` for missing/malformed callbacks. */
export function defineGame<S = CanonicalValue, A = CanonicalValue, D = CanonicalValue>(spec: GameSpec<S, A, D>): Game<S, A, D>;

/** Bind a defined game to an authored document, producing a deeply frozen, identity-bound cartridge. */
export function compileCartridge<S = CanonicalValue, A = CanonicalValue, D = CanonicalValue>(game: Game<S, A, D>, document?: D): Cartridge<S, A, D>;

/** Define a game and compile it with its authoring document in one step: `{document, ...gameSpec}`. */
export function defineCartridge<S = CanonicalValue, A = CanonicalValue, D = CanonicalValue>(spec: GameSpec<S, A, D> & {document?: D}): Cartridge<S, A, D>;

/** Start a fresh isolated run from a compiled cartridge and an optional seed (default `0`). */
export function createRun<S = CanonicalValue, A = CanonicalValue, D = CanonicalValue>(cartridge: Cartridge<S, A, D>, options?: {seed?: Seed}): Run<S, A, D>;

/** List the actions currently available in `run`. */
export function availability<S = CanonicalValue, A = CanonicalValue, D = CanonicalValue>(run: Run<S, A, D>): A[];

/** Alias of {@link availability}. */
export function legalActions<S = CanonicalValue, A = CanonicalValue, D = CanonicalValue>(run: Run<S, A, D>): A[];

/** Dispatch an available action, mutating `run` in place and returning its journal entry. Throws `E_ILLEGAL_ACTION` for unavailable actions. */
export function dispatch<S = CanonicalValue, A = CanonicalValue, D = CanonicalValue>(run: Run<S, A, D>, action: A): JournalEntry<A>;

/** Create a fresh seeded run and dispatch a bounded canonical action script against it. */
export function runActions<S = CanonicalValue, A = CanonicalValue, D = CanonicalValue>(cartridge: Cartridge<S, A, D>, actions: A[], options?: RunActionsOptions): Run<S, A, D>;

/** Reconstruct a new run a non-negative number of turns in the past, replaying and cross-checking the journal. */
export function rewindRun<S = CanonicalValue, A = CanonicalValue, D = CanonicalValue>(run: Run<S, A, D>, turns?: number): Run<S, A, D>;

/** Project the current state through the cartridge's `project` callback (or raw state if absent), optionally through a renderer adapter. */
export function project<S = CanonicalValue, A = CanonicalValue, D = CanonicalValue, P = CanonicalValue>(run: Run<S, A, D>, adapter?: (view: CanonicalValue, info: CanonicalValue) => P, options?: {maxDepth?: number; maxNodes?: number; maxBytes?: number}): P;

/** Snapshot `run`'s full action history as a compact, verifiable `Replay`. */
export function createReplay<S = CanonicalValue, A = CanonicalValue, D = CanonicalValue>(run: Run<S, A, D>): Replay<A>;

/** Create an incremental, step-by-step verifier for `replay` against `cartridge`. */
export function createReplayCursor<S = CanonicalValue, A = CanonicalValue, D = CanonicalValue>(cartridge: Cartridge<S, A, D>, replay: Replay<A>, options?: {maxDepth?: number; maxBytes?: number; maxActions?: number}): ReplayCursor<S, A, D>;

/** Verify a replay against `cartridge` in one shot, reporting `{ok:false, error}` instead of throwing on mismatch. */
export function verifyReplay<S = CanonicalValue, A = CanonicalValue, D = CanonicalValue>(cartridge: Cartridge<S, A, D>, replay: Replay<A>, options?: {maxDepth?: number; maxBytes?: number; maxActions?: number}): VerifyResult<S, A, D>;

/** `{create: createReplay, verify: verifyReplay}` convenience bundle. */
export const replay: {
  create: typeof createReplay;
  verify: typeof verifyReplay;
};

/** Bounded breadth-first search for a goal state, deduplicated by (state, RNG state, turn). */
export function solve<S = CanonicalValue, A = CanonicalValue, D = CanonicalValue>(cartridge: Cartridge<S, A, D>, options?: SolveOptions<S, D>): SolveResult<A, S>;

/** Create a deterministic seeded RNG. Pass `internalState` to resume a previously observed stream position. */
export function createRng(seed?: Seed, internalState?: number): Rng;

/** Canonical JSON text for `value`: sorted object keys, `-0` normalized to `0`, hostile shapes rejected. */
export function canonical(value: CanonicalValue, options?: {maxDepth?: number; maxNodes?: number; maxBytes?: number}): string;

/** SHA-256 hex digest of raw UTF-8 `text`. */
export function sha256Text(text: string): Digest;

/** SHA-256 hex digest of `canonical(value)`. */
export function digest(value: CanonicalValue, options?: {maxDepth?: number; maxNodes?: number; maxBytes?: number}): Digest;

/** Alias of {@link digest}. */
export function valueDigest(value: CanonicalValue, options?: {maxDepth?: number; maxNodes?: number; maxBytes?: number}): Digest;

/** Deeply and structurally clone a canonical value via `JSON.parse(canonical(value))`. */
export function clone<T extends CanonicalValue>(value: T, options?: {maxDepth?: number; maxNodes?: number; maxBytes?: number}): T;

/** Recursively `Object.freeze` `value` and every nested own-property value, cycle-safe. Returns `value`. */
export function deepFreeze<T>(value: T, seen?: Set<unknown>): T;

/** Factory returning a fresh, frozen `ICore` instance for `ludotape/js-ts-core`. May be called multiple times. */
export function createCore<S = CanonicalValue, A = CanonicalValue, D = CanonicalValue>(): ICore<S, A, D>;

/** Convenience instance: the result of one `createCore()` call. */
declare const defaultCore: ICore;
export default defaultCore;
