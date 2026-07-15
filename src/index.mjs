// Ludotape deterministic core. Zero dependencies.
const enc = new TextEncoder();
const DANGEROUS = new Set(['__proto__', 'prototype', 'constructor']);
const DEFAULT_LIMITS = Object.freeze({maxDepth: 100, maxNodes: 100000, maxBytes: 8 * 1024 * 1024});
const K = new Uint32Array(64);
for (let i = 0, candidate = 2; i < K.length; candidate++) {
  let prime = true;
  for (let divisor = 2; divisor * divisor <= candidate; divisor++) {
    if (candidate % divisor === 0) { prime = false; break; }
  }
  if (prime) K[i++] = Math.floor((Math.cbrt(candidate) % 1) * 2 ** 32);
}
const PROJECT_WARNED = new WeakSet();

class RingQueue {
  #items = new Array(16);
  #head = 0;
  #length = 0;
  get length() { return this.#length; }
  push(value) {
    if (this.#length === this.#items.length) {
      const grown = new Array(this.#items.length * 2);
      for (let i = 0; i < this.#length; i++) grown[i] = this.#items[(this.#head + i) % this.#items.length];
      this.#items = grown;
      this.#head = 0;
    }
    this.#items[(this.#head + this.#length) % this.#items.length] = value;
    this.#length++;
  }
  shift() {
    if (this.#length === 0) return undefined;
    const value = this.#items[this.#head];
    this.#items[this.#head] = undefined;
    this.#head = (this.#head + 1) % this.#items.length;
    this.#length--;
    return value;
  }
}

export class LudotapeError extends Error {
  constructor(code, message, details) { super(message); this.name = 'LudotapeError'; this.code = code; this.details = details; }
}
const bad = (code, message, details) => { throw new LudotapeError(code, message, details); };
function bounded(value, fallback, ceiling, name, code = 'E_LIMIT') {
  const n = value ?? fallback;
  if (!Number.isSafeInteger(n) || n < 0 || n > ceiling) bad(code, `${name} must be an integer from 0 to ${ceiling}`);
  return n;
}

/** Canonical JSON with hostile-object rejection and resource limits. */
export function canonical(value, options = {}) {
  const maxDepth = bounded(options.maxDepth, DEFAULT_LIMITS.maxDepth, 1000, 'maxDepth', 'E_CANONICAL_LIMIT');
  const maxNodes = bounded(options.maxNodes, DEFAULT_LIMITS.maxNodes, 1000000, 'maxNodes', 'E_CANONICAL_LIMIT');
  const maxBytes = bounded(options.maxBytes, DEFAULT_LIMITS.maxBytes, 64 * 1024 * 1024, 'maxBytes', 'E_CANONICAL_LIMIT');
  const seen = new Set(); let nodes = 0;
  function walk(v, path, depth) {
    if (++nodes > maxNodes) bad('E_CANONICAL_LIMIT', 'Canonical node limit exceeded');
    if (depth > maxDepth) bad('E_CANONICAL_LIMIT', 'Canonical depth limit exceeded');
    if (v === null || typeof v === 'boolean' || typeof v === 'string') return JSON.stringify(v);
    if (typeof v === 'number') {
      if (!Number.isFinite(v)) bad('E_CANONICAL', `Non-finite number at ${path}`);
      return Object.is(v, -0) ? '0' : JSON.stringify(v);
    }
    if (typeof v !== 'object') bad('E_CANONICAL', `Unsupported value at ${path}`);
    if (seen.has(v)) bad('E_CANONICAL_REFERENCE', `Cycle or shared reference at ${path}`);
    seen.add(v);
    const symbols = Object.getOwnPropertySymbols(v);
    if (symbols.length) bad('E_CANONICAL_PROPERTY', `Symbol property at ${path}`);
    const descriptors = Object.getOwnPropertyDescriptors(v);
    let out;
    if (Array.isArray(v)) {
      const names = Object.getOwnPropertyNames(v);
      if (names.length !== v.length + 1 || names[names.length - 1] !== 'length') bad('E_CANONICAL_ARRAY', `Sparse or decorated array at ${path}`);
      const parts = [];
      for (let i = 0; i < v.length; i++) {
        const d = descriptors[String(i)];
        if (!d || !d.enumerable || !('value' in d) || d.get || d.set) bad('E_CANONICAL_PROPERTY', `Invalid array property at ${path}[${i}]`);
        parts.push(walk(d.value, `${path}[${i}]`, depth + 1));
      }
      out = `[${parts.join(',')}]`;
    } else {
      const proto = Object.getPrototypeOf(v);
      if (proto !== Object.prototype && proto !== null) bad('E_CANONICAL', `Non-plain object at ${path}`);
      const names = Object.getOwnPropertyNames(v);
      const parts = [];
      for (const key of names.sort()) {
        if (DANGEROUS.has(key)) bad('E_CANONICAL_KEY', `Dangerous key at ${path}.${key}`);
        const d = descriptors[key];
        if (!d.enumerable || !('value' in d) || d.get || d.set) bad('E_CANONICAL_PROPERTY', `Accessor or non-enumerable property at ${path}.${key}`);
        parts.push(`${JSON.stringify(key)}:${walk(d.value, `${path}.${key}`, depth + 1)}`);
      }
      out = `{${parts.join(',')}}`;
    }
    return out;
  }
  const result = walk(value, '$', 0);
  if (enc.encode(result).length > maxBytes) bad('E_CANONICAL_LIMIT', 'Canonical output byte limit exceeded');
  return result;
}

function sha256Text(text) {
  if (typeof text !== 'string') bad('E_HASH_TEXT', 'sha256Text requires a string');
  const bytes = enc.encode(text), l = bytes.length, bit = l * 8;
  const n = ((l + 9 + 63) >> 6) << 6, b = new Uint8Array(n); b.set(bytes); b[l] = 128;
  const dv = new DataView(b.buffer); dv.setUint32(n - 4, bit >>> 0); dv.setUint32(n - 8, Math.floor(bit / 2 ** 32));
  const h = new Uint32Array([0x6a09e667,0xbb67ae85,0x3c6ef372,0xa54ff53a,0x510e527f,0x9b05688c,0x1f83d9ab,0x5be0cd19]);
  const w=new Uint32Array(64),rotr=(x,n)=>(x>>>n)|(x<<(32-n));
  for(let o=0;o<n;o+=64){for(let i=0;i<16;i++)w[i]=dv.getUint32(o+i*4);for(let i=16;i<64;i++){const a=w[i-15],c=w[i-2];w[i]=(w[i-16]+(rotr(a,7)^rotr(a,18)^(a>>>3))+w[i-7]+(rotr(c,17)^rotr(c,19)^(c>>>10)))>>>0}let [a,c,d,e,f,g,q,z]=h;for(let i=0;i<64;i++){const t1=(z+(rotr(f,6)^rotr(f,11)^rotr(f,25))+((f&g)^(~f&q))+K[i]+w[i])>>>0,t2=((rotr(a,2)^rotr(a,13)^rotr(a,22))+((a&c)^(a&d)^(c&d)))>>>0;z=q;q=g;g=f;f=(e+t1)>>>0;e=d;d=c;c=a;a=(t1+t2)>>>0}h[0]=(h[0]+a)>>>0;h[1]=(h[1]+c)>>>0;h[2]=(h[2]+d)>>>0;h[3]=(h[3]+e)>>>0;h[4]=(h[4]+f)>>>0;h[5]=(h[5]+g)>>>0;h[6]=(h[6]+q)>>>0;h[7]=(h[7]+z)>>>0}
  return [...h].map(x=>x.toString(16).padStart(8,'0')).join('');
}
export {sha256Text};
/** Digest a canonical value. Strings are values, not raw hash input. */
export const digest = (value, options) => sha256Text(canonical(value, options));
export const valueDigest = digest;
export const clone = (value, options) => JSON.parse(canonical(value, options));
export function deepFreeze(value, seen = new Set()) {
  if (value && typeof value === 'object' && !seen.has(value)) { seen.add(value); for (const d of Object.values(Object.getOwnPropertyDescriptors(value))) if ('value' in d) deepFreeze(d.value, seen); Object.freeze(value); }
  return value;
}

function seedState(seed) {
  canonical(seed, {maxDepth: 4, maxNodes: 16, maxBytes: 1024});
  if (typeof seed === 'number') { if (!Number.isSafeInteger(seed)) bad('E_SEED', 'numeric seed must be a safe integer'); return seed >>> 0; }
  if (typeof seed !== 'string' && typeof seed !== 'boolean' && seed !== null) bad('E_SEED', 'seed must be a safe integer, string, boolean, or null');
  return parseInt(digest(seed).slice(0, 8), 16) >>> 0;
}
export function createRng(seed = 0, internalState) {
  let s = internalState === undefined ? seedState(seed) : internalState >>> 0;
  return Object.freeze({next(){s=(s+0x6D2B79F5)>>>0;let t=s;t=Math.imul(t^(t>>>15),t|1);t^=t+Math.imul(t^(t>>>7),t|61);return((t^(t>>>14))>>>0)/4294967296},int(max){if(!Number.isSafeInteger(max)||max<=0)bad('E_RNG','max must be a positive integer');return Math.floor(this.next()*max)},pick(items){if(!Array.isArray(items)||!items.length)bad('E_RNG','cannot pick from empty collection');return items[this.int(items.length)]},get state(){return s}});
}

export function defineGame(spec) {
  if (!spec || typeof spec !== 'object') bad('E_GAME', 'game specification required');
  for (const key of ['id','version']) if (typeof spec[key] !== 'string' || !spec[key]) bad('E_GAME', `${key} must be a non-empty string`);
  for (const key of ['initialState','actions','transition']) if (typeof spec[key] !== 'function') bad('E_GAME', `${key} callback required`);
  for (const key of ['isGoal','project']) if (spec[key] !== undefined && typeof spec[key] !== 'function') bad('E_GAME', `${key} must be a function if provided`);
  const metadata = clone(spec.metadata ?? {}); deepFreeze(metadata);
  return Object.freeze({...spec, metadata});
}
export function compileCartridge(game, document = {}) {
  if (!game?.id) bad('E_GAME', 'use defineGame first');
  const doc = clone(document); deepFreeze(doc);
  const ruleset = {id:game.id, rulesVersion:game.version, metadata:clone(game.metadata ?? {})}; deepFreeze(ruleset);
  const rulesDigest = digest(ruleset);
  const identitySnapshot = {format:'ludotape/cartridge@1', rulesDigest, rulesVersion:game.version, document:doc};
  const identity = digest(identitySnapshot);
  return Object.freeze({format:'ludotape/cartridge@1', identity, rulesDigest, rulesVersion:game.version, ruleset, document:doc, game});
}

const INTERNAL = new WeakMap();
function data(run) { const d=INTERNAL.get(run); if(!d) bad('E_RUN','valid run required'); return d; }
function publicRun(d) {
  const run = {};
  Object.defineProperties(run, {
    cartridge:{value:d.cartridge, enumerable:true}, seed:{value:deepFreeze(clone(d.seed)), enumerable:true},
    state:{enumerable:true,get:()=>clone(d.state)}, journal:{enumerable:true,get:()=>deepFreeze(clone(d.journal))},
    initialDigest:{value:d.initialDigest, enumerable:true}, turn:{enumerable:true,get:()=>d.turn}
  });
  Object.freeze(run); INTERNAL.set(run,d); return run;
}
function observerContext(d) { return deepFreeze({document:d.cartridge.document, seed:clone(d.seed), turn:d.turn}); }
function transitionContext(d, rng) { return Object.freeze({...observerContext(d), rng}); }
function makeRun(cartridge, seed, state, rngState, turn, journal, initialDigest) {
  const d={cartridge,seed:clone(seed),state:clone(state),rngState:rngState>>>0,turn,journal:clone(journal),initialDigest}; return publicRun(d);
}
export function createRun(cartridge, {seed=0}={}) {
  if (!cartridge?.identity || !Object.isFrozen(cartridge.document)) bad('E_CARTRIDGE','compiled cartridge required');
  const rng=createRng(seed), provisional={cartridge,seed:clone(seed),turn:0};
  const state=clone(cartridge.game.initialState(transitionContext(provisional,rng)));
  return makeRun(cartridge,seed,state,rng.state,0,[],digest(state));
}
export function availability(run) {
  const d=data(run), list=d.cartridge.game.actions(clone(d.state),observerContext(d));
  if(!Array.isArray(list))bad('E_ACTIONS','actions callback must return an array');
  return clone(list);
}
export const legalActions=availability;
function sameAction(a,b){return canonical(a)===canonical(b)}
export function dispatch(run, action) {
  const d=data(run), legal=availability(run);
  if(!legal.some(x=>sameAction(x,action))) bad('E_ILLEGAL_ACTION','action is not currently available',{action:clone(action),legal});
  const before=digest(d.state), rng=createRng(0,d.rngState);
  // All mutation is delayed until callback return and complete canonical validation.
  const next=clone(d.cartridge.game.transition(clone(d.state),clone(action),transitionContext(d,rng)));
  const entry=deepFreeze({index:d.turn,action:clone(action),before,after:digest(next),rngBefore:d.rngState,rngAfter:rng.state});
  d.state=next; d.rngState=rng.state; d.turn++; d.journal.push(entry);
  return deepFreeze(clone(entry));
}
export function project(run, adapter, options={}) {
  const d=data(run);
  if (!d.cartridge.game.project && !PROJECT_WARNED.has(d.cartridge)) {
    PROJECT_WARNED.add(d.cartridge);
    console.warn(`[ludotape] No project() callback defined for cartridge ${d.cartridge.identity.slice(0,12)}; raw state will be projected.`);
  }
  const raw=d.cartridge.game.project?d.cartridge.game.project(clone(d.state),observerContext(d)):clone(d.state);
  const view=deepFreeze(clone(raw,{maxDepth:options.maxDepth??64,maxNodes:options.maxNodes??50000,maxBytes:options.maxBytes??2*1024*1024}));
  if (!adapter) return view;
  const info=deepFreeze({cartridge:{identity:d.cartridge.identity,rulesDigest:d.cartridge.rulesDigest,rulesVersion:d.cartridge.rulesVersion},seed:clone(d.seed),turn:d.turn,stateDigest:digest(d.state)});
  return adapter(view,info);
}
export function createReplay(run) {
  const d=data(run); return clone({format:'ludotape/replay@1',cartridge:d.cartridge.identity,seed:d.seed,initial:d.initialDigest,actions:d.journal.map(x=>x.action),checkpoints:d.journal.map(x=>x.after),final:digest(d.state)});
}
const DIGEST=/^[0-9a-f]{64}$/;
const REPLAY_FIELDS=['actions','cartridge','checkpoints','final','format','initial','seed'];
function replayError(code,msg){bad(code,msg)}
function validateReplayShape(replay, options={}) {
  const maxBytes=bounded(options.maxBytes,2*1024*1024,16*1024*1024,'maxBytes','E_REPLAY_LIMIT');
  const maxActions=bounded(options.maxActions,10000,100000,'maxActions','E_REPLAY_LIMIT');
  let clean; try { clean=clone(replay,{maxDepth:options.maxDepth??64,maxNodes:Math.min(300000,maxActions*20+100),maxBytes}); } catch(e) { replayError(e.code==='E_CANONICAL_LIMIT'?'E_REPLAY_LIMIT':'E_REPLAY_SHAPE',e.message); }
  if (!clean || Array.isArray(clean) || Object.keys(clean).sort().join(',')!==REPLAY_FIELDS.join(',')) replayError('E_REPLAY_FIELDS','replay must contain exactly the required fields');
  if(clean.format!=='ludotape/replay@1')replayError('E_REPLAY_FORMAT','unsupported replay format');
  if(typeof clean.cartridge!=='string'||!DIGEST.test(clean.cartridge))replayError('E_REPLAY_DIGEST','invalid cartridge digest');
  if(typeof clean.initial!=='string'||!DIGEST.test(clean.initial)||typeof clean.final!=='string'||!DIGEST.test(clean.final))replayError('E_REPLAY_DIGEST','invalid state digest');
  if(!Array.isArray(clean.actions)||!Array.isArray(clean.checkpoints))replayError('E_REPLAY_ARRAY','actions and checkpoints must be arrays');
  if(clean.actions.length>maxActions)replayError('E_REPLAY_LIMIT','replay action limit exceeded');
  if(clean.checkpoints.length!==clean.actions.length)replayError('E_REPLAY_CHECKPOINTS','one checkpoint is required per action');
  for(const cp of clean.checkpoints)if(typeof cp!=='string'||!DIGEST.test(cp))replayError('E_REPLAY_DIGEST','invalid checkpoint digest');
  try{seedState(clean.seed)}catch{replayError('E_REPLAY_SEED','invalid replay seed')}
  return clean;
}
/** Create a cursor that incrementally dispatches and verifies a replay. */
export function createReplayCursor(cartridge, replay, options={}) {
  const clean=validateReplayShape(replay,options);
  if(clean.cartridge!==cartridge.identity)bad('E_IDENTITY','cartridge identity mismatch');
  let current=createRun(cartridge,{seed:clean.seed});
  if(current.initialDigest!==clean.initial)bad('E_INITIAL','initial state mismatch');
  let turn=0;
  function step() {
    if(turn>=clean.actions.length)bad('E_CURSOR_DONE','replay cursor is done');
    const candidate=fork(current);
    const entry=dispatch(candidate,clean.actions[turn]);
    if(clean.checkpoints[turn]!==entry.after)bad('E_CHECKPOINT',`checkpoint ${turn} mismatch`);
    current=candidate;
    turn++;
    return entry;
  }
  function stepAll() {
    const entries=[];
    while(turn<clean.actions.length)entries.push(step());
    return entries;
  }
  function verify() {
    try {
      stepAll();
      if(digest(current.state)!==clean.final)bad('E_FINAL','final state mismatch');
      return {ok:true,turns:current.turn,final:clean.final,run:current};
    } catch(error) {
      return {ok:false,error:{code:error.code??'E_UNKNOWN',message:error.message}};
    }
  }
  const cursor={step,stepAll,verify};
  Object.defineProperties(cursor,{
    turn:{enumerable:true,get:()=>turn},
    run:{enumerable:true,get:()=>current},
    done:{enumerable:true,get:()=>turn>=clean.actions.length}
  });
  return Object.freeze(cursor);
}
export function verifyReplay(cartridge,replay,options={}) {
  try {
    const clean=validateReplayShape(replay,options);
    if(clean.cartridge!==cartridge.identity)bad('E_IDENTITY','cartridge identity mismatch');
    const run=createRun(cartridge,{seed:clean.seed}); if(run.initialDigest!==clean.initial)bad('E_INITIAL','initial state mismatch');
    for(let i=0;i<clean.actions.length;i++){const e=dispatch(run,clean.actions[i]);if(clean.checkpoints[i]!==e.after)bad('E_CHECKPOINT',`checkpoint ${i} mismatch`)}
    if(digest(run.state)!==clean.final)bad('E_FINAL','final state mismatch');
    return {ok:true,turns:run.turn,final:clean.final,run};
  } catch(error) { return {ok:false,error:{code:error.code??'E_UNKNOWN',message:error.message}}; }
}

const SOLVER_CEIL=Object.freeze({depth:1000,nodes:1000000,actions:100000,generated:5000000,queue:1000000,stateBytes:8*1024*1024});
function executionKey(d,maxStateBytes){return digest({state:d.state,rngState:d.rngState,turn:d.turn},{maxBytes:maxStateBytes});}
function fork(run){const d=data(run);return makeRun(d.cartridge,d.seed,d.state,d.rngState,d.turn,d.journal,d.initialDigest)}
export function solve(cartridge, options={}) {
  const seed=options.seed??0, maxDepth=bounded(options.maxDepth,20,SOLVER_CEIL.depth,'maxDepth','E_SOLVE_LIMIT'), maxNodes=bounded(options.maxNodes,10000,SOLVER_CEIL.nodes,'maxNodes','E_SOLVE_LIMIT');
  const maxActions=bounded(options.maxActions,1000,SOLVER_CEIL.actions,'maxActions','E_SOLVE_LIMIT'), maxGenerated=bounded(options.maxGenerated,100000,SOLVER_CEIL.generated,'maxGenerated','E_SOLVE_LIMIT');
  const maxQueue=bounded(options.maxQueue,100000,SOLVER_CEIL.queue,'maxQueue','E_SOLVE_LIMIT'), maxStateBytes=bounded(options.maxStateBytes,1024*1024,SOLVER_CEIL.stateBytes,'maxStateBytes','E_SOLVE_LIMIT');
  const root=createRun(cartridge,{seed}), goal=options.isGoal??cartridge.game.isGoal;if(typeof goal!=='function')bad('E_SOLVE','isGoal callback required');
  const queue=new RingQueue(),seen=new Set([executionKey(data(root),maxStateBytes)]);queue.push({run:root,path:[]});let visited=0,generated=0,boundedHit=false;
  while(queue.length){
    if(visited>=maxNodes){boundedHit=true;break} const node=queue.shift();visited++; const nd=data(node.run);
    if(goal(clone(nd.state),observerContext(nd)))return {status:'solved',actions:clone(node.path),state:clone(nd.state),visited,generated,depth:node.path.length};
    if(node.path.length>=maxDepth){boundedHit=true;continue}
    const actions=availability(node.run);if(actions.length>maxActions){boundedHit=true;continue}
    for(const action of actions){
      if(generated>=maxGenerated||queue.length>=maxQueue){boundedHit=true;break}
      const child=fork(node.run);dispatch(child,action);generated++;
      const key=executionKey(data(child),maxStateBytes);if(!seen.has(key)){seen.add(key);queue.push({run:child,path:[...node.path,clone(action)]})}
    }
  }
  return {status:boundedHit?'bounded':'unsolved',actions:null,visited,generated,depth:null};
}
export const replay={create:createReplay,verify:verifyReplay};
