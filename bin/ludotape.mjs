#!/usr/bin/env node
import {readFile,stat,realpath} from 'node:fs/promises';
import {createServer} from 'node:http';
import {extname,resolve,dirname,join,sep} from 'node:path';
import {pathToFileURL,fileURLToPath} from 'node:url';
import {createRun,availability,verifyReplay,solve,digest,LudotapeError} from '../src/index.mjs';
import {checkCartridge,runScenarios} from '../src/authoring.mjs';
const MAX_REPLAY_FILE=2*1024*1024;
const [command,...args]=process.argv.slice(2);
const fail=(m,code=1)=>{console.error(m);process.exitCode=code};
const required=(v,name)=>{if(!v)throw new LudotapeError('E_CLI_ARGUMENT',`${name} is required`);return v};
const integer=(v,fallback,min,max,name)=>{if(v===undefined)return fallback;if(typeof v!=='string'||!/^[-]?\d+$/.test(v))throw new LudotapeError('E_CLI_ARGUMENT',`${name} must be an integer from ${min} to ${max}`);const n=Number(v);if(!Number.isSafeInteger(n)||n<min||n>max)throw new LudotapeError('E_CLI_ARGUMENT',`${name} must be an integer from ${min} to ${max}`);return n};
async function loadCartridge(path){
  required(path,'cartridge path');
  const mod=await import(pathToFileURL(resolve(path)));
  const cartridge=mod.default??mod.cartridge;
  if(cartridge===undefined)throw new LudotapeError('E_CLI_CARTRIDGE_EXPORT','cartridge module must export default or named cartridge');
  return cartridge;
}
async function loadScenarios(path){
  required(path,'scenarios path');
  const mod=await import(pathToFileURL(resolve(path)));
  const scenarios=mod.default??mod.scenarios;
  if(scenarios===undefined)throw new LudotapeError('E_CLI_SCENARIOS_EXPORT','scenario module must export default or named scenarios');
  return scenarios;
}
const headers=Object.freeze({'x-content-type-options':'nosniff','x-frame-options':'DENY','referrer-policy':'no-referrer','content-security-policy':"default-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'",'cross-origin-resource-policy':'same-origin'});
export async function createStaticServer({port=8080,host='127.0.0.1'}={}){
  integer(String(port),8080,0,65535,'port');if(typeof host!=='string'||!host)throw new LudotapeError('E_CLI_ARGUMENT','host is required');
  const packageRoot=dirname(dirname(fileURLToPath(import.meta.url))),root=await realpath(join(packageRoot,'dist'));
  const server=createServer(async(req,res)=>{for(const [k,v] of Object.entries(headers))res.setHeader(k,v);try{
    if(req.method!=='GET'&&req.method!=='HEAD'){res.statusCode=405;res.setHeader('allow','GET, HEAD');res.end('Method not allowed');return}
    let pathname;try{pathname=decodeURIComponent(new URL(req.url,'http://local').pathname)}catch{throw Object.assign(new Error('bad URL'),{status:400})}
    const segments=pathname.split('/').filter(Boolean);if(segments.some(s=>s.startsWith('.')||s==='..'||s.includes('\0')))throw Object.assign(new Error('forbidden'),{status:404});
    let candidate=resolve(root,'.'+pathname);if(candidate!==root&&!candidate.startsWith(root+sep))throw Object.assign(new Error('forbidden'),{status:404});
    let s=await stat(candidate);if(s.isDirectory()){candidate=join(candidate,'index.html');s=await stat(candidate)}
    if(!s.isFile())throw new Error('not file');const actual=await realpath(candidate);if(actual!==root&&!actual.startsWith(root+sep))throw Object.assign(new Error('symlink escape'),{status:404});
    const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.mjs':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json; charset=utf-8'};
    res.statusCode=200;res.setHeader('content-type',types[extname(actual)]??'application/octet-stream');res.setHeader('content-length',String(s.size));res.setHeader('cache-control','no-store');
    if(req.method==='HEAD'){res.end();return}res.end(await readFile(actual));
  }catch(error){res.statusCode=error.status??404;res.setHeader('content-type','text/plain; charset=utf-8');res.end(res.statusCode===400?'Bad request':'Not found')}});
  await new Promise((ok,no)=>{server.once('error',no);server.listen(port,host,ok)});return server;
}
try{
 if(command==='validate'){if(args.length<1||args.length>2)throw new LudotapeError('E_CLI_ARGUMENT','validate expects cartridge and optional seed');const c=await loadCartridge(args[0]),seed=integer(args[1],0,-2147483648,2147483647,'seed'),r=createRun(c,{seed});console.log(JSON.stringify({ok:true,identity:c.identity,initial:digest(r.state),actions:availability(r).length},null,2))}
 else if(command==='check'){if(args.length<1||args.length>4)throw new LudotapeError('E_CLI_ARGUMENT','check expects cartridge and optional seed/depth/paths');const c=await loadCartridge(args[0]),result=checkCartridge(c,{seeds:[integer(args[1],0,-2147483648,2147483647,'seed')],maxDepth:integer(args[2],2,0,100,'depth'),maxPaths:integer(args[3],100,0,100000,'paths')});console.log(JSON.stringify(result,null,2));if(result.errors>0)process.exitCode=1}
 else if(command==='test'){if(args.length!==2)throw new LudotapeError('E_CLI_ARGUMENT','test expects cartridge and scenarios paths');const c=await loadCartridge(args[0]),scenarios=await loadScenarios(args[1]),result=runScenarios(c,scenarios);console.log(JSON.stringify(result,null,2));if(!result.ok)process.exitCode=1}
 else if(command==='verify'){if(args.length!==2)throw new LudotapeError('E_CLI_ARGUMENT','verify expects cartridge and replay paths');const c=await loadCartridge(args[0]),path=required(args[1],'replay path'),info=await stat(path);if(!info.isFile()||info.size>MAX_REPLAY_FILE)throw new LudotapeError('E_REPLAY_LIMIT',`replay file must not exceed ${MAX_REPLAY_FILE} bytes`);const rp=JSON.parse(await readFile(path,'utf8')),result=verifyReplay(c,rp,{maxBytes:MAX_REPLAY_FILE});console.log(JSON.stringify({...result,run:undefined},null,2));if(!result.ok)process.exitCode=1}
 else if(command==='solve'){if(args.length<1||args.length>4)throw new LudotapeError('E_CLI_ARGUMENT','solve expects cartridge and optional seed/depth/nodes');const c=await loadCartridge(args[0]),result=solve(c,{seed:integer(args[1],0,-2147483648,2147483647,'seed'),maxDepth:integer(args[2],20,0,1000,'depth'),maxNodes:integer(args[3],10000,0,1000000,'nodes')});console.log(JSON.stringify(result,null,2));if(result.status!=='solved')process.exitCode=2}
 else if(command==='benchmark'){if(args.length)throw new LudotapeError('E_CLI_ARGUMENT','benchmark takes no arguments');await import('../bench/benchmark.mjs')}
 else if(command==='serve'){if(args.length>2)throw new LudotapeError('E_CLI_ARGUMENT','serve expects optional port and host');const port=integer(args[0],8080,0,65535,'port'),host=args[1]??'127.0.0.1',server=await createStaticServer({port,host}),address=server.address();console.log(`Ludotape Studio (local development only): http://${host}:${address.port}`)}
 else if(command==='core'){
   const [sub,...rest]=args;
   const {loadCoreFromManifest,validateCoreShape,discoverCores,defaultRegistry}=await import('../src/core-loader.mjs');
   if(sub==='list'){
     if(rest.length)throw new LudotapeError('E_CLI_ARGUMENT','core list takes no arguments');
     const packageRoot=dirname(dirname(fileURLToPath(import.meta.url)));
     const discovered=await discoverCores([join(packageRoot,'src','cores'),join(packageRoot,'examples','cores')]);
     console.log(JSON.stringify({registered:defaultRegistry.list(),discovered:{cores:discovered.cores.map(c=>c.metadata),diagnostics:discovered.diagnostics}},null,2));
   } else if(sub==='validate'){
     if(rest.length!==1)throw new LudotapeError('E_CLI_ARGUMENT','core validate expects a single core directory');
     const manifestPath=join(required(rest[0],'core directory'),'core.manifest.json');
     try{
       const core=await loadCoreFromManifest(manifestPath);
       const shape=validateCoreShape(core);
       console.log(JSON.stringify({ok:shape.ok,metadata:core.metadata,diagnostics:shape.diagnostics},null,2));
       if(!shape.ok)process.exitCode=1;
     }catch(error){
       console.log(JSON.stringify({ok:false,error:{code:error.code??'E_UNKNOWN',message:error.message}},null,2));
       process.exitCode=1;
     }
   } else if(sub==='conformance'){
     if(rest.length<2||rest.length>3)throw new LudotapeError('E_CLI_ARGUMENT','core conformance expects <coreDir> <cartridge.mjs> [seed]; a cartridge module path is required');
     const {runCoreConformance}=await import('../test/core-conformance.mjs');
     const manifestPath=join(required(rest[0],'core directory'),'core.manifest.json');
     const core=await loadCoreFromManifest(manifestPath);
     const cartridgeSource=await loadCartridge(rest[1]);
     const seed=integer(rest[2],0,-2147483648,2147483647,'seed');
     const report=await runCoreConformance(core,{cartridgeSource,seed});
     console.log(JSON.stringify(report,null,2));
     if(!report.ok)process.exitCode=1;
   } else fail('Usage: ludotape core <list | validate <coreDir> | conformance <coreDir> <cartridge.mjs> [seed]>')
 }
 else fail('Usage: ludotape <validate cartridge.mjs [seed] | check cartridge.mjs [seed [depth [paths]]] | test cartridge.mjs scenarios.mjs | verify cartridge.mjs replay.json | solve cartridge.mjs [seed depth nodes] | benchmark | serve [port [host]] | core <list | validate coreDir | conformance coreDir cartridge.mjs [seed]>>')
}catch(e){fail(`${e.code??e.name}: ${e.message}`)}
