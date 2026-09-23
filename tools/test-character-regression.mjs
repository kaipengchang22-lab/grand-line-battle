import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import * as THREE from 'three';
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js';
import { clone as cloneSkeleton } from 'three/examples/jsm/utils/SkeletonUtils.js';

// CPU regression only: does not assert visual quality, GPU memory, or Android FPS.
globalThis.document={createElementNS:()=>({addEventListener(){},removeEventListener(){},set src(value){}})};
const source=readFileSync(new URL('../game.js',import.meta.url),'utf8');
function fn(name){
  const start=source.indexOf(`function ${name}(`);
  assert.ok(start>=0,name);
  let end=source.indexOf('\nfunction ',start+1);
  if(name==='updateFirstPersonArms')end=source.indexOf('\nbuildArms();',start+1);
  return source.slice(start,end<0?source.length:end);
}
const state={time:0,effects:[],hazards:[],enemies:[],player:{pos:new THREE.Vector3(0,1.7,10)},yaw:0,mode:'first'};
const scene=new THREE.Scene();
const arms=new THREE.Group();arms.userData.fallback=new THREE.Group();arms.add(arms.userData.fallback);
let hits=0;
const context=vm.createContext({THREE,FBXLoader,cloneSkeleton,arms,console,state,scene,WORLD_EFFECT_LIMIT:90,
  PLAYER_3D_ASSET:{orientation:0},SKY_CLEAR:new THREE.Color(0x9fd5e4),SKY_STORM:new THREE.Color(0x526779),
  C:{red:0xff3333,orange:0xff9933},
  clamp:(v,a,b)=>Math.max(a,Math.min(b,v)),dist2D:(a,b)=>Math.hypot(a.x-b.x,a.z-b.z),
  seeded:n=>((Math.sin(n*999.41)*43758.5453)%1+1)%1,
  toon:color=>new THREE.MeshBasicMaterial({color}),standard:color=>new THREE.MeshStandardMaterial({color}),
  add:(parent,geo,mat,x=0,y=0,z=0,rx=0,ry=0,rz=0)=>{const m=new THREE.Mesh(geo,mat);m.position.set(x,y,z);m.rotation.set(rx,ry,rz);parent.add(m);return m;},
  world:new THREE.Group(),hurtPlayer:()=>hits++,spawnEnemy:()=>{},toast:()=>{}});
vm.runInContext(source.slice(source.indexOf('const TROOP_BONE_ALIASES='),source.indexOf('function setupTroopRig(')),context);
for(const name of ['parseCharacterFBX','characterBoneAxes','bindBonePose','turnBone','normalizeCharacterSkeleton',
  'setupFilmRedProceduralRig','playPlayer3DAction','updatePlayer3D','setupTroopRig','updateTroopRig',
  'rotateTroopToward','disposeWorldEffect','pushWorldEffect','addWorldEffect','spawnSkillCharge','spawnAttackFlare',
  'dtSafe','spawnEnergyColumn','spawnImpactBurst','pulse','spawnCircleHazard','spawnLineHazard',
  'updateHazards','updateEffects','updateBoss','makeRainField','makeCloudBank','makeGullFlock',
  'makeVegetation','makeCannon','updateEnvironment','installFirstPersonRig','updateFirstPersonArms'])vm.runInContext(fn(name),context);

for(const file of ['film-red-luffy/luffy022_body_model.fbx','troops/toy-a/02_wanou_01.fbx','troops/toy-b/02_wanou_02.fbx','troops/toy-c/02_wanou_03.fbx','troops/garp/12002.fbx','troops/fake-nami/falsenami001_body.fbx','troops/fake-luffy/falseluffy001_body.fbx','troops/fake-sniper/falseusopp001_body.fbx','troops/akainu/12110_U.fbx']){
  const bytes=readFileSync(new URL('../assets/models/'+file,import.meta.url));
  const model=context.parseCharacterFBX(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'./');
  model.rotation.order='YXZ';model.rotation.x=-Math.PI/2;model.rotation.y=0;
  model.updateMatrixWorld(true);
  if(file.startsWith('film-red')||file.includes('akainu')){
    const up=model.getObjectByName('Bip001_Head').getWorldPosition(new THREE.Vector3())
      .sub(model.getObjectByName('Bip001_Pelvis').getWorldPosition(new THREE.Vector3()));
    assert.ok(up.y>Math.abs(up.z)*3,'aligned skeleton must stand upright with the visible mesh');
  }
  const bindBounds=new THREE.Box3().setFromObject(model),bindSize=bindBounds.getSize(new THREE.Vector3());
  model.traverse(node=>{if(node.isMesh){assert.equal(node.geometry.getAttribute('color'),undefined);}});
  if(file.startsWith('film-red')){
    const root=new THREE.Group();root.add(model);model.userData.groundY=0;
    root.userData.model3d={enabled:true,model,actions:{},mixer:new THREE.AnimationMixer(model),procedural:true,proceduralBones:context.setupFilmRedProceduralRig(model)};
    context.installFirstPersonRig(model);
    assert.ok(arms.userData.mirrorPairs?.length>100,'first-person rig must mirror real skeleton');
    const visibleMeshes=[];arms.userData.filmRedModel.traverse(n=>{if(n.isMesh&&n.visible)visibleMeshes.push(n);});
    assert.ok(visibleMeshes.some(n=>n.isSkinnedMesh),'first-person arms should be skinned 3D meshes');
    assert.ok(visibleMeshes.every(n=>n.isSkinnedMesh),'first-person view must not use flat sprite overlays');
    for(const castKind of ['basic','combo','axe','rocket','giant','haki']){
      for(let i=0;i<60;i++){state.time+=1/60;context.updatePlayer3D(root,1/60,true,{hurtAnim:0,attackAnim:1-i/60,castTime:0,castKind});context.updateFirstPersonArms({castKind},true);}
    }
    const largestPoseGap=Math.max(...arms.userData.mirrorPairs.flatMap(([a,b])=>a.quaternion.toArray().map((v,j)=>Math.abs(v-b.quaternion.toArray()[j]))));
    assert.ok(largestPoseGap<1e-6,`mirrored bone rotations should match: ${largestPoseGap}`);
  }else{
    context.setupTroopRig(model,'test');
    for(let i=0;i<360;i++){state.time+=1/60;context.updateTroopRig(model,1/60,true,(i%60)/60,'bossCircle',0);}
  }
  model.traverse(node=>{assert.ok(node.quaternion.toArray().every(Number.isFinite));assert.ok(Math.abs(node.quaternion.length()-1)<1e-5);});
  if(file.startsWith('film-red')||file.includes('akainu')){
    model.updateMatrixWorld(true);
    const posedSize=new THREE.Box3().setFromObject(model).getSize(new THREE.Vector3());
    assert.ok(posedSize.length()<bindSize.length()*1.65,`skinned actor expands beyond bound body: ${file}`);
  }
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

const plants=context.makeVegetation(),clouds=context.makeCloudBank(),gulls=context.makeGullFlock(),rain=context.makeRainField(190);
assert.equal(plants.length,4);assert.ok(plants.every(mesh=>mesh.isInstancedMesh));assert.equal(clouds.count,24);assert.equal(gulls.length,5);
const trunkMatrix=new THREE.Matrix4(),canopyMatrix=new THREE.Matrix4(),trunkScale=new THREE.Vector3(),canopyScale=new THREE.Vector3();
for(let i=0;i<38;i++){
  plants[0].getMatrixAt(i,trunkMatrix);plants[1].getMatrixAt(i*2,canopyMatrix);
  trunkMatrix.decompose(new THREE.Vector3(),new THREE.Quaternion(),trunkScale);
  canopyMatrix.decompose(new THREE.Vector3(),new THREE.Quaternion(),canopyScale);
  assert.ok(canopyScale.x>trunkScale.y*.8,'tree canopy should scale with trunk height');
}
for(const side of [-1,1]){
  const cannon=context.makeCannon(side*36,0,side),forward=new THREE.Vector3(0,0,1).applyQuaternion(cannon.quaternion);
  assert.ok(forward.x*side<-.99);assert.ok(cannon.children.some(node=>node.isGroup));
}
const lights={hemi:new THREE.HemisphereLight(0xffffff,0x333333,2),sun:new THREE.DirectionalLight(0xffffff,3),rim:new THREE.DirectionalLight(0xffffff,1),fortressLamp:{intensity:1}};
const env={sea:new THREE.Mesh(new THREE.PlaneGeometry(180,210,8,8),new THREE.MeshStandardMaterial()),foam:[],shoreSpray:Array.from({length:112},(_,i)=>({age:i*.03,life:.8,pos:new THREE.Vector3(),vel:new THREE.Vector3(),edge:i%4})),
  sprayDummy:new THREE.Object3D(),surfMesh:new THREE.InstancedMesh(new THREE.IcosahedronGeometry(.095,1),new THREE.MeshStandardMaterial(),112),
  weatherDrops:rain,cloudMesh:clouds,gulls,...lights,weatherClock:0};
context.scene.background=new THREE.Color(0x9fd5e4);context.scene.fog=new THREE.Fog(0x9fd5e4,48,125);context.world.userData.environment=env;
let sawRain=false,sawClear=false;
for(let i=0;i<94*30;i++){
  state.time+=1/30;context.updateEnvironment(1/30);
  sawRain ||= rain.mesh.visible;sawClear ||= !rain.mesh.visible;
}
assert.ok(sawRain&&sawClear);assert.ok(Array.from(env.surfMesh.instanceMatrix.array).every(Number.isFinite));
assert.ok(env.sea.geometry.attributes.position.getZ(0)!==0,'ocean mesh should displace');
console.log('PASS weather cycle, rain, seagulls, and instanced vegetation');
