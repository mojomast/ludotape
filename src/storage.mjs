import {clone,LudotapeError} from './index.mjs';
const fail=(code,message)=>{throw new LudotapeError(code,message)};
function validKey(key, allowEmpty=false){if(typeof key!=='string'||(!allowEmpty&&!key)||key.length>1024||/[\0-\x1f\x7f]/.test(key))fail('E_KEY','key must be a non-empty, bounded string without control characters');return key}
function validNamespace(namespace){validKey(namespace);if(namespace.length>128)fail('E_NAMESPACE','namespace is too long');return namespace}
export function createMemoryRepository(){
  const data=new Map();return {
    async put(key,value){validKey(key);const next=clone(value);data.set(key,next);return key},
    async get(key){validKey(key);return data.has(key)?clone(data.get(key)):null},
    async delete(key){validKey(key);return data.delete(key)},
    async list(prefix=''){validKey(prefix,true);return [...data.keys()].filter(k=>k.startsWith(prefix)).sort()},
    async clear(){data.clear()},get size(){return data.size}
  }
}
/** Requires conforming synchronous Web Storage semantics: setItem/removeItem either complete or throw without changing that key. */
export function createStorageRepository(storage,{namespace='ludotape:'}={}){
  if(!storage||typeof storage.getItem!=='function'||typeof storage.setItem!=='function'||typeof storage.removeItem!=='function'||typeof storage.key!=='function')fail('E_STORAGE','Storage-compatible object required');validNamespace(namespace);
  const full=k=>namespace+validKey(k);
  return {
    async put(key,value){const k=full(key),serialized=JSON.stringify(clone(value));storage.setItem(k,serialized);return key},
    async get(key){const v=storage.getItem(full(key));if(v===null)return null;try{return clone(JSON.parse(v))}catch{fail('E_STORAGE_DATA','stored value is malformed')}},
    async delete(key){const k=full(key),existed=storage.getItem(k)!==null;storage.removeItem(k);return existed},
    async list(prefix=''){validKey(prefix,true);const out=[];for(let i=0;i<storage.length;i++){const k=storage.key(i);if(typeof k==='string'&&k.startsWith(namespace+prefix))out.push(k.slice(namespace.length))}return out.sort()},
    async clear(){const keys=await this.list(),backup=keys.map(k=>[k,storage.getItem(namespace+k)]);try{for(const [k] of backup)storage.removeItem(namespace+k)}catch(error){try{for(const [k,v] of backup)if(v!==null)storage.setItem(namespace+k,v)}catch{throw new LudotapeError('E_STORAGE_ROLLBACK','clear failed and rollback was incomplete',{cause:error})}throw error}},
    get size(){let n=0;for(let i=0;i<storage.length;i++)if(storage.key(i)?.startsWith(namespace))n++;return n}
  }
}
