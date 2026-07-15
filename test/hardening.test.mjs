import test from 'node:test';
import assert from 'node:assert/strict';
import {canonical,digest,sha256Text,defineGame,compileCartridge,createRun,availability,dispatch,project,createReplay,verifyReplay,solve,LudotapeError} from '../src/index.mjs';
import {createMemoryRepository,createStorageRepository} from '../src/storage.mjs';

const game=defineGame({id:'hardening',version:'1',metadata:{nested:{x:1}},initialState:()=>({n:0}),actions:s=>s.n?[{t:'stay'}]:[{t:'go'}],transition:(s,a)=>({n:s.n+1}),isGoal:s=>s.n===1,project:s=>({n:s.n})});
const cart=compileCartridge(game,{nested:{value:1}});
const code=(fn,want)=>assert.throws(fn,e=>e instanceof LudotapeError&&e.code===want);

test('value digest separates null and string null',()=>assert.notEqual(digest(null),digest('null')));
test('value digest separates true and string true',()=>assert.notEqual(digest(true),digest('true')));
test('value digest separates 1 and string 1',()=>assert.notEqual(digest(1),digest('1')));
test('raw SHA remains explicit',()=>assert.equal(sha256Text('null'),'74234e98afe7498fb5daf1f36ac2d78acc339464f950703b8c019892f982b90b'));
test('sha256Text rejects non-string',()=>code(()=>sha256Text(null),'E_HASH_TEXT'));
test('canonical rejects sparse arrays',()=>{const a=[];a[2]=1;code(()=>canonical(a),'E_CANONICAL_ARRAY')});
test('canonical rejects decorated arrays',()=>{const a=[];a.extra=1;code(()=>canonical(a),'E_CANONICAL_ARRAY')});
test('canonical rejects array symbol properties',()=>{const a=[];a[Symbol('x')]=1;code(()=>canonical(a),'E_CANONICAL_PROPERTY')});
test('canonical rejects object symbol properties',()=>{const o={[Symbol('x')]:1};code(()=>canonical(o),'E_CANONICAL_PROPERTY')});
test('canonical rejects non-enumerable properties',()=>{const o={};Object.defineProperty(o,'x',{value:1});code(()=>canonical(o),'E_CANONICAL_PROPERTY')});
test('canonical never invokes getters',()=>{let called=0;const o={};Object.defineProperty(o,'x',{enumerable:true,get(){called++;return 1}});code(()=>canonical(o),'E_CANONICAL_PROPERTY');assert.equal(called,0)});
test('canonical rejects setters',()=>{const o={};Object.defineProperty(o,'x',{enumerable:true,set(){}});code(()=>canonical(o),'E_CANONICAL_PROPERTY')});
test('canonical rejects shared references',()=>{const x={},o={a:x,b:x};code(()=>canonical(o),'E_CANONICAL_REFERENCE')});
test('canonical rejects __proto__ own key',()=>{const o=Object.create(null);Object.defineProperty(o,'__proto__',{value:1,enumerable:true});code(()=>canonical(o),'E_CANONICAL_KEY')});
test('canonical rejects constructor key',()=>code(()=>canonical({constructor:1}),'E_CANONICAL_KEY'));
test('canonical rejects prototype key',()=>code(()=>canonical({prototype:1}),'E_CANONICAL_KEY'));
test('canonical enforces depth',()=>code(()=>canonical({a:{b:1}},{maxDepth:1}),'E_CANONICAL_LIMIT'));
test('canonical enforces nodes',()=>code(()=>canonical([1,2],{maxNodes:2}),'E_CANONICAL_LIMIT'));
test('canonical enforces UTF-8 output bytes',()=>code(()=>canonical('🎮',{maxBytes:3}),'E_CANONICAL_LIMIT'));
test('canonical validates limit integers',()=>code(()=>canonical(1,{maxDepth:1.5}),'E_CANONICAL_LIMIT'));

test('cartridge document is deeply frozen',()=>assert.ok(Object.isFrozen(cart.document.nested)));
test('rules metadata is deeply frozen',()=>assert.ok(Object.isFrozen(cart.ruleset.metadata.nested)));
test('cartridge exposes rules digest and version',()=>{assert.match(cart.rulesDigest,/^[a-f0-9]{64}$/);assert.equal(cart.rulesVersion,'1')});
test('rules metadata changes identity',()=>{const g=defineGame({...game,metadata:{nested:{x:2}}});assert.notEqual(compileCartridge(g,{nested:{value:1}}).identity,cart.identity)});
test('source document mutation does not affect cartridge',()=>{const d={x:{y:1}},c=compileCartridge(game,d);d.x.y=2;assert.equal(c.document.x.y,1)});
test('observer context has no RNG in actions',()=>{const g=defineGame({...game,id:'no-rng-actions',actions:(s,c)=>{assert.equal('rng' in c,false);return[]}});availability(createRun(compileCartridge(g))) });
test('observer context has no RNG in project',()=>{const g=defineGame({...game,id:'no-rng-project',project:(s,c)=>{assert.equal('rng' in c,false);return s}});project(createRun(compileCartridge(g))) });
test('observer context has no RNG in solver goal',()=>{solve(cart,{isGoal:(s,c)=>{assert.equal('rng' in c,false);return true}})});
test('failed transition rolls RNG back',()=>{let fail=true;const g=defineGame({id:'tx',version:'1',initialState:()=>({n:0}),actions:()=>[{x:1}],transition:(s,a,c)=>{const x=c.rng.next();if(fail){fail=false;throw Error('boom')}return {n:x}}});const c=compileCartridge(g),r=createRun(c);assert.throws(()=>dispatch(r,{x:1}),/boom/);const e=dispatch(r,{x:1}),fresh=createRun(c);fail=false;dispatch(fresh,{x:1});assert.equal(e.after,fresh.journal[0].after)});
test('illegal action cannot consume RNG',()=>{const r=createRun(cart);assert.throws(()=>dispatch(r,{bad:1}));assert.equal(r.turn,0)});
test('run facade is frozen',()=>assert.ok(Object.isFrozen(createRun(cart))));
test('state getter cannot mutate committed state',()=>{const r=createRun(cart),s=r.state;s.n=99;assert.equal(r.state.n,0)});
test('journal getter cannot mutate committed journal',()=>{const r=createRun(cart);dispatch(r,{t:'go'});assert.ok(Object.isFrozen(r.journal));assert.ok(Object.isFrozen(r.journal[0]));assert.throws(()=>{r.journal[0].action.t='x'},TypeError)});
test('replay output has no state alias',()=>{const r=createRun(cart);dispatch(r,{t:'go'});const p=createReplay(r);p.actions[0].t='x';assert.equal(r.journal[0].action.t,'go')});
test('adapter receives metadata, not run',()=>{const r=createRun(cart);project(r,(v,info)=>{assert.equal(info.state,undefined);assert.equal(info.journal,undefined);assert.equal(info.turn,0);assert.ok(Object.isFrozen(info))})});
test('projection is deeply frozen',()=>{const v=project(createRun(cart));assert.ok(Object.isFrozen(v))});
test('project rejects cyclic output',()=>{const g=defineGame({...game,id:'cycle-project',project:()=>{const x={};x.x=x;return x}});code(()=>project(createRun(compileCartridge(g))),'E_CANONICAL_REFERENCE')});
test('project does not invoke output getter',()=>{let called=0;const g=defineGame({...game,id:'getter-project',project:()=>{const x={};Object.defineProperty(x,'v',{enumerable:true,get(){called++;return 1}});return x}});code(()=>project(createRun(compileCartridge(g))),'E_CANONICAL_PROPERTY');assert.equal(called,0)});
test('renderer exception leaves state unchanged',()=>{const r=createRun(cart),before=digest(r.state);assert.throws(()=>project(r,()=>{throw Error('render')}));assert.equal(digest(r.state),before)});

const valid=()=>{const r=createRun(cart);dispatch(r,{t:'go'});return createReplay(r)};
for(const [name,mutate,want] of [
 ['extra replay field',p=>p.extra=1,'E_REPLAY_FIELDS'],['missing actions',p=>delete p.actions,'E_REPLAY_FIELDS'],['bad replay format',p=>p.format='x','E_REPLAY_FORMAT'],['bad cartridge digest',p=>p.cartridge='x','E_REPLAY_DIGEST'],['bad initial digest',p=>p.initial='x','E_REPLAY_DIGEST'],['bad final digest',p=>p.final='x','E_REPLAY_DIGEST'],['actions not array',p=>p.actions={},'E_REPLAY_ARRAY'],['checkpoints not array',p=>p.checkpoints={},'E_REPLAY_ARRAY'],['checkpoint count mismatch',p=>p.checkpoints=[],'E_REPLAY_CHECKPOINTS'],['malformed checkpoint',p=>p.checkpoints[0]='x','E_REPLAY_DIGEST'],['invalid object seed',p=>p.seed={x:1},'E_REPLAY_SEED']
])test(`replay rejects ${name} with stable code`,()=>{const p=valid();mutate(p);assert.equal(verifyReplay(cart,p).error.code,want)});
test('replay enforces action maximum',()=>assert.equal(verifyReplay(cart,valid(),{maxActions:0}).error.code,'E_REPLAY_LIMIT'));
test('replay validates every checkpoint',()=>{const p=valid();p.checkpoints[0]='0'.repeat(64);assert.equal(verifyReplay(cart,p).error.code,'E_CHECKPOINT')});
test('createReplay returns exact fields',()=>assert.deepEqual(Object.keys(createReplay(createRun(cart))).sort(),['actions','cartridge','checkpoints','final','format','initial','seed']));

test('solver rejects fractional depth',()=>code(()=>solve(cart,{maxDepth:1.5}),'E_SOLVE_LIMIT'));
test('solver rejects negative nodes',()=>code(()=>solve(cart,{maxNodes:-1}),'E_SOLVE_LIMIT'));
test('solver rejects depth above ceiling',()=>code(()=>solve(cart,{maxDepth:1001}),'E_SOLVE_LIMIT'));
test('solver rejects generated above ceiling',()=>code(()=>solve(cart,{maxGenerated:5000001}),'E_SOLVE_LIMIT'));
test('solver reports bounded at depth cap',()=>assert.equal(solve(cart,{maxDepth:0,isGoal:()=>false}).status,'bounded'));
test('solver reports unsolved on exhausted graph',()=>{const g=defineGame({...game,id:'dead',actions:()=>[],isGoal:()=>false});assert.equal(solve(compileCartridge(g)).status,'unsolved')});
test('solver enforces action fanout while generating',()=>assert.equal(solve(cart,{maxActions:0,isGoal:()=>false}).status,'bounded'));
test('solver enforces generated cap',()=>assert.equal(solve(cart,{maxGenerated:0,isGoal:()=>false}).status,'bounded'));
test('solver result includes generated count',()=>assert.equal(typeof solve(cart).generated,'number'));

function fakeStorage(){const m=new Map();return {m,get length(){return m.size},key:i=>[...m.keys()][i]??null,getItem:k=>m.has(k)?m.get(k):null,setItem:(k,v)=>m.set(k,String(v)),removeItem:k=>m.delete(k)}}
test('memory validates put keys',async()=>await assert.rejects(createMemoryRepository().put('',1),e=>e.code==='E_KEY'));
test('memory validates get keys',async()=>await assert.rejects(createMemoryRepository().get(''),e=>e.code==='E_KEY'));
test('storage validates namespace',()=>code(()=>createStorageRepository(fakeStorage(),{namespace:''}),'E_KEY'));
test('storage validates keys',async()=>await assert.rejects(createStorageRepository(fakeStorage()).put('',1),e=>e.code==='E_KEY'));
test('storage delete parity returns false for absent',async()=>assert.equal(await createStorageRepository(fakeStorage()).delete('x'),false));
test('storage size parity',async()=>{const r=createStorageRepository(fakeStorage());await r.put('a',1);assert.equal(r.size,1)});
test('storage malformed data has stable code',async()=>{const s=fakeStorage();s.m.set('ludotape:x','{');await assert.rejects(createStorageRepository(s).get('x'),e=>e.code==='E_STORAGE_DATA')});
test('storage clear leaves foreign namespaces',async()=>{const s=fakeStorage();s.m.set('other:x','1');const r=createStorageRepository(s);await r.put('x',1);await r.clear();assert.equal(s.m.get('other:x'),'1')});
