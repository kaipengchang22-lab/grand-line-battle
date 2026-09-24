import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import * as THREE from 'three';
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js';
import { clone as cloneSkeleton } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { Tree } from '../assets/trees/ez-tree/tree.js';
import { EZ_TREE_PRESETS } from '../assets/trees/ez-tree/presets.js';

// CPU regression only: does not assert visual quality, GPU memory, or Android FPS.
globalThis.document={createElementNS:()=>({addEventListener(){},removeEventListener(){},set src(value){}})};
const source=readFileSync(new URL('../game.js',import.meta.url),'utf8')+
  readFileSync(new URL('../game-core-2.js',import.meta.url),'utf8');
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
const coastalMap=new THREE.Texture();
const renderer={capabilities:{getMaxAnisotropy:()=>8}};
const context=vm.createContext({THREE,FBXLoader,cloneSkeleton,Tree,EZ_TREE_PRESETS,renderer,arms,console,state,scene,coastalMap,WORLD_EFFECT_LIMIT:90,
  PLAYER_3D_ASSET:{orientation:0},SKY_CLEAR:new THREE.Color(0x9fd5e4),SKY_STORM:new THREE.Color(0x526779),
  C:{red:0xff3333,orange:0xff9933},
  clamp:(v,a,b)=>Math.max(a,Math.min(b,v)),dist2D:(a,b)=>Math.hypot(a.x-b.x,a.z-b.z),
  seeded:n=>((Math.sin(n*999.41)*43758.5453)%1+1)%1,
  toon:color=>new THREE.MeshBasicMaterial({color}),standard:color=>new THREE.MeshStandardMaterial({color}),
  add:(parent,geo,mat,x=0,y=0,z=0,rx=0,ry=0,rz=0)=>{const m=new THREE.Mesh(geo,mat);m.position.set(x,y,z);m.rotation.set(rx,ry,rz);parent.add(m);return m;},
  world:new THREE.Group(),hurtPlayer:()=>hits++,spawnEnemy:()=>{},toast:()=>{}});
vm.runInContext(source.slice(source.indexOf('const TROOP_BONE_ALIASES='),source.indexOf('function setupTroopRig(')),context);
for(const name of ['parseCharacterFBX','characterBoneAxes','bindBonePose','turnBone',
  'setupFilmRedProceduralRig','playPlayer3DAction','updatePlayer3D','setupTroopRig','updateTroopRig',
  'rotateTroopToward','disposeWorldEffect','pushWorldEffect','addWorldEffect','spawnSkillCharge','flameSculpture','spawnAttackFlare',
  'dtSafe','spawnEnergyColumn','spawnImpactBurst','pulse','spawnCircleHazard','spawnLineHazard',
  'updateHazards','updateEffects','updateBoss','makeRainField','makeCloudBank','makeGullFlock',
  'makeVegetation','makeCannon','makeSurfPatch','updateEnvironment','installFirstPersonRig','updateFirstPersonArms'])vm.runInContext(fn(name),context);
vm.runInContext(source.slice(source.indexOf('const TROOP_3D_ASSETS='),source.indexOf('// Role-to-asset mapping')),context);
vm.runInContext(source.slice(source.indexOf('const COMPANION_ROLES='),source.indexOf('function createCompanion(')),context);
for(const name of ['createCompanion','hurtCompanion','castCompanionSkill','updateCompanions'])vm.runInContext(fn(name),context);

for(const file of ['film-red-luffy/luffy022_body_model.fbx','troops/toy-a/02_wanou_01.fbx','troops/toy-b/02_wanou_02.fbx','troops/toy-c/02_wanou_03.fbx','troops/garp/12002.fbx','troops/fake-nami/falsenami001_body.fbx','troops/fake-luffy/falseluffy001_body.fbx','troops/fake-sniper/falseusopp001_body.fbx','troops/akainu/12110_U.fbx']){
  const bytes=readFileSync(new URL('../assets/models/'+file,import.meta.url));
  const model=context.parseCharacterFBX(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'./');
  model.rotation.order='YXZ';model.rotation.x=-Math.PI/2;model.rotation.y=0;
  model.updateMatrixWorld(true);
  if(file.startsWith('film-red')){
    const accessory=model.getObjectByName('luffy022_arm02_d');
    const bounds=new THREE.Box3().setFromObject(accessory).getSize(new THREE.Vector3());
    assert.ok(bounds.x<1,'detached arm export must not grow into two giant spheres');
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
assert.equal(plants.length,6);assert.ok(plants.every(mesh=>mesh.isInstancedMesh));assert.equal(clouds.count,24);assert.equal(gulls.length,5);
assert.deepEqual([...new Set(plants.map(mesh=>mesh.userData.treeSpecies))].sort(),['ash','oak','pine']);
assert.equal(plants.reduce((sum,mesh)=>mesh.userData.part==='branches'?sum+mesh.count:sum,0),38,'all 38 trees must have branch instances');
for(const mesh of plants){
  assert.ok(mesh.geometry.getAttribute('position').count>6000,'tree must contain detailed 3D geometry');
  assert.ok(mesh.geometry.index.count>18000,'tree geometry must contain real branched surfaces');
  assert.ok(mesh.geometry.boundingSphere.radius>5,'tree dimensions must be measured in world space before scaling');
  assert.ok(mesh.material.isMeshStandardMaterial&&mesh.material.map,'trees must use textured PBR materials');
  assert.ok(mesh.material.map.colorSpace===THREE.SRGBColorSpace,'tree color textures must use sRGB');
  if(mesh.userData.part==='branches'){
    assert.ok(mesh.geometry.getAttribute('uv2'),'bark ambient occlusion requires secondary UVs');
    assert.ok(mesh.material.normalMap&&mesh.material.aoMap&&mesh.material.roughnessMap,'bark must use full PBR texture maps');
  }else{
    assert.ok(mesh.material.alphaTest>0,'leaf atlas must keep cutout edges');
    assert.ok(mesh.material.onBeforeCompile.toString().includes('uWindStrength'),'leaves need a wind sway shader');
  }
  for(let i=0;i<mesh.count;i++){
    const matrix=new THREE.Matrix4();mesh.getMatrixAt(i,matrix);
    assert.ok(matrix.elements.every(Number.isFinite),'tree instance transform must be finite');
  }
}
assert.equal(plants.windTrees.length,3,'wind animation updates each generated species');
for(const file of ['ash-leaves.webp','oak-leaves.webp','pine-leaves.webp','oak-bark.webp','pine-bark.webp']){
  assert.ok(readFileSync(new URL('../assets/trees/textures/'+file,import.meta.url)).byteLength<80000,
    'compressed tree textures must stay within the mobile asset budget: '+file);
}
for(const side of [-1,1]){
  const cannon=context.makeCannon(side*36,0,side),forward=new THREE.Vector3(0,0,1).applyQuaternion(cannon.quaternion);
  assert.ok(forward.x*side<-.99);assert.ok(cannon.children.some(node=>node.isGroup));
}
const lights={hemi:new THREE.HemisphereLight(0xffffff,0x333333,2),sun:new THREE.DirectionalLight(0xffffff,3),rim:new THREE.DirectionalLight(0xffffff,1),fortressLamp:{intensity:1}};
const env={sea:new THREE.Mesh(new THREE.PlaneGeometry(180,210,8,8),new THREE.MeshStandardMaterial({map:coastalMap})),foam:[],shoreSpray:Array.from({length:112},(_,i)=>({age:i*.03,life:.8,pos:new THREE.Vector3(),vel:new THREE.Vector3(),edge:i%4})),
  sprayDummy:new THREE.Object3D(),surfMesh:new THREE.InstancedMesh(new THREE.IcosahedronGeometry(.095,1),new THREE.MeshStandardMaterial(),112),
  weatherDrops:rain,cloudMesh:clouds,gulls,windTrees:plants.windTrees,...lights,weatherClock:0};
const frontSurf=context.makeSurfPatch(12),wallSurf=context.makeSurfPatch(16);
frontSurf.userData={edge:'open',side:1,phase:.2};wallSurf.userData={edge:'wall',side:-1,phase:.5};
env.shoreBreakers=[frontSurf,wallSurf];
assert.ok(frontSurf.material.isShaderMaterial&&frontSurf.material.fragmentShader.includes('scallop'));
assert.equal(frontSurf.material.uniforms.uWater.value,coastalMap,'surf must sample the real water texture');
assert.ok(readFileSync(new URL('../assets/textures/coastal-sea-v62.webp',import.meta.url)).byteLength<550000,'water texture should be mobile-sized');
assert.ok(!source.includes('new THREE.PlaneGeometry(78,1.25'),'solid white foam strips must be removed');
context.scene.background=new THREE.Color(0x9fd5e4);context.scene.fog=new THREE.Fog(0x9fd5e4,48,125);context.world.userData.environment=env;
let sawRain=false,sawClear=false;
const seaOffsetBefore=coastalMap.offset.clone();
for(let i=0;i<94*30;i++){
  state.time+=1/30;context.updateEnvironment(1/30);
  sawRain ||= rain.mesh.visible;sawClear ||= !rain.mesh.visible;
}
assert.ok(sawRain&&sawClear);assert.ok(Array.from(env.surfMesh.instanceMatrix.array).every(Number.isFinite));
assert.ok(coastalMap.offset.distanceTo(seaOffsetBefore)>.05,'the ocean texture must visibly flow during play');
assert.ok(env.sea.geometry.attributes.position.getZ(0)!==0,'ocean mesh should displace');
assert.ok(frontSurf.position.z>55&&frontSurf.position.z<62,'open surf washes onto the ice shelf');
assert.ok(wallSurf.position.x< -45.5&&wallSurf.position.x> -49,'walled surf remains outside the quay');
assert.ok(Number.isFinite(frontSurf.material.uniforms.uOpacity.value));
console.log('PASS weather cycle, rain, seagulls, and instanced vegetation');

state.companions=[];state.player.hp=100;state.player.maxHp=300;state.player.guardTimer=0;
const dummyEnemy={pos:new THREE.Vector3(0,0,12.5),hp:100000,dead:false,stun:0};state.enemies=[dummyEnemy];
context.damageEnemy=(e,amount)=>{e.hp-=amount;};context.spawnMuzzleFlash=()=>{};
const casts=Object.fromEntries(['allyJinbe','allySanji','allyChopper'].map(role=>[role,[0,0,0]]));
const realCast=context.castCompanionSkill;
context.castCompanionSkill=(c,slot,target)=>{casts[c.kind][slot]++;return realCast(c,slot,target);};
for(const [kind,file] of [['allyJinbe','jinbe/14007_U.fbx'],['allySanji','sanji/11023_C.fbx'],['allyChopper','chopper/11006_U.fbx']]){
  const bytes=readFileSync(new URL('../assets/models/allies/'+file,import.meta.url));
  const actor=context.parseCharacterFBX(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'./');
  let meshes=0,triangles=0;actor.traverse(n=>{if(n.isSkinnedMesh){meshes++;triangles+=n.geometry.getAttribute('position').count/3;}});
  assert.ok(meshes>=2&&triangles<30000,`${kind} needs an Android sized skinned model`);
  context.createCompanion(kind,actor);
}
assert.equal(state.companions.length,3);
for(let i=0;i<12*30;i++){
  state.time+=1/30;context.updateCompanions(1/30);context.updateEffects(1/30);
  assert.ok(state.effects.length<=90);
}
assert.equal(state.companions.length,0,'summons expire after 12 seconds');
assert.ok(Object.values(casts).every(skills=>skills.every(count=>count>0)),'every companion casts all three skills');
console.log('PASS three uploaded skinned allies, nine skills, and 12-second expiration',casts);
