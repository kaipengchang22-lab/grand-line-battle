import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import * as THREE from 'three';
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js';

// CPU regression only: does not assert visual quality, GPU memory, or Android FPS.
globalThis.document={createElementNS:()=>({addEventListener(){},removeEventListener(){},set src(value){}})};
const source=readFileSync(new URL('../game.js',import.meta.url),'utf8');
function fn(name){
  const start=source.indexOf(`function ${name}(`);
  assert.ok(start>=0,name);
  const end=source.indexOf('\nfunction ',start+1);
  return source.slice(start,end<0?source.length:end);
}
const state={time:0,effects:[],hazards:[],enemies:[],player:{pos:new THREE.Vector3(0,1.7,10)},yaw:0};
const scene=new THREE.Scene();
let hits=0;
const context=vm.createContext({THREE,FBXLoader,console,state,scene,WORLD_EFFECT_LIMIT:90,
  PLAYER_3D_ASSET:{orientation:0},C:{red:0xff3333,orange:0xff9933},
  clamp:(v,a,b)=>Math.max(a,Math.min(b,v)),dist2D:(a,b)=>Math.hypot(a.x-b.x,a.z-b.z),
  toon:color=>new THREE.MeshBasicMaterial({color}),hurtPlayer:()=>hits++,spawnEnemy:()=>{},toast:()=>{}});
vm.runInContext(source.slice(source.indexOf('const TROOP_BONE_ALIASES='),source.indexOf('function setupTroopRig(')),context);
for(const name of ['parseCharacterFBX','characterBoneAxes','bindBonePose','turnBone',
  'setupFilmRedProceduralRig','playPlayer3DAction','updatePlayer3D','setupTroopRig','updateTroopRig',
  'rotateTroopToward','disposeWorldEffect','pushWorldEffect','addWorldEffect','spawnSkillCharge',
  'dtSafe','spawnEnergyColumn','spawnImpactBurst','pulse','spawnCircleHazard','spawnLineHazard',
  'updateHazards','updateEffects','updateBoss'])vm.runInContext(fn(name),context);

for(const file of ['film-red-luffy/luffy022_body_model.fbx','troops/toy-a/02_wanou_01.fbx','troops/toy-b/02_wanou_02.fbx','troops/toy-c/02_wanou_03.fbx','troops/garp/12002.fbx','troops/fake-nami/falsenami001_body.fbx','troops/fake-luffy/falseluffy001_body.fbx','troops/fake-sniper/falseusopp001_body.fbx','troops/akainu/12110_U.fbx']){
  const bytes=readFileSync(new URL('../assets/models/'+file,import.meta.url));
  const model=context.parseCharacterFBX(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'./');
  model.rotation.order='YXZ';model.rotation.x=-Math.PI/2;model.rotation.y=0;
  model.updateMatrixWorld(true);
  model.traverse(node=>{if(node.isMesh){assert.equal(node.geometry.getAttribute('color'),undefined);}});
  if(file.startsWith('film-red')){
    const root=new THREE.Group();root.add(model);model.userData.groundY=0;
    root.userData.model3d={enabled:true,model,actions:{},mixer:new THREE.AnimationMixer(model),procedural:true,proceduralBones:context.setupFilmRedProceduralRig(model)};
    for(const castKind of ['basic','combo','axe','rocket','giant','haki']){
      for(let i=0;i<60;i++){state.time+=1/60;context.updatePlayer3D(root,1/60,true,{hurtAnim:0,attackAnim:1-i/60,castTime:0,castKind});}
    }
  }else{
    context.setupTroopRig(model,'test');
    for(let i=0;i<360;i++){state.time+=1/60;context.updateTroopRig(model,1/60,true,(i%60)/60,'bossCircle',0);}
  }
  model.traverse(node=>{assert.ok(node.quaternion.toArray().every(Number.isFinite));assert.ok(Math.abs(node.quaternion.length()-1)<1e-5);});
  console.log('PASS finite bind-relative poses:',file);
}
const root=new THREE.Group();
for(const heading of [0,Math.PI/2,Math.PI,-Math.PI/2]){
  context.rotateTroopToward(root,heading,1,1);
  const forward=new THREE.Vector3(0,0,1).applyQuaternion(root.quaternion);
  assert.ok(forward.dot(new THREE.Vector3(Math.sin(heading),0,Math.cos(heading)))>.999);
}
const boss={model:new THREE.Group(),pos:new THREE.Vector3(),hp:720,maxHp:720,speed:2.7,range:3.3,attackCd:0};
let peakEffects=0,peakHazards=0;
for(let i=0;i<3600;i++){
  state.time+=1/60;boss.attackCd-=1/60;
  if(i===1000)boss.hp=300;if(i===2000)boss.hp=100;
  context.updateBoss(boss,1/60);context.updateHazards(1/60);context.updateEffects(1/60);
  peakEffects=Math.max(peakEffects,state.effects.length);peakHazards=Math.max(peakHazards,state.hazards.length);
  assert.ok(state.effects.length<=90);
}
assert.ok(boss.phase2&&boss.ultimate);
console.log('PASS 60-second CPU boss simulation',{peakEffects,peakHazards,hits});
