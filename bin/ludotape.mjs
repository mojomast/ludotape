#!/usr/bin/env node
import {readFile,stat} from 'node:fs/promises';import {createServer} from 'node:http';import {extname,resolve,dirname,join} from 'node:path';import {pathToFileURL,fileURLToPath} from 'node:url';import {createRun,availability,dispatch,createReplay,verifyReplay,solve,digest} from '../src/index.mjs';
const [command,...args]=process.argv.slice(2);const fail=m=>{console.error(m);process.exitCode=1};
async function load(path){const mod=await import(pathToFileURL(resolve(path)));return mod.default??mod.cartridge}
try{
 if(command==='validate'){const c=await load(args[0]);const r=createRun(c,{seed:Number(args[1]??0)});console.log(JSON.stringify({ok:true,identity:c.identity,initial:digest(r.state),actions:availability(r).length},null,2))}
 else if(command==='verify'){const c=await load(args[0]),rp=JSON.parse(await readFile(args[1],'utf8'));const result=verifyReplay(c,rp);console.log(JSON.stringify({...result,run:undefined},null,2));if(!result.ok)process.exitCode=1}
 else if(command==='solve'){const c=await load(args[0]);const result=solve(c,{seed:Number(args[1]??0),maxDepth:Number(args[2]??20),maxNodes:Number(args[3]??10000)});console.log(JSON.stringify(result,null,2));if(result.status!=='solved')process.exitCode=2}
 else if(command==='benchmark'){await import('../bench/benchmark.mjs')}
 else if(command==='serve'){const root=resolve(args[0]??join(dirname(fileURLToPath(import.meta.url)),'..')),port=Number(args[1]??8080),types={'.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.json':'application/json'};createServer(async(req,res)=>{try{const pathname=decodeURIComponent(new URL(req.url,'http://x').pathname),file=resolve(root,'.'+(pathname==='/'?'/index.html':pathname));if(!file.startsWith(root))throw Error('forbidden');const s=await stat(file);if(!s.isFile())throw Error('not file');res.setHeader('content-type',types[extname(file)]??'application/octet-stream');res.end(await readFile(file))}catch{res.statusCode=404;res.end('Not found')}}).listen(port,()=>console.log(`Ludotape Studio: http://localhost:${port}`))}
 else fail('Usage: ludotape <validate cartridge.mjs [seed] | verify cartridge.mjs replay.json | solve cartridge.mjs [seed depth nodes] | benchmark | serve [directory port]>');
}catch(e){fail(`${e.code??e.name}: ${e.message}`)}
