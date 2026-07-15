// Ludotape public core. No dependencies; callbacks execute as trusted application code.
const enc = new TextEncoder();
export class LudotapeError extends Error { constructor(code, message, details) { super(message); this.name='LudotapeError'; this.code=code; this.details=details; } }
const bad=(code,msg,details)=>{throw new LudotapeError(code,msg,details)};
export function canonical(value) {
  const seen=new Set();
  function walk(v,path) {
    if(v===null||typeof v==='boolean'||typeof v==='string') return JSON.stringify(v);
    if(typeof v==='number') { if(!Number.isFinite(v)) bad('E_CANONICAL',`Non-finite number at ${path}`); return Object.is(v,-0)?'0':JSON.stringify(v); }
    if(typeof v==='bigint'||typeof v==='undefined'||typeof v==='function'||typeof v==='symbol') bad('E_CANONICAL',`Unsupported value at ${path}`);
    if(seen.has(v)) bad('E_CANONICAL',`Cycle at ${path}`); seen.add(v);
    let out;
    if(Array.isArray(v)) out='['+v.map((x,i)=>walk(x,`${path}[${i}]`)).join(',')+']';
    else { const proto=Object.getPrototypeOf(v); if(proto!==Object.prototype&&proto!==null) bad('E_CANONICAL',`Non-plain object at ${path}`); out='{'+Object.keys(v).sort().map(k=>JSON.stringify(k)+':'+walk(v[k],`${path}.${k}`)).join(',')+'}'; }
    seen.delete(v); return out;
  }
  return walk(value,'$');
}
// Compact, synchronous SHA-256 implementation suitable for identity and replay checks.
export function digest(value) {
  const bytes=enc.encode(typeof value==='string'?value:canonical(value)), l=bytes.length, bit=l*8;
  const n=((l+9+63)>>6)<<6, b=new Uint8Array(n); b.set(bytes); b[l]=128; const dv=new DataView(b.buffer); dv.setUint32(n-4,bit>>>0); dv.setUint32(n-8,Math.floor(bit/2**32));
  const h=new Uint32Array([0x6a09e667,0xbb67ae85,0x3c6ef372,0xa54ff53a,0x510e527f,0x9b05688c,0x1f83d9ab,0x5be0cd19]);
  const k=new Uint32Array(64); for(let i=0,p=2;i<64;p++){let prime=true;for(let d=2;d*d<=p;d++)if(p%d===0){prime=false;break}if(prime)k[i++]=Math.floor((Math.cbrt(p)%1)*2**32)}
  const w=new Uint32Array(64),rotr=(x,n)=>(x>>>n)|(x<<(32-n));
  for(let o=0;o<n;o+=64){for(let i=0;i<16;i++)w[i]=dv.getUint32(o+i*4);for(let i=16;i<64;i++){const a=w[i-15],c=w[i-2];w[i]=(w[i-16]+(rotr(a,7)^rotr(a,18)^(a>>>3))+w[i-7]+(rotr(c,17)^rotr(c,19)^(c>>>10)))>>>0}let [a,c,d,e,f,g,q,z]=h;for(let i=0;i<64;i++){const t1=(z+(rotr(f,6)^rotr(f,11)^rotr(f,25))+((f&g)^(~f&q))+k[i]+w[i])>>>0,t2=((rotr(a,2)^rotr(a,13)^rotr(a,22))+((a&c)^(a&d)^(c&d)))>>>0;z=q;q=g;g=f;f=(e+t1)>>>0;e=d;d=c;c=a;a=(t1+t2)>>>0}h[0]=(h[0]+a)>>>0;h[1]=(h[1]+c)>>>0;h[2]=(h[2]+d)>>>0;h[3]=(h[3]+e)>>>0;h[4]=(h[4]+f)>>>0;h[5]=(h[5]+g)>>>0;h[6]=(h[6]+q)>>>0;h[7]=(h[7]+z)>>>0}
  return [...h].map(x=>x.toString(16).padStart(8,'0')).join('');
}
export function createRng(seed=0){let s=(typeof seed==='number'?seed:parseInt(digest(String(seed)).slice(0,8),16))>>>0;return Object.freeze({next(){s=(s+0x6D2B79F5)>>>0;let t=s;t=Math.imul(t^(t>>>15),t|1);t^=t+Math.imul(t^(t>>>7),t|61);return((t^(t>>>14))>>>0)/4294967296},int(max){if(!Number.isInteger(max)||max<=0)bad('E_RNG','max must be a positive integer');return Math.floor(this.next()*max)},pick(items){if(!Array.isArray(items)||!items.length)bad('E_RNG','cannot pick from empty collection');return items[this.int(items.length)]},get state(){return s}})}
export const clone=v=>JSON.parse(canonical(v));
export function defineGame(spec){
  if(!spec||typeof spec!=='object')bad('E_GAME','game specification required');
  for(const key of ['id','version'])if(typeof spec[key]!=='string'||!spec[key])bad('E_GAME',`${key} must be a non-empty string`);
  for(const key of ['initialState','actions'])if(typeof spec[key]!=='function')bad('E_GAME',`${key} callback required`);
  if(spec.transition&&typeof spec.transition!=='function')bad('E_GAME','transition must be a function');
  return Object.freeze({...spec});
}
export function compileCartridge(game,document={}){
  if(!game?.id)bad('E_GAME','use defineGame first'); canonical(document);
  const ruleset={id:game.id,version:game.version,metadata:game.metadata??{}};
  const identity=digest({format:'ludotape/cartridge@1',ruleset,document});
  return Object.freeze({format:'ludotape/cartridge@1',identity,ruleset,document:clone(document),game});
}
function context(run){return Object.freeze({document:run.cartridge.document,seed:run.seed,turn:run.journal.length,rng:run.rng});}
export function createRun(cartridge,{seed=0}={}){
  if(!cartridge?.identity)bad('E_CARTRIDGE','compiled cartridge required');
  const rng=createRng(seed), run={cartridge,seed,state:null,journal:[],rng,initialDigest:null};
  run.state=clone(cartridge.game.initialState(context(run))); run.initialDigest=digest(run.state); return run;
}
export function availability(run){const list=run.cartridge.game.actions(clone(run.state),context(run));if(!Array.isArray(list))bad('E_ACTIONS','actions callback must return an array');return clone(list);}
export const legalActions=availability;
function sameAction(a,b){return canonical(a)===canonical(b)}
export function dispatch(run,action){
  const legal=availability(run); if(!legal.some(x=>sameAction(x,action)))bad('E_ILLEGAL_ACTION','action is not currently available',{action,legal});
  const before=digest(run.state), g=run.cartridge.game, next=g.transition?g.transition(clone(run.state),clone(action),context(run)):action.reduce(clone(run.state),context(run));
  canonical(next); run.state=clone(next); const entry={index:run.journal.length,action:clone(action),before,after:digest(run.state)};run.journal.push(entry);return Object.freeze(clone(entry));
}
export function project(run,adapter){const view=run.cartridge.game.project?run.cartridge.game.project(clone(run.state),context(run)):clone(run.state);return adapter?adapter(view,run):view;}
export function createReplay(run){return {format:'ludotape/replay@1',cartridge:run.cartridge.identity,seed:run.seed,initial:run.initialDigest,actions:run.journal.map(x=>x.action),checkpoints:run.journal.map(x=>x.after),final:digest(run.state)};}
export function verifyReplay(cartridge,replay){
  try{if(replay?.format!=='ludotape/replay@1')bad('E_REPLAY','unsupported replay format');if(replay.cartridge!==cartridge.identity)bad('E_IDENTITY','cartridge identity mismatch');const run=createRun(cartridge,{seed:replay.seed});if(run.initialDigest!==replay.initial)bad('E_INITIAL','initial state mismatch');for(let i=0;i<replay.actions.length;i++){const e=dispatch(run,replay.actions[i]);if(replay.checkpoints?.[i]&&replay.checkpoints[i]!==e.after)bad('E_CHECKPOINT',`checkpoint ${i} mismatch`)}if(digest(run.state)!==replay.final)bad('E_FINAL','final state mismatch');return {ok:true,turns:run.journal.length,final:replay.final,run};}catch(error){return {ok:false,error:{code:error.code??'E_UNKNOWN',message:error.message}}}}
export function solve(cartridge,{seed=0,maxDepth=20,maxNodes=10000,isGoal}={}){
  const root=createRun(cartridge,{seed}), goal=isGoal??cartridge.game.isGoal;if(typeof goal!=='function')bad('E_SOLVE','isGoal callback required');const queue=[{run:root,path:[]}],seen=new Set([digest(root.state)]);let visited=0;
  while(queue.length&&visited<maxNodes){const node=queue.shift();visited++;if(goal(clone(node.run.state),context(node.run)))return {status:'solved',actions:node.path,state:clone(node.run.state),visited,depth:node.path.length};if(node.path.length>=maxDepth)continue;for(const a of availability(node.run)){const child=createRun(cartridge,{seed});for(const p of node.path)dispatch(child,p);dispatch(child,a);const key=digest(child.state);if(!seen.has(key)){seen.add(key);queue.push({run:child,path:[...node.path,a]})}}}return {status:queue.length?'bounded':'unsolved',actions:null,visited,depth:null};
}
export const replay={create:createReplay,verify:verifyReplay};
