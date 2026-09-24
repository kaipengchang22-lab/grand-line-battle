import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const source=readFileSync(new URL('../game.js',import.meta.url),'utf8')+
  readFileSync(new URL('../game-core-2.js',import.meta.url),'utf8');
const fn=name=>{
  const asyncStart=source.indexOf(`async function ${name}(`);
  const start=asyncStart>=0?asyncStart:source.indexOf(`function ${name}(`);
  assert.ok(start>=0,name);
  const end=source.indexOf('\nfunction ',start+1);
  return source.slice(start,end<0?source.length:end);
};

let attempts=0;
const cache=new Map();
const loader=vm.createContext({
  TROOP_3D_ASSETS:{allyJinbe:{url:'jinbe.fbx',label:'甚平',diffuse:'jinbe.png'}},
  troopModelPromises:cache,THREE:{FrontSide:0},troopTexture:()=>null,
  loadCharacterFBX:(_url,resolve,reject)=>{
    attempts++;
    if(attempts===1)reject(new Error('temporary network error'));
    else resolve({animations:[],traverse:visit=>visit({isMesh:true,isSkinnedMesh:true,material:{name:'body'}})});
  },
  console:{info(){}}
});
vm.runInContext(fn('loadTroopPrototype'),loader);
await assert.rejects(loader.loadTroopPrototype('allyJinbe'));
await Promise.resolve();
assert.equal(cache.size,0,'failed model request should leave the cache');
assert.ok(await loader.loadTroopPrototype('allyJinbe'));
assert.equal(attempts,2,'next summon should retry the download');

const player={stamina:80,cooldowns:{summon:0}};
const state={player,companions:[],summonToken:0,active:true};
const messages=[];
const summon=vm.createContext({
  state,COMPANION_ROLES:{allyJinbe:{name:'甚平'},allySanji:{name:'山治'},allyChopper:{name:'乔巴'}},
  C:{gold:0xffc74d},scene:{remove(){}},canCast:()=>true,
  startFirstPersonAction(){},spawnImpactBurst(){},toast:msg=>messages.push(msg),
  loadTroopPrototype:()=>Promise.reject(new Error('offline')),
  createCompanion(){throw new Error('unexpected companion');},console:{warn(){}}
});
vm.runInContext(fn('summonCompanions'),summon);
await summon.summonCompanions();
assert.equal(player.stamina,80,'failed summon refunds the spent stamina');
assert.equal(player.cooldowns.summon,0,'failed summon clears the cooldown');
assert.ok(messages.at(-1).includes('可重试'));
console.log('PASS transient model retry and failed summon refund');
