'use strict';
const ReaderDevice=(()=>{
 const trusted='3da2217adebbf7e858160bf1e6eec2edc04eec8d804ec1262d95e250d816b27a';
 const encoder=new TextEncoder();
 const b64=b=>btoa(String.fromCharCode(...new Uint8Array(b))).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
 const hex=b=>Array.from(new Uint8Array(b),v=>v.toString(16).padStart(2,'0')).join('');
 async function store(mode,fn){const db=await new Promise((res,rej)=>{const r=indexedDB.open('pulse-owner-browser',1);r.onupgradeneeded=()=>r.result.createObjectStore('profile');r.onsuccess=()=>res(r.result);r.onerror=()=>rej(r.error)});try{return await new Promise((res,rej)=>{const tx=db.transaction('profile',mode),r=fn(tx.objectStore('profile'));tx.oncomplete=()=>res(r.result);tx.onerror=()=>rej(tx.error);tx.onabort=()=>rej(tx.error)})}finally{db.close()}}
 async function post(origin,path,d){const r=await fetch(origin+'/v1/'+path,{method:'POST',redirect:'error',credentials:'omit',headers:{'Content-Type':'application/json'},body:JSON.stringify(d),signal:AbortSignal.timeout(26000)});let v;try{v=await r.json()}catch{}if(!r.ok){let e=Error(v?.error||'Сервис не принял запрос.');e.status=r.status;throw e}return v}
 async function identity(endpoint){
  if(typeof endpoint!=='string'||hex(await crypto.subtle.digest('SHA-256',encoder.encode(endpoint)))!==trusted)throw Error('Неизвестный сервер подключения.');
  const previous=await store('readonly',s=>s.get('active'));if(previous)return previous;
  const keys=await crypto.subtle.generateKey({name:'ECDSA',namedCurve:'P-256'},false,['sign','verify']);
  const pub=await crypto.subtle.exportKey('raw',keys.publicKey);
  const profile={keys,origin:endpoint,id:hex(await crypto.subtle.digest('SHA-256',pub)),linked:false};
  await store('readwrite',s=>s.put(profile,'active'));return profile;
 }
 async function publicCode(endpoint){const p=await identity(endpoint);return b64(await crypto.subtle.exportKey('raw',p.keys.publicKey))}
 async function pair(d){
  if(!d||!/^[-_a-zA-Z0-9]{43}$/.test(d.invite))throw Error('Неизвестный файл подключения.');
  const profile=await identity(d.endpoint);if(profile.linked)return true;
  const pub=await crypto.subtle.exportKey('raw',profile.keys.publicKey);
  const v=await post(profile.origin,'pair',{pub:b64(pub),invite:d.invite});
  if(v.key!==profile.id)throw Error('Не удалось подтвердить привязку.');
  profile.linked=true;await store('readwrite',s=>s.put(profile,'active'));return true;
 }
 async function start(j){
  const p=await store('readonly',s=>s.get('active'));if(!p?.keys){let e=Error('Этот браузер ещё не подключён.');e.setup=true;throw e}
  const ts=Math.floor(Date.now()/1000),msg=['pulse-reader-v1',j.id,j.topic,ts].join('\n');
  const signature=b64(await crypto.subtle.sign({name:'ECDSA',hash:'SHA-256'},p.keys.privateKey,encoder.encode(msg)));
  return post(p.origin,'start',{id:j.id,topic:j.topic,key:p.id,ts,signature});
 }
 return {pair,start,publicCode};
})();