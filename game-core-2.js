function spawnBoss(){
  const model=createMarineModel("captain",true);
  model.userData.fallbackMeshes=[];model.traverse(node=>{if(node.isMesh)model.userData.fallbackMeshes.push(node);});
  rigActor(model); model.visible=false; model.position.set(0,0,-48); scene.add(model);
  const e={id:state.nextId++,type:"boss",assetType:"boss",model,pos:model.position,hp:720,maxHp:720,speed:2.7,damage:30,
    range:3.3,attackCd:2,stun:0,dead:false,phase2:false,ultimate:false,bar:addHealthBar(model,3.2,7.65)};
  e.bar.visible=false;
  state.enemies.push(e); state.boss=e; ui.bossWrap.classList.remove("hidden");
  attachTroop3D(e);
  toast("海军本部大将·赤犬登场！",2200); audio.tone(72,.55,"sawtooth",.07);
}
function spawnAlly(){
  const model=createAllyModel();rigActor(model); model.position.set(0,0,-24); scene.add(model);
  state.ally={model,pos:model.position,hp:260,maxHp:260,attackCd:0};
  addHealthBar(model,3,6.4);
}
const COMPANION_ROLES={
  allyJinbe:{name:"甚平",hp:230,speed:5.2,range:2.8,color:0x4ba7ce,offset:-2.5,skillCds:[1.7,4.1,5.3]},
  allySanji:{name:"山治",hp:140,speed:10.3,range:2.5,color:0xf5b362,offset:0,skillCds:[.85,3.2,5.1]},
  allyChopper:{name:"乔巴",hp:120,speed:6.4,range:7,color:0x79dfaa,offset:2.5,skillCds:[2.1,3.8,4.8]}
};
function createCompanion(kind,prototype){
  const spec=COMPANION_ROLES[kind],model=new THREE.Group(),actor=cloneSkeleton(prototype);
  model.position.copy(state.player.pos);model.position.y=0;
  model.position.x=clamp(model.position.x+spec.offset,-36,36);model.position.z=clamp(model.position.z+2.4,-57,53);
  actor.rotation.order="YXZ";actor.rotation.x=-Math.PI/2;actor.rotation.y=0;
  actor.updateMatrixWorld(true);
  let box=new THREE.Box3().setFromObject(actor),height=box.getSize(new THREE.Vector3()).y;
  if(!Number.isFinite(height)||height<.1)throw new Error(`${spec.name}模型尺寸异常`);
  actor.scale.setScalar(TROOP_3D_ASSETS[kind].height/height);
  actor.updateMatrixWorld(true);box=new THREE.Box3().setFromObject(actor);
  actor.position.y-=box.min.y;
  model.add(actor);setupTroopRig(actor,kind);
  const mark=add(model,new THREE.TorusGeometry(.67,.07,6,28),new THREE.MeshBasicMaterial({color:spec.color,transparent:true,opacity:.72,depthWrite:false}),0,.09,0,-Math.PI/2);
  mark.castShadow=false;scene.add(model);
  const companion={kind,model,actor,pos:model.position,hp:spec.hp,maxHp:spec.hp,life:12,skillCd:[.15,.85,1.7],pose:null,last:model.position.clone(),dead:false};
  state.companions.push(companion);
  spawnImpactBurst(model.position,spec.color,{radius:1.45,y:.55});
  return companion;
}
async function summonCompanions(){
  if(!canCast("summon",35))return;
  const p=state.player;p.stamina-=35;p.cooldowns.summon=28;p.castTime=.72;p.castKind="summon";startFirstPersonAction("summon");
  state.summonToken++;const token=state.summonToken;
  state.companions.forEach(c=>scene.remove(c.model));state.companions=[];
  spawnImpactBurst(p.pos,C.gold,{heavy:true,radius:2.8});
  toast("草帽伙伴集结中…",1100);
  const roles=Object.keys(COMPANION_ROLES);
  const result=await Promise.allSettled(roles.map(kind=>loadTroopPrototype(kind)));
  if(token!==state.summonToken||!state.active)return;
  const summoned=[];
  result.forEach((entry,i)=>{
    if(entry.status!=="fulfilled")return console.warn("[Companion] model unavailable",roles[i],entry.reason);
    try{createCompanion(roles[i],entry.value);summoned.push(COMPANION_ROLES[roles[i]].name);}catch(error){console.warn("[Companion] invalid model",roles[i],error);}
  });
  if(!summoned.length){
    p.stamina=Math.min(100,p.stamina+35);
    p.cooldowns.summon=0;
    toast("伙伴模型加载失败，已返还体力，可重试召唤",1800);
    return;
  }
  toast(`${summoned.join("、")}支援 12 秒（${summoned.length}/3）`,1600);
}

function clearActors(){
  state.enemies.forEach(e=>{disposeMarineSprite(e.model);scene.remove(e.model);}); state.enemies=[];
  state.projectiles.forEach(p=>{scene.remove(p.mesh);disposeWorldEffect({mesh:p.mesh,ownedMaterial:true});}); state.projectiles=[];
  state.hazards.forEach(h=>{scene.remove(h.mesh);disposeWorldEffect({mesh:h.mesh,ownedMaterial:true});}); state.hazards=[];
  state.effects.forEach(f=>{scene.remove(f.mesh);disposeWorldEffect(f);}); state.effects=[];
  if(state.ally){scene.remove(state.ally.model);state.ally=null;}
  state.companions.forEach(c=>scene.remove(c.model));state.companions=[];state.summonToken++;
  state.boss=null;setLockedTarget(null);if(state.targetRing)state.targetRing.visible=false;
}

const arms=new THREE.Group();
camera.add(arms);
function buildArms(){
  arms.position.set(0,-.72,-.92);
  // Compact geometric fallback until the Film Red skinned meshes finish loading.
  const fallback=new THREE.Group(),skin=standard(0xe7ac88,.75),cuff=standard(0x9b2830,.68),glove=standard(0x302930,.6);
  for(const side of [-1,1]){
    const pivot=new THREE.Group();pivot.position.set(side*.48,-.05,0);pivot.rotation.y=side*.12;
    add(pivot,new THREE.CylinderGeometry(.16,.22,.72,10),skin,0,-.25,-.26,-.52);
    add(pivot,new THREE.CylinderGeometry(.20,.18,.24,10),cuff,0,-.06,-.54,-.52);
    add(pivot,new THREE.SphereGeometry(.20,10,8),glove,0,.01,-.72);
    for(let j=0;j<3;j++)add(pivot,new THREE.SphereGeometry(.068,7,5),skin,(j-1)*.12,.07,-.86);
    fallback.add(pivot);
  }
  arms.add(fallback);arms.userData.fallback=fallback;
}
function installFirstPersonRig(source){
  const clone=cloneSkeleton(source),sourceBones=[],cloneBones=[];
  source.traverse(node=>{if(node.isBone)sourceBones.push(node);});
  clone.traverse(node=>{
    if(node.isBone)cloneBones.push(node);
    if(node.isMesh){
      node.visible=/luffy022_arm01_d|luffy022_body02_d/i.test(node.name);
      if(node.visible){
        node.material=Array.isArray(node.material)?node.material.map(m=>m.clone()):node.material.clone();
        const materials=Array.isArray(node.material)?node.material:[node.material];
        materials.forEach(m=>{m.depthTest=false;m.depthWrite=false;m.needsUpdate=true;});
        node.frustumCulled=false;node.renderOrder=24;
      }
    }
  });
  if(!sourceBones.length||sourceBones.length!==cloneBones.length)return;
  const pairs=sourceBones.map((bone,i)=>[bone,cloneBones[i]]);
  clone.position.set(0,-1.25,.15);clone.rotation.order="YXZ";clone.rotation.y=0;
  arms.add(clone);arms.userData.filmRedModel=clone;arms.userData.mirrorPairs=pairs;
  arms.userData.fallback.visible=false;
}
function updateFirstPersonArms(p,moving=false){
  if(arms.userData.filmRedModel){
    if(state.mode==="first")for(const [source,target] of arms.userData.mirrorPairs)target.quaternion.copy(source.quaternion);
  }else if(arms.userData.fallback){
    const progress=p.fpAction?clamp(p.fpActionTime/Math.max(.01,p.fpActionDuration),0,1):0;
    const strike=Math.sin(progress*Math.PI),alternating=p.castKind==="combo"?Math.sin(progress*Math.PI*5):1;
    arms.userData.fallback.children.forEach((pivot,i)=>{
      pivot.rotation.x=(moving?Math.sin(state.time*9+i*Math.PI)*.09:0)-(i?1:alternating)*strike*.55;
    });
  }
}
buildArms();
const firstPersonFx=new THREE.Group();
firstPersonFx.position.set(0,0,-1.18);firstPersonFx.renderOrder=30;camera.add(firstPersonFx);
function addFirstPersonFxMesh(mesh,kind,total,baseScale=1,spin=0){
  if(state.fpEffects.length>=24){
    const old=state.fpEffects.shift();firstPersonFx.remove(old.mesh);old.mesh.geometry.dispose();old.mesh.material.dispose();
  }
  mesh.renderOrder=31;firstPersonFx.add(mesh);
  state.fpEffects.push({mesh,kind,time:total,total,baseScale,spin,baseOpacity:mesh.material.opacity||1});
}
function flameSculpture(scale=1){
  const outline=new THREE.Shape();
  outline.moveTo(-.16,-.57);outline.bezierCurveTo(-.65,-.08,-.35,.42,-.04,.52);
  outline.bezierCurveTo(.09,.74,.05,1.05,.19,1.27);
  outline.bezierCurveTo(.41,.65,.51,.1,.21,-.44);
  outline.quadraticCurveTo(.06,-.72,-.16,-.57);
  const geometry=new THREE.ExtrudeGeometry(outline,{depth:.12,steps:1,bevelEnabled:true,bevelThickness:.035,bevelSize:.035,bevelSegments:2,curveSegments:6});
  geometry.scale(scale,scale,scale);
  return geometry;
}
function spawnFirstPersonFx(kind){
  const colors={basic:0xe38839,combo:0xffba49,rocketPunch:0xd4542e,burst:0xf17229,
    axe:0xd85b2e,rocket:0xfa842a,giant:0xc53e35,haki:0x6d4bb8,dodge:0x4d9fbc,summon:0xffd260};
  const color=colors[kind]||C.orange,total=FIRST_PERSON_ACTIONS[kind]?.duration||.42;
  const size=kind==="giant"?1.8:kind==="haki"||kind==="burst"?1.4:kind==="basic"?1:1.15;
  const material=(hex,opacity)=>new THREE.MeshBasicMaterial({color:hex,transparent:true,opacity,
    depthTest:false,depthWrite:false,blending:THREE.AdditiveBlending,side:THREE.DoubleSide});
  const core=new THREE.Mesh(new THREE.IcosahedronGeometry(.34*size,1),material(color,.9));
  core.position.set(kind==="haki"?0:.28,-.16,-.12);addFirstPersonFxMesh(core,"core",total,size);
  const halo=new THREE.Mesh(new THREE.TorusGeometry(.48*size,.14*size,9,26,Math.PI*1.65),material(color,.82));
  halo.position.copy(core.position);halo.rotation.set(.55,.55,0);
  addFirstPersonFxMesh(halo,"halo",total,size,3);
  if(kind!=="dodge"){
    for(const side of [-1,1]){
      const ribbon=new THREE.Mesh(flameSculpture(size*.55),material(side<0?color:0xffd08a,.72));
      ribbon.position.copy(core.position).add(new THREE.Vector3(side*.28,-.22,-.26));
      ribbon.rotation.z=side*.57;ribbon.rotation.y=side*.28;
      addFirstPersonFxMesh(ribbon,"blade",total,size);
    }
  }
}
function clearFirstPersonEffects(){
  for(const f of state.fpEffects){firstPersonFx.remove(f.mesh);f.mesh.geometry?.dispose();f.mesh.material?.dispose();}
  state.fpEffects.length=0;
}
function updateFirstPersonEffects(dt){
  for(let i=state.fpEffects.length-1;i>=0;i--){
    const f=state.fpEffects[i];f.time-=dt;const q=1-clamp(f.time/f.total,0,1);
    f.mesh.material.opacity=f.baseOpacity*(1-q);
    if(f.kind==="core")f.mesh.scale.setScalar(.55+Math.sin(q*Math.PI)*.85);
    else if(f.kind==="halo"){f.mesh.scale.setScalar(.4+q*1.6);f.mesh.rotation.z+=f.spin*dt;}
    else if(f.kind==="blade")f.mesh.scale.set(.7+q*.85,.4+q*1.3,1);
    else f.mesh.scale.z=.45+q*1.8;
    if(f.time<=0){firstPersonFx.remove(f.mesh);f.mesh.geometry?.dispose();f.mesh.material?.dispose();state.fpEffects.splice(i,1);}
  }
}
function startFirstPersonAction(name){
  const clip=FIRST_PERSON_ACTIONS[name];if(!clip)return;
  const p=state.player;p.fpAction=name;p.fpActionTime=0;p.fpActionDuration=clip.duration;
  if(state.mode==="first")spawnFirstPersonFx(name);
}
function firstPersonCameraKick(p){
  if(p.hurtAnim>0)return {pitch:.045*p.hurtAnim,yaw:.018*p.hurtAnim,roll:.035*p.hurtAnim};
  if(!p.fpAction)return {pitch:0,yaw:0,roll:0};
  const t=clamp((p.fpActionTime||0)/Math.max(.001,p.fpActionDuration||1),0,1);
  const pulse=Math.sin(Math.PI*t),snap=Math.sin(Math.PI*clamp(t*1.35,0,1));
  const strength={basic:.018,combo:.026,rocketPunch:.035,burst:.022,axe:.032,rocket:.04,giant:.06,haki:.045,dodge:.012}[p.fpAction]||.02;
  return {pitch:strength*(.35*pulse+.65*snap),yaw:Math.sin(t*Math.PI*2)*strength*.38,roll:Math.sin(t*Math.PI)*strength*.72};
}
buildWorld();
state.playerModel=createPlayerModel();rigActor(state.playerModel);
scene.add(state.playerModel);
loadPlayerGLB(state.playerModel);
loadLuffySpineAsset();


function rigActor(root){
  const parts=root.children.filter(o=>o.isMesh);
  const rig={legs:[],arms:[],weapons:[],phase:0,last:root.position.clone()};
  for(const side of [-1,1]){
    const hip=new THREE.Group();hip.position.set(side*.38,1.95,0);root.add(hip);
    const shoulder=new THREE.Group();shoulder.position.set(side*.95,3.45,0);root.add(shoulder);
    for(const m of parts){
      if(Math.sign(m.position.x)!==side)continue;
      const leg=m.position.y<1.95&&Math.abs(m.position.x)<.8;
      const arm=Math.abs(m.position.x)>.8&&m.position.y>=1.95&&m.position.y<3.55;
      if(leg||arm){const pivot=leg?hip:shoulder;m.position.sub(pivot.position);pivot.add(m);}
    }
    rig.legs.push(hip);rig.arms.push(shoulder);
  }
  root.userData.rig=rig;
}
const TROOP_BONE_ALIASES={
  pelvis:["Bip001_Pelvis"],spine:["Bip001_Spine"],chest:["Bip001_Spine1"],neck:["Bip001_Neck"],head:["Bip001_Head"],
  lUpperArm:["Bip001_L_UpperArm","Bip001_LUpArmTwist"],rUpperArm:["Bip001_R_UpperArm","Bip001_RUpArmTwist"],
  lForearm:["Bip001_L_Forearm","Bip001_L_ForeTwist"],rForearm:["Bip001_R_Forearm","Bip001_R_ForeTwist"],
  lHand:["Bip001_L_Hand"],rHand:["Bip001_R_Hand"],
  lThigh:["Bip001_L_Thigh"],rThigh:["Bip001_R_Thigh"],lCalf:["Bip001_L_Calf"],rCalf:["Bip001_R_Calf"],
  lFoot:["Bip001_L_Foot"],rFoot:["Bip001_R_Foot"]
};
function setupTroopRig(actor,assetType){
  const bones={},base=new Map(),materials=[],axes=characterBoneAxes(actor);
  Object.entries(TROOP_BONE_ALIASES).forEach(([key,names])=>{
    const bone=names.map(name=>actor.getObjectByName(name)).find(Boolean);
    if(bone){bones[key]=bone;if(!base.has(bone))base.set(bone,{...bindBonePose(bone,axes),position:bone.position.clone(),quaternion:bone.quaternion.clone(),scale:bone.scale.clone()});}
  });
  actor.traverse(node=>{
    if(!node.isMesh)return;
    const list=Array.isArray(node.material)?node.material:[node.material];
    list.forEach(material=>{if(material)materials.push({material,emissive:material.emissive?.clone(),intensity:material.emissiveIntensity??0});});
  });
  actor.userData.troopRig={assetType,bones,base,materials,phase:Math.random()*Math.PI*2};
}
function updateTroopRig(actor,dt,moving,attackProgress,attackKind,hurt){
  const rig=actor?.userData?.troopRig;if(!rig)return;
  rig.phase+=dt*(moving?7.6:1.8);
  const delta=new Map();
  const add=(key,x=0,y=0,z=0)=>{if(!rig.bones[key])return;const d=delta.get(key)||[0,0,0];d[0]+=x;d[1]+=y;d[2]+=z;delta.set(key,d);};
  const walk=moving?Math.sin(rig.phase)*.34:0;
  const breathe=Math.sin(state.time*2.1+rig.phase)*.018;
  add("spine",0,0,breathe);add("chest",breathe*.35,0,0);add("head",0,Math.sin(state.time*1.4+rig.phase)*.012,0);
  add("lThigh",walk,0,0);add("rThigh",-walk,0,0);
  add("lCalf",Math.max(0,-walk)*.42,0,0);add("rCalf",Math.max(0,walk)*.42,0,0);
  add("lUpperArm",-walk*.72,0,0);add("rUpperArm",walk*.72,0,0);
  add("lForearm",-walk*.18,0,0);add("rForearm",walk*.18,0,0);
  const attack=clamp(attackProgress,0,1),pulse=attack>0?Math.sin(Math.PI*attack):0;
  if(pulse){
    if(attackKind==="bossCircle"||attackKind==="bossLine"||attackKind==="bossBurst"){
      const charge=Math.sin(Math.PI*.5*clamp(attack/.35,0,1))*(1-clamp((attack-.45)/.35,0,1));
      const release=Math.sin(Math.PI*clamp((attack-.42)/.58,0,1));
      if(attackKind==="bossLine"){
        // Plant one foot, draw the magma fist back, then drive that arm forward.
        add("pelvis",-.12*charge,0,0);add("spine",-.13*charge,.22*charge,0);
        add("rUpperArm",.48*charge-1.45*release,0,-.24*release);
        add("rForearm",-.65*charge-.72*release,0,0);
        add("lUpperArm",-.45*charge,0,.25*charge);
        add("lThigh",.15*charge,0,0);add("rThigh",-.22*charge,0,0);
      }else if(attackKind==="bossCircle"){
        // Both shoulders rise during warning; the downward strike lands as the ring resolves.
        add("spine",-.22*charge+.26*release,0,0);add("chest",-.18*charge+.24*release,0,0);
        add("rUpperArm",-1.18*charge+.68*release,0,-.22*charge);
        add("lUpperArm",-1.18*charge+.68*release,0,.22*charge);
        add("rForearm",-.82*charge+.42*release,0,0);add("lForearm",-.82*charge+.42*release,0,0);
        add("rThigh",.23*release,0,0);add("lThigh",.23*release,0,0);
      }else{
        // Wide magma burst opens the chest and arms, then closes around the blast.
        add("spine",.22*charge-.12*release,0,0);add("chest",.26*charge,0,0);
        add("rUpperArm",-.65*charge-1.0*release,0,-.88*charge+.28*release);
        add("lUpperArm",-.65*charge-1.0*release,0,.88*charge-.28*release);
        add("rForearm",-.42*charge-.3*release,0,0);add("lForearm",-.42*charge-.3*release,0,0);
        add("rThigh",.14*release,0,0);add("lThigh",.14*release,0,0);
      }
    }else if(attackKind==="allyHeal"||attackKind==="allyBloom"){
      add("spine",-.12*pulse,0,0);add("chest",-.15*pulse,0,0);
      add("rUpperArm",-.45*pulse,0,-.32*pulse);add("lUpperArm",-.45*pulse,0,.32*pulse);
      add("rForearm",-.28*pulse,0,0);add("lForearm",-.28*pulse,0,0);
    }else if(attackKind==="allyChopperShot"){
      add("spine",-.14*pulse,0,0);add("rUpperArm",-.5*pulse,0,-.16*pulse);add("rForearm",-.27*pulse,0,0);
    }else if(attackKind==="allyDash"){
      add("spine",-.22*pulse,0,0);add("chest",-.18*pulse,0,0);
      add("rThigh",-.5*pulse,0,0);add("lThigh",.35*pulse,0,0);
      add("rUpperArm",.25*pulse,0,-.18*pulse);add("lUpperArm",-.3*pulse,0,.16*pulse);
    }else if(attackKind==="allyKick"||attackKind==="allySpin"){
      add("spine",-.2*pulse,0,attackKind==="allySpin"?.18*pulse:0);
      add("rThigh",-.52*pulse,0,0);add("rCalf",.24*pulse,0,0);
      add("lUpperArm",.26*pulse,0,.18*pulse);add("rUpperArm",-.16*pulse,0,-.22*pulse);
    }else if(attackKind==="allyTankWave"||attackKind==="allyTankGuard"){
      add("chest",-.18*pulse,0,0);
      add("rUpperArm",-.5*pulse,0,-.38*pulse);add("lUpperArm",-.5*pulse,0,.38*pulse);
      add("rForearm",-.38*pulse,0,0);add("lForearm",-.38*pulse,0,0);
      add("lThigh",.18*pulse,0,0);add("rThigh",.18*pulse,0,0);
    }else if(attackKind==="allyTank"){
      add("pelvis",-.13*pulse,0,0);add("chest",-.21*pulse,0,0);
      add("rUpperArm",-.42*pulse,0,-.3*pulse);add("lUpperArm",-.42*pulse,0,.3*pulse);
      add("rForearm",-.24*pulse,0,0);add("lForearm",-.24*pulse,0,0);
    }else if(attackKind==="gun"){
      add("rUpperArm",-1.05*pulse,0,-.18*pulse);add("rForearm",-.72*pulse,0,0);add("lUpperArm",-.35*pulse,0,.12*pulse);add("spine",0,.08*pulse,0);
    }else{
      add("rUpperArm",-1.35*pulse,0,-.32*pulse);add("rForearm",-.92*pulse,0,0);add("lUpperArm",.42*pulse,0,.12*pulse);add("spine",0,.13*pulse,0);
    }
  }
  const hit=hurt>0?Math.sin(Math.PI*clamp(hurt,0,1)):0;
  if(hit){add("spine",0,0,.23*hit);add("chest",-.18*hit,0,0);add("head",-.12*hit,0,.08*hit);add("lUpperArm",0,0,.22*hit);add("rUpperArm",0,0,-.22*hit);}
  for(const [bone,pose] of rig.base){bone.position.copy(pose.position);bone.quaternion.copy(pose.quaternion);bone.scale.copy(pose.scale);}
  delta.forEach((d,key)=>{const bone=rig.bones[key],pose=rig.base.get(bone);if(pose)turnBone(pose,...d.map(angle=>clamp(angle,-.55,.55)));});
  const flashing=(actor.parent?.userData?.hitFlash||0)>0;
  rig.materials.forEach(entry=>{
    if(!entry.material.emissive)return;
    if(flashing){entry.material.emissive.setHex(0x8b2118);entry.material.emissiveIntensity=.42;}
    else{if(entry.emissive)entry.material.emissive.copy(entry.emissive);entry.material.emissiveIntensity=entry.intensity;}
  });
}
function rotateTroopToward(root,target,dt,rate=9){
  const current=root.rotation.y,diff=Math.atan2(Math.sin(target-current),Math.cos(target-current));
  root.rotation.y+=diff*clamp(dt*rate,0,1);
}
// Kept as no-ops for the combat state machine while all visual enemy motion
// now comes from the actual 3D FBX actor and its root-level hit/move pose.
function setMarineAnimation(){}
function disposeMarineSprite(){}
function poseActor(root,dt,moving,attack=0,hurt=0){
  const rig=root.userData.rig;if(!rig)return;
  rig.phase+=dt*(moving?10:2);
  const stride=moving?Math.sin(rig.phase)*.48:0;
  rig.legs.forEach((p,i)=>p.rotation.x=(i?1:-1)*stride);
  rig.arms.forEach((p,i)=>{
    p.rotation.x=(i?-1:1)*stride*.65-Math.sin(Math.PI*attack)*1.8;
    p.rotation.z=(i?1:-1)*hurt*.2;
  });
  root.rotation.x=-Math.sin(hurt*Math.PI)*.2;
}
function animateActors(dt){
  for(const a of [...state.enemies,...(state.ally?[state.ally]:[])]){
    if(a.model.userData.animSprite){
      updateMarineSprite(a,dt);
      continue;
    }
    const rig=a.model.userData.rig;if(!rig)continue;
    const moving=a.pos.distanceToSquared(rig.last)>.00001;
    rig.last.copy(a.pos);
    a.model.userData.swing=Math.max(0,(a.model.userData.swing||0)-dt*2.8);
    a.model.userData.hurt=Math.max(0,(a.model.userData.hurt||0)-dt*3.5);
    a.model.userData.hitFlash=a.hitFlash||0;
    poseActor(a.model,dt,moving,a.model.userData.swing,a.model.userData.hurt);
    if(a.libraryModel){
      const swing=a.model.userData.swing||0,hurt=a.model.userData.hurt||0;
      a.libraryModel.position.y=a.libraryModel.userData.baseY+(moving?Math.abs(Math.sin(state.time*7.5+a.id))*.055:0);
      const skillPose=a.model.userData.skillPose;
      if(skillPose){skillPose.time+=dt;if(skillPose.time>=skillPose.duration)a.model.userData.skillPose=null;}
      const attackProgress=skillPose?clamp(skillPose.time/skillPose.duration,0,1):a.attackActive?clamp(a.attackAnimTime,0,1):0;
      updateTroopRig(a.libraryModel,dt,moving,attackProgress,skillPose?.kind||a.attackKind||"melee",hurt);
      a.libraryModel.rotation.z=(swing?Math.sin(Math.PI*swing)*-.035:0)+(hurt?Math.sin(Math.PI*hurt)*.035:0);
    }
  }
}
function scheduleCombat(delay,run){state.combatActions.push({delay,run});}
function updateCombat(dt){
  const pending=state.combatActions;state.combatActions=[];
  for(const event of pending){
    event.delay-=dt;
    if(event.delay<=0){event.run();if(!state.active)break;}
    else state.combatActions.push(event);
  }
  const p=state.player;
  if(p.rocket){
    const dash=p.rocket;
    for(const e of [...state.enemies]){
      if(e.dead||dash.hits.has(e.id))continue;
      const segment=p.pos.clone().sub(dash.last);segment.y=0;
      const rel=e.pos.clone().sub(dash.last);rel.y=0;
      const t=clamp(rel.dot(segment)/Math.max(.0001,segment.lengthSq()),0,1);
      if(rel.addScaledVector(segment,-t).length()<2.8){
        dash.hits.add(e.id);damageEnemy(e,65,true);e.stun=Math.max(e.stun,e.type==="boss"?.25:.8);
      }
    }
    dash.last.copy(p.pos);dash.time-=dt;
    if(dash.time<=0)p.rocket=null;
  }
}
function canCast(key,cost=0){
  const p=state.player;
  if(!state.active||state.paused||p.castTime>0||p.cooldowns[key]>0||p.fpAction)return false;
  if(p.stamina<cost){toast("体力不足",650);return false;}
  return true;
}
function areaStrike(point,radius,damage){
  spawnImpactBurst(point,C.gold,{heavy:true,radius});
  spawnEnergyColumn(point,C.orange,Math.min(6,radius*1.6));
  for(const e of [...state.enemies]){
    if(!e.dead&&dist2D(e.pos,point)<radius){
      damageEnemy(e,damage,true);e.stun=Math.max(e.stun,e.type==="boss"?.4:1.2);
    }
  }
  state.shake=.22;
}
function skill4(){
  if(!canCast("s4",25))return;
  const p=state.player;p.stamina-=25;p.cooldowns.s4=12;p.castTime=.55;p.castKind="axe";startFirstPersonAction("axe");
  const point=p.pos.clone().addScaledVector(playerDirection(),5);point.y=0;
  spawnSkillCharge(point.clone().add(new THREE.Vector3(0,.2,0)),C.orange,"axe");
  spawnMeleeArc(p.pos,playerDirection(),C.gold,1.8);
  scheduleCombat(.4,()=>areaStrike(point,4.5,90));
  toast("橡胶·战斧！",850);
}
function skill5(){
  if(!canCast("s5",30))return;
  const p=state.player;p.stamina-=30;p.cooldowns.s5=14;
  p.dodge=.42;p.dodgeDir=playerDirection();p.invuln=.5;startFirstPersonAction("rocket");
  p.rocket={time:.46,last:p.pos.clone(),hits:new Set()};p.castTime=.42;p.castKind="rocket";
  spawnSkillCharge(p.pos,C.orange,"rocket");spawnMeleeArc(p.pos,p.dodgeDir,C.gold,1.5);
  spawnEnergyColumn(p.pos,C.orange,3.1);state.shake=.28;toast("橡胶·火箭！",850);
}
function ultimate(){
  if(!canCast("ultimate"))return;
  const p=state.player;
  if(p.charge<100){toast("命中敌人积攒大招 · "+Math.floor(p.charge)+"%",900);return;}
  p.charge=0;p.cooldowns.ultimate=40;p.castTime=1.05;p.castKind="giant";p.invuln=1.1;startFirstPersonAction("giant");
  const point=p.pos.clone().addScaledVector(playerDirection(),7);point.y=0;
  const fistMat=new THREE.MeshBasicMaterial({color:C.skin,transparent:true,opacity:.98});
  const fist=new THREE.Mesh(new THREE.IcosahedronGeometry(1.65,1),fistMat);
  fist.position.copy(point);fist.position.y=7.2;scene.add(fist);
  addWorldEffect(fist,1.05,"custom",{ownedMaterial:true,update:f=>{const q=1-f.time/f.total;f.mesh.position.y=7.2-q*6.95;f.mesh.scale.setScalar(.55+q*1.15);f.mesh.rotation.x+=.08;f.mesh.rotation.z+=.06;f.mesh.material.opacity=.98*(q<.92?1:1-(q-.92)*12);}});
  spawnSkillCharge(point.clone().add(new THREE.Vector3(0,1.4,0)),C.gold,"giant");
  spawnImpactBurst(point,C.orange,{heavy:true,radius:4.6});
  scheduleCombat(.75,()=>{areaStrike(point,7,230);audio.tone(65,.3,"sawtooth",.05);});
  toast("三档 · 巨人之拳！",1300);
}

function resetGame(){
  clearActors();clearFirstPersonEffects();state.combatActions=[];
  Object.assign(state,{active:false,paused:false,phase:"assault",time:0,capture:0,defense:30,
    waveClock:0,kills:0,combo:0,maxCombo:0,comboTimer:0,score:0,yaw:0,pitch:-.04,shake:0,gateOpen:0,targetHold:0});
  Object.assign(state.player,{charge:0,castTime:0,castKind:null,rocket:null,hp:300,maxHp:300,stamina:100,haki:30,speed:9.2,dodge:0,invuln:0,guardTimer:0,buff:0,attackAnim:0,hurtAnim:0,fpAction:null,fpActionTime:0,fpActionDuration:0});
  state.player.pos.set(0,1.7,40);
  Object.keys(state.player.cooldowns).forEach(k=>state.player.cooldowns[k]=0);
  state.gate.children[0].position.x=-3.2; state.gate.children[1].position.x=3.2;
  state.exitMarker.visible=false; ui.bossWrap.classList.add("hidden"); ui.capture.classList.remove("hidden");
  const initial=[
    ["sword",-8,24],["sword",7,21],["gun",-17,13],["shield",16,8],["captain",0,3],
    ["garpCaptain",-11,-5],["fakeNami",11,-9],["fakeSniper",19,-21],
    ["toyA",-8,-28],["toyB",1,-32],["toyC",10,-28]
  ];
  initial.forEach(v=>spawnEnemy(v[0],v[1],v[2]));
  updateUI();
}
resetGame();

function startGame(){
  audio.start(); resetGame(); state.active=true; state.mode="top";ui.viewBtn.textContent="第三视角";
  for(const kind of ["allyJinbe","allySanji","allyChopper"])loadTroopPrototype(kind).catch(error=>console.warn("[Companion] preload failed",kind,error));
  ui.start.classList.add("hidden"); ui.result.classList.add("hidden"); ui.hud.classList.remove("hidden");
  document.body.classList.add("playing");
  if(document.documentElement.requestFullscreen) document.documentElement.requestFullscreen().catch(()=>{});
  if(screen.orientation&&screen.orientation.lock) screen.orientation.lock("landscape").catch(()=>{});
  toast("突破防线，前往金色据点！",2000);
}
function finish(win){
  if(!state.active)return; state.active=false; document.exitPointerLock?.();
  ui.result.classList.remove("hidden");
  ui.resultTitle.textContent=win?"决战胜利":"战斗失败";
  ui.resultTitle.className=win?"win":"lose";
  const grade=state.score>2800?"S":state.score>1900?"A":state.score>1100?"B":"C";
  ui.resultStats.innerHTML="<b>评级 "+grade+"</b><span>用时 "+formatTime(state.time)+"</span><span>击败 "+state.kills+" 名敌人</span><span>最高连击 "+state.maxCombo+"</span>";
  audio.tone(win?520:90,.65,win?"triangle":"sawtooth",.065);
}
function formatTime(t){ const m=Math.floor(t/60),s=Math.floor(t%60);return m+":"+String(s).padStart(2,"0"); }

function playerDirection(){
  // Build movement from the exact same Euler convention as the camera.
  return new THREE.Vector3(0,0,-1)
    .applyEuler(new THREE.Euler(0,state.yaw,0,"YXZ"))
    .normalize();
}
function playerRightDirection(){
  return new THREE.Vector3(1,0,0)
    .applyEuler(new THREE.Euler(0,state.yaw,0,"YXZ"))
    .normalize();
}
function aimDirection(){
  if(state.mode==="top"){
    const view=new THREE.Vector3();camera.getWorldDirection(view);
    const origin=camera.position.clone();
    const t=Math.abs(view.y)>.05?(1.55-origin.y)/view.y:40;
    const point=t>0?origin.clone().addScaledVector(view,t):state.player.pos.clone().addScaledVector(playerDirection(),40);
    const flat=point.sub(state.player.pos);flat.y=0;
    return flat.lengthSq()>.01?flat.normalize():playerDirection();
  }
  const e=new THREE.Euler(state.pitch,state.yaw,0,"YXZ");
  return new THREE.Vector3(0,0,-1).applyEuler(e).normalize();
}
function updatePlayer(dt){
  const p=state.player;
  p.castTime=Math.max(0,p.castTime-dt);
  Object.keys(p.cooldowns).forEach(k=>p.cooldowns[k]=Math.max(0,p.cooldowns[k]-dt));
  p.invuln=Math.max(0,p.invuln-dt); p.buff=Math.max(0,p.buff-dt);p.guardTimer=Math.max(0,p.guardTimer-dt);
  p.attackAnim=Math.max(0,p.attackAnim-dt*3.4); p.hurtAnim=Math.max(0,p.hurtAnim-dt*5);
  if(p.fpAction){
    p.fpActionTime+=dt;
    if(p.fpActionTime>=p.fpActionDuration){p.fpAction=null;p.fpActionTime=0;p.fpActionDuration=0;}
  }
  state.comboTimer-=dt; if(state.comboTimer<=0)state.combo=0;
  p.stamina=clamp(p.stamina+dt*(p.buff>0?23:15),0,100);

  // The left joystick is movement only. It must never change the camera view.
  let ix=(state.keys.KeyD?1:0)-(state.keys.KeyA?1:0)+state.joy.x;
  let iz=(state.keys.KeyW?1:0)-(state.keys.KeyS?1:0)-state.joy.y;
  const l=Math.hypot(ix,iz); if(l>1){ix/=l;iz/=l;}
  const f=playerDirection(), r=playerRightDirection();
  const move=new THREE.Vector3().addScaledVector(f,iz).addScaledVector(r,ix);
  const moving=move.lengthSq()>.01;
  let speed=p.speed*(p.buff>0?1.3:1);
  if(p.dodge>0){p.dodge-=dt;speed=25;move.copy(p.dodgeDir);}
  if(moving||p.dodge>0) p.pos.addScaledVector(move.normalize(),speed*dt);
  p.pos.x=clamp(p.pos.x,-39,39); p.pos.z=clamp(p.pos.z,-62,55);
  if(state.phase!=="exit"&&p.pos.z<-59)p.pos.z=-59;

  state.playerModel.position.set(p.pos.x,0,p.pos.z);
  // Locomotion faces travel; attacks face aim. Camera/joystick stay independent.
  const facing=(p.attackAnim>0||p.castTime>0)?aimDirection():(moving?move:playerDirection());
  if(moving||p.attackAnim>0||p.castTime>0)rotateTroopToward(state.playerModel,Math.atan2(facing.x,facing.z),dt,p.attackAnim>0?24:12);
  poseActor(state.playerModel,dt,moving,p.attackAnim,p.hurtAnim);
  updatePlayerSprite(moving,p,ix);
  updatePlayer3D(state.playerModel,dt,moving,p);
  state.playerModel.visible=state.mode!=="first";
  if(state.mode==="first"){
    camera.position.copy(p.pos);
    camera.position.y=1.74;
    const kick=firstPersonCameraKick(p);
    camera.rotation.set(state.pitch-kick.pitch,state.yaw+kick.yaw,kick.roll);
    arms.visible=true;firstPersonFx.visible=true;
  }else{
    const forward=playerDirection();
    const right=playerRightDirection();
    const cameraAnchor=p.pos.clone().add(new THREE.Vector3(0,7.2,0)).addScaledVector(forward,-8.6).addScaledVector(right,1.0);
    const lookAhead=p.pos.clone().add(new THREE.Vector3(0,2.15,0)).addScaledVector(forward,13);
    camera.position.copy(cameraAnchor);
    camera.lookAt(lookAhead); arms.visible=false;
    firstPersonFx.visible=false;
  }
  if(state.shake>0){
    state.shake=Math.max(0,state.shake-dt*2.6);
    camera.position.x+=(Math.random()-.5)*state.shake;
    camera.position.y+=(Math.random()-.5)*state.shake*.65;
  }
  const bob=moving?Math.sin(state.time*11)*.018:0;
  arms.position.y=-.72+bob;
  arms.rotation.z=Math.sin(p.hurtAnim*Math.PI)*.08;
  arms.position.z=-.92+p.hurtAnim*.15;
  if(p.castTime>0&&p.castKind==="axe"){
    const q=1-p.castTime/.55;
    const leg=state.playerModel.userData.rig.legs[1];
    if(leg)leg.rotation.x=-2.7+q*3.2;
  }
  updateFirstPersonArms(p,moving);
}

function beginDodge(){
  const p=state.player;if(!canCast("dodge",28))return;
  p.stamina-=28;p.cooldowns.dodge=1.1;p.dodge=.24;p.invuln=.34;p.castKind="dodge";startFirstPersonAction("dodge");
  let ix=(state.keys.KeyD?1:0)-(state.keys.KeyA?1:0)+state.joy.x;
  let iz=(state.keys.KeyW?1:0)-(state.keys.KeyS?1:0)-state.joy.y;
  const f=playerDirection(),r=playerRightDirection();
  p.dodgeDir=new THREE.Vector3().addScaledVector(f,iz||1).addScaledVector(r,ix).normalize();
  audio.tone(130,.1,"sine",.04);
}
function attack(){
  const p=state.player;if(!canCast('attack'))return;
  p.cooldowns.attack=p.buff>0?.18:.34;p.attackAnim=1;p.castKind="basic";startFirstPersonAction("basic");
  const dir=aimDirection();dir.y=0;dir.normalize();spawnMeleeArc(p.pos,dir,p.buff>0?C.gold:C.orange,1.25);
  const damage=p.buff>0?31:23;
  scheduleCombat(.085,()=>hitCone(damage,4.4,.72));
  audio.tone(170,.07,"square",.035);
}
function skill1(){
  const p=state.player;if(!canCast("s1"))return;
  p.cooldowns.s1=p.buff>0?5.5:8;p.attackAnim=1;p.castKind="combo";startFirstPersonAction("combo");state.shake=.14;
  spawnSkillCharge(p.pos,C.gold,"combo");spawnImpactBurst(p.pos,C.orange,{radius:1.6});
  for(let i=0;i<5;i++)scheduleCombat(i*.075,()=>{p.attackAnim=1;const dir=aimDirection();dir.y=0;dir.normalize();spawnMeleeArc(p.pos,dir,C.gold,1.1+i*.08);hitCone(15,6.3,.58);audio.tone(210+i*30,.045,"square",.025);});
  toast("连环拳风！",800);
}
function skill2(){
  const p=state.player;if(!canCast("s2"))return;
  p.cooldowns.s2=10;p.attackAnim=1;p.castKind="rocketPunch";startFirstPersonAction("rocketPunch");
  const dir=aimDirection(), pos=p.pos.clone().add(new THREE.Vector3(0,-.05,0)).addScaledVector(dir,1.2);
  const m=createEnergyProjectile(C.orange,true);
  m.position.copy(pos);m.userData.rocket=true;m.quaternion.setFromUnitVectors(new THREE.Vector3(0,0,1),dir);scene.add(m);
  state.projectiles.push({mesh:m,pos:m.position,vel:dir.multiplyScalar(25),life:1.5,owner:"player",damage:62,radius:4,rocket:true});
  spawnMuzzleFlash(p.pos.clone().add(new THREE.Vector3(0,1.5,0)),dir,C.orange,1.4);spawnMeleeArc(p.pos,dir,C.gold,1.4);state.shake=.2;
  audio.tone(280,.14,"sawtooth",.045);toast("冲击飞拳！",800);
}
function skill3(){
  const p=state.player;if(!canCast("s3"))return;
  p.cooldowns.s3=22;p.buff=9;p.castTime=.82;p.castKind="burst";startFirstPersonAction("burst");p.hp=clamp(p.hp+35,0,p.maxHp);state.shake=.18;
  spawnSkillCharge(p.pos,C.red,"burst");spawnEnergyColumn(p.pos,C.orange,4.4);spawnImpactBurst(p.pos,C.gold,{heavy:true,radius:2.4});toast("热血爆发：速度与攻击强化！",1400);audio.tone(95,.45,"sawtooth",.05);
}
function useHaki(){
  const p=state.player;if(!canCast("haki")||p.haki<50)return;
  p.cooldowns.haki=25;p.haki-=50;state.shake=.38;p.invuln=.8;p.castTime=.86;p.castKind="haki";startFirstPersonAction("haki");
  spawnSkillCharge(p.pos,C.purple,"haki");spawnImpactBurst(p.pos,C.purple,{heavy:true,radius:5.8});
  spawnEnergyColumn(p.pos,C.purple,5.5);
  state.enemies.forEach(e=>{if(!e.dead&&dist2D(e.pos,p.pos)<12){e.stun=e.type==="boss"?1.2:3;damageEnemy(e,e.type==="boss"?55:85,true);}});
  for(let i=state.hazards.length-1;i>=0;i--){const h=state.hazards[i];if(h.type==="line"&&h.time>0){scene.remove(h.mesh);disposeWorldEffect({mesh:h.mesh,ownedMaterial:true});state.hazards.splice(i,1);}}
  toast("震慑领域！",1200);audio.tone(62,.7,"sawtooth",.075);
}
function hitCone(damage,range,minDot){
  const dir=aimDirection();dir.y=0;dir.normalize();let hit=false;
  state.enemies.forEach(e=>{
    if(e.dead)return;const to=e.pos.clone().sub(state.player.pos);to.y=0;const d=to.length();
    if(d<range&&to.normalize().dot(dir)>minDot){damageEnemy(e,damage,false);hit=true;}
  });
  if(hit){state.shake=Math.max(state.shake,.1);state.combo++;state.maxCombo=Math.max(state.maxCombo||0,state.combo);state.comboTimer=2.5;}
}
function damageEnemy(e,amount,heavy){
  if(e.dead)return;
  if(e.combatType==="shield"&&!heavy)amount*=.68;
  e.hp-=amount;e.model.userData.hurt=1;e.hitFlash=.18;
  const hitDir=e.pos.clone().sub(state.player.pos);hitDir.y=0;
  if(hitDir.lengthSq()>.001)e.knockback=hitDir.normalize().multiplyScalar(heavy?3.2:.75);
  spawnImpactBurst(e.pos,heavy?C.gold:C.orange,{heavy,radius:heavy?1.7:.72,y:1.15});
  if(heavy){state.shake=Math.max(state.shake,.24);triggerImpactFlash(true);audio.tone(72,.11,"sawtooth",.04);}
  state.player.charge=clamp(state.player.charge+amount*.12,0,100);state.player.haki=clamp(state.player.haki+amount*.08,0,100);
  state.score+=Math.round(amount*(1+state.combo*.025));damageNumber(e.pos,Math.round(amount),heavy);
  if(e.hp<=0)killEnemy(e);
}
function killEnemy(e){
  if(e.dead)return;e.dead=true;state.kills++;state.score+=e.type==="boss"?1200:100;
  burst(e.pos,e.type==="boss"?C.gold:C.orange,e.type==="boss"?26:9);
  if(state.lockedTarget===e)setLockedTarget(null);
  disposeMarineSprite(e.model);
  scene.remove(e.model);
  if(e.type==="boss"){
    state.boss=null;ui.bossWrap.classList.add("hidden");
    state.phase="defense";state.defense=30;state.waveClock=1;spawnAlly();
    toast("首领击败！保护盟友 30 秒！",2300);
  }
}
function hurtPlayer(amount){
  const p=state.player;if(p.invuln>0||!state.active)return;
  p.hp-=p.guardTimer>0?amount*.58:amount;p.invuln=.42;p.hurtAnim=1;p.fpAction=null;p.fpActionTime=0;p.fpActionDuration=0;clearFirstPersonEffects();state.shake=.28;state.combo=0;
  spawnImpactBurst(p.pos,C.red,{heavy:true,radius:1.15,y:1.25});triggerImpactFlash(true);
  ui.redFlash.classList.remove("hit");void ui.redFlash.offsetWidth;ui.redFlash.classList.add("hit");
  audio.tone(92,.16,"sawtooth",.055);if(p.hp<=0)finish(false);
}

function beginEnemyAttack(e,target,kind){
  e.attackActive=true;e.attackAnimTime=0;e.attackHitDone=false;e.attackKind=kind;
  e.attackTarget=target.clone();
  e.attackTargetAlly=!!(state.ally&&target===state.ally.pos);
  e.attackTargetCompanion=state.companions.find(c=>!c.dead&&target===c.pos)||null;
  e.attackTargetRef=e.attackTargetAlly?state.ally:(e.attackTargetCompanion||state.player);
  e.model.userData.swing=1;
  e.model.userData.skillKind=kind;
  spawnSkillCharge(e.pos,kind==="gun"?C.gold:C.red,kind==="gun"?"gun":"melee");
  if(e.animSprite)setMarineAnimation(e,kind==="gun"?"rifleFire":"saberAttack",true);
}
function tickEnemyAttack(e,dt){
  if(!e.attackActive)return false;
  e.attackAnimTime+=dt;
  const hitAt=e.attackKind==="gun"?MARINE_ANIM_CLIPS.rifleFire.hitAt:MARINE_ANIM_CLIPS.saberAttack.hitAt;
  if(!e.attackHitDone&&e.attackAnimTime>=hitAt){
    const target=e.attackTargetRef?.pos||e.attackTarget;
    if(e.attackKind==="gun"){
      enemyShot(e,target,e.attackTargetAlly,e.attackTargetCompanion);
    }else if(target&&dist2D(e.pos,target)<e.range+.65){
      spawnImpactBurst(target,e.type==="boss"?C.red:C.orange,{heavy:e.type==="boss",radius:e.type==="boss"?1.35:.7,y:1.2});
      if(e.attackTargetAlly&&state.ally)hurtAlly(e.damage);
      else if(e.attackTargetCompanion)hurtCompanion(e.attackTargetCompanion,e.damage);
      else hurtPlayer(e.damage);
    }
    e.attackHitDone=true;
  }
  if(e.attackAnimTime>=1){
    e.attackActive=false;e.attackAnimTime=0;e.attackTargetRef=null;e.attackTargetCompanion=null;
    e.model.userData.swing=0;
    if(e.animSprite)setMarineAnimation(e,"idle",true);
  }
  return true;
}

function updateEnemies(dt){
  const p=state.player;
  state.enemies.forEach(e=>{
    if(e.dead)return;
    if(e.knockback){
      e.pos.addScaledVector(e.knockback,dt);
      e.knockback.multiplyScalar(Math.exp(-dt*12));
      if(e.knockback.lengthSq()<.002)e.knockback=null;
    }
    e.attackCd-=dt;e.stun=Math.max(0,e.stun-dt);e.hitFlash=Math.max(0,(e.hitFlash||0)-dt);
    e.bar.lookAt(camera.position);const ratio=clamp(e.hp/e.maxHp,0,1);
    e.bar.userData.fill.scale.x=ratio;e.bar.userData.fill.position.x=-(1-ratio)*e.bar.userData.width/2;
    if(e.stun>0){
      e.attackActive=false;e.attackAnimTime=0;e.attackTargetRef=null;e.model.userData.swing=0;
      e.model.userData.skillPose=null;
      if(e.animSprite)setMarineAnimation(e,"idle",true);
      e.model.rotation.z=Math.sin(state.time*18)*.025;return;
    }else e.model.rotation.z=0;

    if(e.type==="boss"){updateBoss(e,dt);return;}
    if(e.attackActive){tickEnemyAttack(e,dt);return;}
    const tank=state.companions.find(c=>c.kind==="allyJinbe"&&!c.dead&&dist2D(e.pos,c.pos)<7);
    const target=tank?.pos||(state.phase==="defense"&&state.ally&&dist2D(e.pos,state.ally.pos)<dist2D(e.pos,p.pos)+4?state.ally.pos:p.pos);
    const to=target.clone().sub(e.pos);to.y=0;const d=to.length();if(d>.01)rotateTroopToward(e.model,Math.atan2(to.x,to.z),dt,11);
    if(e.combatType==="gun"&&d<18&&d>5){
      if(e.attackCd<=0){e.attackCd=2.0+Math.random()*.5;beginEnemyAttack(e,target,"gun");}
      else if(e.animSprite)setMarineAnimation(e,"idle");
    }else if(e.combatType==="gun"&&d<=5){
      if(d>.01)e.pos.addScaledVector(to.normalize(),-e.speed*dt);
      if(e.animSprite)setMarineAnimation(e,"walk");
    }else if(d>e.range){
      const crowd=state.enemies.filter(o=>o!==e&&!o.dead&&dist2D(o.pos,e.pos)<1.2).length;
      e.pos.addScaledVector(to.normalize(),e.speed*dt*(crowd?.55:1));
      if(e.animSprite)setMarineAnimation(e,"walk");
    }else if(e.attackCd<=0){
      e.attackCd=e.combatType==="captain"?1.25:1.55;
      beginEnemyAttack(e,target,"melee");
    }else if(e.animSprite){
      setMarineAnimation(e,"idle");
    }
  });
  state.enemies=state.enemies.filter(e=>!e.dead);
}
function updateBoss(e,dt){
  const p=state.player,to=p.pos.clone().sub(e.pos);to.y=0;const d=to.length();
  rotateTroopToward(e.model,Math.atan2(to.x,to.z),dt,7);
  if(e.hp<e.maxHp*.5&&!e.phase2){
    e.phase2=true;e.speed=3.45;e.model.scale.multiplyScalar(1.08);pulse(e.pos,C.red,8);
    for(let i=0;i<5;i++)spawnEnemy(i%2?"sword":"gun",-12+i*6,-41-Math.abs(2-i)*2);
    toast("首领进入狂暴阶段！",1800);
  }
  if(e.hp<e.maxHp*.2&&!e.ultimate){
    e.ultimate=true;e.attackCd=2.15;toast("警告：毁灭射线蓄力！使用震慑可打断",2500);
    e.model.userData.skillPose={kind:"bossLine",time:0,duration:1.9};
    spawnLineHazard(e.pos,p.pos,1.9,58);return;
  }
  if(d>e.range+1.2)e.pos.addScaledVector(to.normalize(),e.speed*dt);
  if(e.attackCd<=0){
    e.model.userData.swing=1;e.attackCd=e.phase2?1.85:2.6;
    const r=Math.random();
    if(r<.42){e.model.userData.skillPose={kind:"bossCircle",time:0,duration:1.0};spawnSkillCharge(p.pos.clone().add(new THREE.Vector3(0,0.25,0)),C.red,"bossCircle");spawnCircleHazard(p.pos.clone(),2.8,e.phase2?28:22,1.0);}
    else if(r<.78){e.model.userData.skillPose={kind:"bossBurst",time:0,duration:.72};spawnSkillCharge(e.pos,C.orange,"bossBurst");spawnCircleHazard(e.pos.clone(),5.2,e.phase2?35:27,.72);}
    else{e.model.userData.skillPose={kind:"bossLine",time:0,duration:1.25};spawnSkillCharge(e.pos,C.red,"bossLine");spawnLineHazard(e.pos,p.pos,1.25,e.phase2?42:32);}
  }
}
function enemyShot(e,target,targetAllyOverride=null,targetCompanion=null){
  const pos=e.pos.clone().add(new THREE.Vector3(0,2.8,0));
  const targetAlly=targetAllyOverride===null?!!(state.ally&&target===state.ally.pos):targetAllyOverride;
  const aim=target.clone();aim.y=targetAlly?2.1:1.7;
  const dir=aim.sub(pos).normalize();
  const m=createEnergyProjectile(C.gold,false);m.position.copy(pos);m.quaternion.setFromUnitVectors(new THREE.Vector3(0,0,1),dir);scene.add(m);
  spawnMuzzleFlash(pos,dir,C.gold,.62);
  state.projectiles.push({mesh:m,pos:m.position,vel:dir.multiplyScalar(13),life:2,owner:"enemy",damage:e.damage,targetAlly,targetCompanion});
  audio.tone(115,.06,"square",.018);
}
function hurtAlly(amount){
  if(!state.ally)return;state.ally.hp-=amount;toast("盟友受到攻击！",500);
  if(state.ally.hp<=0)finish(false);
}
function updateAlly(dt){
  const a=state.ally;if(!a)return;
  a.attackCd-=dt;const bar=a.model.children.find(o=>o.type==="Group"&&o.userData.fill);
  if(bar){bar.lookAt(camera.position);const r=clamp(a.hp/a.maxHp,0,1);bar.userData.fill.scale.x=r;bar.userData.fill.position.x=-(1-r)*bar.userData.width/2;}
  let nearest=null,nd=12;state.enemies.forEach(e=>{const d=dist2D(e.pos,a.pos);if(!e.dead&&d<nd){nearest=e;nd=d;}});
  if(nearest){a.model.rotation.y=Math.atan2(nearest.pos.x-a.pos.x,nearest.pos.z-a.pos.z);
    if(a.attackCd<=0){a.model.userData.swing=1;a.attackCd=1.1;damageEnemy(nearest,28,false);pulse(nearest.pos,0x54dce6,1.5);}}
}
function hurtCompanion(companion,amount){
  if(!companion||companion.dead)return;
  companion.hp-=amount;companion.model.userData.hurt=1;
  if(companion.hp<=0){companion.dead=true;scene.remove(companion.model);}
}
function castCompanionSkill(c,slot,target){
  const spec=COMPANION_ROLES[c.kind],near=(point,r)=>state.enemies.filter(e=>!e.dead&&dist2D(e.pos,point)<r);
  c.skillCd[slot]=spec.skillCds[slot];
  const skillPoses={allyJinbe:["allyTank","allyTankWave","allyTankGuard"],
    allySanji:["allyKick","allyDash","allySpin"],allyChopper:["allyChopperShot","allyHeal","allyBloom"]};
  c.pose={kind:skillPoses[c.kind][slot],time:0,duration:slot===2?.8:.52};
  if(c.kind==="allyJinbe"){
    if(slot===0&&target){damageEnemy(target,23,true);target.stun=Math.max(target.stun,.4);spawnAttackFlare(c.pos,new THREE.Vector3().subVectors(target.pos,c.pos).normalize(),spec.color,1.05);}
    if(slot===1){near(c.pos,4.1).forEach(e=>damageEnemy(e,16,true));spawnImpactBurst(c.pos,spec.color,{heavy:true,radius:3.2});}
    if(slot===2){state.player.guardTimer=Math.max(state.player.guardTimer,2.8);near(c.pos,3).forEach(e=>{e.stun=Math.max(e.stun,.45);damageEnemy(e,12,true);});spawnEnergyColumn(c.pos,spec.color,2.6);}
  }else if(c.kind==="allySanji"){
    if(slot===0&&target){damageEnemy(target,17,false);spawnAttackFlare(c.pos,new THREE.Vector3().subVectors(target.pos,c.pos).normalize(),spec.color,.8);}
    if(slot===1&&target){c.pos.addScaledVector(new THREE.Vector3().subVectors(target.pos,c.pos).setY(0).normalize(),Math.min(2,dist2D(target.pos,c.pos)*.5));damageEnemy(target,33,true);spawnImpactBurst(target.pos,spec.color,{radius:1.1,y:1.3});}
    if(slot===2){near(c.pos,3.4).forEach(e=>damageEnemy(e,19,false));spawnAttackFlare(c.pos,new THREE.Vector3(0,0,1),spec.color,1.6);}
  }else{
    if(slot===0&&target){damageEnemy(target,12,false);spawnMuzzleFlash(c.pos.clone().add(new THREE.Vector3(0,1.15,0)),new THREE.Vector3().subVectors(target.pos,c.pos).normalize(),spec.color,.9);}
    if(slot===1){state.player.hp=Math.min(state.player.maxHp,state.player.hp+27);if(state.ally)state.ally.hp=Math.min(state.ally.maxHp,state.ally.hp+15);spawnEnergyColumn(c.pos,spec.color,2.2);}
    if(slot===2){const center=target?.pos||c.pos;near(center,3.7).forEach(e=>{damageEnemy(e,21,false);e.stun=Math.max(e.stun,.55);});spawnImpactBurst(center,spec.color,{heavy:true,radius:3.1});}
  }
}
function updateCompanions(dt){
  for(let i=state.companions.length-1;i>=0;i--){
    const c=state.companions[i],spec=COMPANION_ROLES[c.kind];c.life-=dt;
    if(c.life<1e-5||c.dead){scene.remove(c.model);state.companions.splice(i,1);continue;}
    const anchor=state.player.pos.clone().add(new THREE.Vector3(spec.offset,0,3.3));anchor.x=clamp(anchor.x,-38,38);anchor.z=clamp(anchor.z,-59,54);
    let nearest=null,range=14;
    state.enemies.forEach(e=>{const d=dist2D(e.pos,c.pos);if(!e.dead&&d<range&&dist2D(e.pos,state.player.pos)<19){range=d;nearest=e;}});
    const target=nearest&&dist2D(c.pos,state.player.pos)<15?nearest:null;
    const goal=target&&range>spec.range?target.pos:anchor;
    const to=goal.clone().sub(c.pos);to.y=0;const distance=to.length();
    const moving=distance>.6;
    if(moving)c.pos.addScaledVector(to.normalize(),Math.min(distance-.5,spec.speed*dt));
    c.pos.x=clamp(c.pos.x,-38,38);c.pos.z=clamp(c.pos.z,-59,54);
    const face=target?new THREE.Vector3().subVectors(target.pos,c.pos):to;
    if(face.lengthSq()>.01)rotateTroopToward(c.model,Math.atan2(face.x,face.z),dt,13);
    c.skillCd=c.skillCd.map(v=>Math.max(0,v-dt));
    for(let slot=0;slot<3;slot++){
      if(c.skillCd[slot]>0)continue;
      if(c.kind==="allyChopper"&&slot===1){if(state.player.hp>=state.player.maxHp&&(!state.ally||state.ally.hp>=state.ally.maxHp))continue;}
      else if(!target||(slot===0&&range>spec.range+1.5))continue;
      castCompanionSkill(c,slot,target);
    }
    if(c.pose){c.pose.time+=dt;if(c.pose.time>c.pose.duration)c.pose=null;}
    updateTroopRig(c.actor,dt,moving,c.pose?clamp(c.pose.time/c.pose.duration,0,1):0,c.pose?.kind||"melee",Math.max(0,c.model.userData.hurt||0));
    c.model.userData.hurt=Math.max(0,(c.model.userData.hurt||0)-dt*4);
  }
}

function updateProjectiles(dt){
  for(let i=state.projectiles.length-1;i>=0;i--){
    const p=state.projectiles[i];p.life-=dt;p.pos.addScaledVector(p.vel,dt);
    if(p.mesh.userData.rocket)p.mesh.rotateZ(dt*10);else p.mesh.rotation.x+=dt*8;
    p.mesh.userData.energySpin=(p.mesh.userData.energySpin||0)+dt;
    let remove=p.life<=0;
    if(p.owner==="player"){
      for(const e of state.enemies){if(!e.dead&&dist2D(p.pos,e.pos)<1.25){
        if(p.rocket){state.enemies.forEach(o=>{if(!o.dead&&dist2D(o.pos,p.pos)<p.radius)damageEnemy(o,p.damage*(1-dist2D(o.pos,p.pos)/(p.radius*1.8)),true);});spawnImpactBurst(p.pos,C.orange,{heavy:true,radius:2.6});state.shake=.34;}
        else {damageEnemy(e,p.damage,false);spawnImpactBurst(p.pos,C.gold,{radius:.8});}
        remove=true;break;
      }}
    }else if(p.targetCompanion?.dead){remove=true;}
    else if(p.targetCompanion&&p.pos.distanceTo(p.targetCompanion.pos.clone().add(new THREE.Vector3(0,1.4,0)))<1.35){hurtCompanion(p.targetCompanion,p.damage);remove=true;}
    else if(p.targetAlly&&state.ally&&p.pos.distanceTo(state.ally.pos.clone().add(new THREE.Vector3(0,1.4,0)))<1.35){hurtAlly(p.damage);remove=true;}
    else if(!p.targetAlly&&p.pos.distanceTo(state.player.pos)<1.35){hurtPlayer(p.damage);remove=true;}
    if(remove){scene.remove(p.mesh);disposeWorldEffect({mesh:p.mesh,ownedMaterial:true});state.projectiles.splice(i,1);}
  }
}
function spawnCircleHazard(pos,radius,damage,delay){
  pos=pos.clone();pos.y=.05;
  const mat=new THREE.MeshBasicMaterial({color:C.red,transparent:true,opacity:.22,side:THREE.DoubleSide,blending:THREE.AdditiveBlending,depthWrite:false});
  const mesh=new THREE.Group();
  const ring=new THREE.Mesh(new THREE.TorusGeometry(radius*.84,.075,7,42),mat);ring.rotation.x=-Math.PI/2;
  const core=new THREE.Mesh(new THREE.CylinderGeometry(radius*.12,radius*.28,.08,10),mat);core.position.y=.03;
  const inner=new THREE.Mesh(new THREE.TorusGeometry(radius*.46,.035,6,28),mat);inner.rotation.x=-Math.PI/2;inner.position.y=.045;
  mesh.add(ring,core,inner);mesh.position.copy(pos);mesh.userData.hazardMaterial=mat;scene.add(mesh);
  state.hazards.push({mesh,type:"circle",pos,radius,damage,time:delay,total:delay,material:mat});
}
function spawnLineHazard(from,to,delay,damage){
  const dir=to.clone().sub(from);dir.y=0;dir.normalize();const len=42;
  const mat=new THREE.MeshBasicMaterial({color:C.red,transparent:true,opacity:.2,side:THREE.DoubleSide,blending:THREE.AdditiveBlending,depthWrite:false});
  const mesh=new THREE.Group();
  const beam=new THREE.Mesh(new THREE.BoxGeometry(2.9,.075,len),mat);beam.position.z=len/2;
  const core=new THREE.Mesh(new THREE.CylinderGeometry(.18,.4,.12,10),mat);core.rotation.x=Math.PI/2;core.position.z=.35;
  mesh.add(beam,core);mesh.position.copy(from);mesh.position.y=.06;mesh.rotation.y=Math.atan2(dir.x,dir.z);mesh.userData.hazardMaterial=mat;scene.add(mesh);
  state.hazards.push({mesh,type:"line",pos:from.clone(),dir,len,width:1.45,damage,time:delay,total:delay,material:mat});
}
function updateHazards(dt){
  for(let i=state.hazards.length-1;i>=0;i--){
    const h=state.hazards[i];h.time-=dt;h.material.opacity=.14+.3*(1-h.time/h.total);
    if(h.time<=0){
      if(h.type==="circle"&&dist2D(state.player.pos,h.pos)<h.radius)hurtPlayer(h.damage);
      if(h.type==="line"){
        const rel=state.player.pos.clone().sub(h.pos);rel.y=0;const along=rel.dot(h.dir);
        const perp=rel.clone().addScaledVector(h.dir,-along).length();
        if(along>0&&along<h.len&&perp<h.width)hurtPlayer(h.damage);
      }
      spawnImpactBurst(h.type==="circle"?h.pos:state.player.pos,C.red,{heavy:true,radius:h.type==="circle"?Math.min(h.radius,3):1.4});
      scene.remove(h.mesh);disposeWorldEffect({mesh:h.mesh,ownedMaterial:true});state.hazards.splice(i,1);
    }
  }
}
function createEnergyProjectile(color,heavy=false){
  const root=new THREE.Group();root.userData.energySpin=0;
  const coreMat=new THREE.MeshBasicMaterial({color,transparent:true,opacity:.96,blending:THREE.AdditiveBlending,depthWrite:false});
  const shellMat=new THREE.MeshBasicMaterial({color:0xfff0bd,transparent:true,opacity:.55,blending:THREE.AdditiveBlending,depthWrite:false});
  const core=new THREE.Mesh(new THREE.IcosahedronGeometry(heavy?.34:.2,1),coreMat);
  const shell=new THREE.Mesh(new THREE.TorusGeometry(heavy?.48:.3,.045,6,16),shellMat);shell.rotation.y=Math.PI/2;
  const trailMat=new THREE.MeshBasicMaterial({color,transparent:true,opacity:.5,blending:THREE.AdditiveBlending,depthWrite:false});
  const trail=new THREE.Mesh(new THREE.ConeGeometry(heavy?.2:.12,heavy?1.15:.72,8),trailMat);trail.rotation.x=Math.PI/2;trail.position.z=heavy?-.72:-.46;
  root.add(core,shell,trail);root.userData.rocket=heavy;return root;
}
function spawnMuzzleFlash(pos,dir,color,radius=1){
  const p=pos.clone().addScaledVector(dir,.24);p.y=Math.max(.2,p.y);
  spawnImpactBurst(p,color,{radius:radius*.42,heavy:false,y:p.y});
}
function spawnMeleeArc(pos,dir,color,size=1){
  const mat=new THREE.MeshPhysicalMaterial({color,emissive:color,emissiveIntensity:.6,roughness:.25,transparent:true,opacity:.83,side:THREE.DoubleSide,depthWrite:false});
  const arc=new THREE.Mesh(new THREE.TorusGeometry(size*.78,.16,8,26,Math.PI*1.22),mat);
  arc.position.copy(pos).add(new THREE.Vector3(0,1.45,0));arc.rotation.set(Math.PI/2,Math.atan2(dir.x,dir.z),0);
  addWorldEffect(arc,.34,"custom",{ownedMaterial:true,update:f=>{const q=1-f.time/f.total;f.mesh.scale.setScalar(.45+q*1.35);f.mesh.material.opacity=.92*(1-q);f.mesh.rotation.z+=.7*.016;}});
  spawnAttackFlare(pos,dir,color,size);
}
function spawnAttackFlare(pos,dir,color,power=1){
  const root=new THREE.Group();root.position.copy(pos);root.position.y+=1.5;
  root.rotation.y=Math.atan2(dir.x,dir.z);
  const colors=[color,0xffaa42,0xd84530,0xffd16a];
  for(let i=0;i<4;i++){
    const material=new THREE.MeshStandardMaterial({color:colors[i],emissive:colors[i],emissiveIntensity:1.65,
      roughness:.34,transparent:true,opacity:.83,depthWrite:false,side:THREE.DoubleSide});
    const flame=new THREE.Mesh(flameSculpture(power*(.54+i*.09)),material);
    const angle=(i/4)*Math.PI*1.65-Math.PI*.8;
    flame.position.set(Math.cos(angle)*.48*power,Math.sin(angle)*.38*power,-.35-i*.06);
    flame.rotation.z=angle-Math.PI/2;flame.rotation.x=.28;
    root.add(flame);
  }
  const shock=new THREE.Mesh(new THREE.TorusGeometry(.73*power,.19*power,9,28,Math.PI*1.8),
    new THREE.MeshStandardMaterial({color,emissive:color,emissiveIntensity:1.2,roughness:.22,transparent:true,opacity:.72,depthWrite:false}));
  shock.rotation.x=.36;root.add(shock);
  addWorldEffect(root,.48,"custom",{ownedMaterial:true,update:f=>{
    const q=1-f.time/f.total;
    f.mesh.scale.setScalar(.55+q*1.8);
    f.mesh.position.y=pos.y+1.5+q*.28;
    f.mesh.traverse(n=>{if(n.isMesh)n.material.opacity=(1-q)*.83;});
  }});
}
function spawnSkillCharge(pos,color,kind="generic"){
  const root=new THREE.Group();root.position.copy(pos);root.position.y+=kind.startsWith("boss")?1.8:1.05;
  const coreMat=new THREE.MeshBasicMaterial({color,transparent:true,opacity:.9,blending:THREE.AdditiveBlending,depthWrite:false});
  const haloMat=new THREE.MeshBasicMaterial({color:0xfff3cc,transparent:true,opacity:.42,blending:THREE.AdditiveBlending,depthWrite:false});
  const core=new THREE.Mesh(new THREE.OctahedronGeometry(kind.startsWith("boss")?.5:.32,1),coreMat);
  const ringA=new THREE.Mesh(new THREE.TorusGeometry(kind.startsWith("boss")?.78:.52,.13,8,24),haloMat);ringA.rotation.x=Math.PI/2;
  const ringB=new THREE.Mesh(new THREE.TorusGeometry(kind.startsWith("boss")?.63:.4,.1,8,20),coreMat);ringB.rotation.y=Math.PI/2;
  root.add(core,ringA,ringB);scene.add(root);
  const total=kind.startsWith("boss")?.76:.56;
  addWorldEffect(root,total,"custom",{ownedMaterial:true,update:f=>{const q=1-f.time/f.total;const pulse=.82+Math.sin(q*Math.PI*4)*.18;f.mesh.scale.setScalar((.45+q*.72)*pulse);f.mesh.rotation.y+=dtSafe(.015);f.mesh.rotation.x+=dtSafe(.009);f.mesh.traverse(node=>{if(node.material)node.material.opacity=(1-q)*(.36+q*.64);});}});
}
function dtSafe(value){return value;}
function spawnEnergyColumn(pos,color,height=4){
  const mat=new THREE.MeshBasicMaterial({color,transparent:true,opacity:.5,side:THREE.DoubleSide,blending:THREE.AdditiveBlending,depthWrite:false});
  const column=new THREE.Mesh(new THREE.CylinderGeometry(.16,.72,height,10,1,true),mat);column.position.copy(pos);column.position.y=height*.5+.08;
  addWorldEffect(column,.72,"custom",{ownedMaterial:true,update:f=>{const q=1-f.time/f.total;f.mesh.scale.set(1+q*.5,Math.sin(Math.PI*q)*1.25+0.2,1+q*.5);f.mesh.material.opacity=.52*(1-q);f.mesh.rotation.y+=.035;}});
}
function spawnImpactBurst(pos,color,options={}){
  const heavy=!!options.heavy,radius=options.radius??(heavy?2.2:1.15),y=options.y??.16;
  const ringMat=new THREE.MeshBasicMaterial({color,transparent:true,opacity:.92,side:THREE.DoubleSide,blending:THREE.AdditiveBlending,depthWrite:false});
  const ring=new THREE.Mesh(new THREE.TorusGeometry(radius*.2,.07,7,32),ringMat);ring.rotation.x=-Math.PI/2;ring.position.set(pos.x,y,pos.z);
  addWorldEffect(ring,heavy?.62:.4,"custom",{ownedMaterial:true,update:f=>{const q=1-f.time/f.total;f.mesh.scale.setScalar(.35+q*(heavy?3.2:2.15));f.mesh.material.opacity=.95*(1-q);}});
  const coreMat=new THREE.MeshBasicMaterial({color:0xfff2c4,transparent:true,opacity:.96,blending:THREE.AdditiveBlending,depthWrite:false});
  const core=new THREE.Mesh(new THREE.IcosahedronGeometry(heavy?.28:.18,1),coreMat);core.position.set(pos.x,y+(heavy?.18:.1),pos.z);
  addWorldEffect(core,heavy?.38:.25,"custom",{ownedMaterial:true,update:f=>{const q=1-f.time/f.total;f.mesh.scale.setScalar((1-q)*(.4+q*2.3));f.mesh.material.opacity=.96*(1-q);f.mesh.rotation.x+=.16;f.mesh.rotation.z+=.12;}});
  const count=heavy?7:4;
  for(let i=0;i<count;i++){
    const shard=new THREE.Mesh(new THREE.TetrahedronGeometry(.08+Math.random()*.11,0),toon(i%3?color:0xfff0bd,color));
    shard.position.set(pos.x+(Math.random()-.5)*.25,y+Math.random()*.55,pos.z+(Math.random()-.5)*.25);
    const v=new THREE.Vector3(Math.random()-.5,Math.random()*.8+.25,Math.random()-.5).normalize().multiplyScalar((heavy?4.2:2.8)+Math.random()*2.2);
    addWorldEffect(shard,.45+Math.random()*.25,"velocity",{ownedMaterial:false,vel:v});
  }
  if(heavy){
    spawnAttackFlare(new THREE.Vector3(pos.x,0,pos.z),new THREE.Vector3(0,0,1),color,Math.min(2.1,radius*.42));
    const outer=new THREE.Mesh(new THREE.TorusGeometry(radius*.68,.055,7,36),ringMat.clone());outer.rotation.x=-Math.PI/2;outer.position.set(pos.x,y+.03,pos.z);
    addWorldEffect(outer,.82,"custom",{ownedMaterial:true,update:f=>{const q=1-f.time/f.total;f.mesh.scale.setScalar(.25+q*1.65);f.mesh.material.opacity=.7*(1-q);}});
    spawnEnergyColumn(new THREE.Vector3(pos.x,0,pos.z),color,Math.min(6,radius*1.7));
  }
}
function pulse(pos,color,radius){
  const ringMat=new THREE.MeshBasicMaterial({color,transparent:true,opacity:.86,side:THREE.DoubleSide,depthWrite:false});
  const m=new THREE.Mesh(new THREE.RingGeometry(.5,.72,32),ringMat);
  m.rotation.x=-Math.PI/2;m.position.copy(pos);m.position.y=.12;scene.add(m);
  pushWorldEffect({mesh:m,time:.55,total:.55,radius,ownedMaterial:true});
  const core=new THREE.Mesh(new THREE.RingGeometry(.16,.32,24),new THREE.MeshBasicMaterial({
    color:0xffffff,transparent:true,opacity:.92,side:THREE.DoubleSide,depthWrite:false
  }));
  core.rotation.x=-Math.PI/2;core.position.copy(pos);core.position.y=.135;scene.add(core);
  pushWorldEffect({mesh:core,time:.32,total:.32,radius:radius*.68,ownedMaterial:true});
}
function burst(pos,color,count){
  for(let i=0;i<count;i++){
    const size=.1+Math.random()*.16;
    const m=new THREE.Mesh(new THREE.TetrahedronGeometry(size,0),toon(i%4===0?0xffffff:color,color));
    m.position.copy(pos).add(new THREE.Vector3(0,1.7+Math.random()*.8,0));m.scale.y=1.8+Math.random()*2.4;scene.add(m);
    const v=new THREE.Vector3(Math.random()-.5,Math.random()*.85+.2,Math.random()-.5).normalize().multiplyScalar(5+Math.random()*5);
    pushWorldEffect({mesh:m,time:.6+Math.random()*.35,total:1,vel:v,ownedMaterial:false});
  }
}
function updateEffects(dt){
  for(let i=state.effects.length-1;i>=0;i--){
    const f=state.effects[i];f.time-=dt;
    const q=1-clamp(f.time/f.total,0,1);
    if(f.update)f.update(f,dt,q);
    else if(f.giant){f.mesh.position.y=7*(1-clamp((f.total-f.time)/.75,0,1));}
    else if(f.vel){f.mesh.position.addScaledVector(f.vel,dt);f.vel.y-=9*dt;f.mesh.rotation.x+=dt*8;}
    else{f.mesh.scale.setScalar(1+q*(f.radius||1));if(f.mesh.material)f.mesh.material.opacity=(f.baseOpacity??1)*(1-q);}
    if(f.time<=0){scene.remove(f.mesh);disposeWorldEffect(f);state.effects.splice(i,1);}
  }
}

function spawnDefenseWave(){
  const lanes=[-23,0,23];const lane=lanes[Math.floor(Math.random()*lanes.length)];
  for(let i=0;i<3;i++)spawnEnemy(Math.random()<.24?"gun":Math.random()<.3?"shield":"sword",lane+(i-1)*2.4,38+Math.random()*7);
}
function updatePhase(dt){
  const p=state.player;
  if(state.phase==="assault"){
    const at=dist2D(p.pos,state.captureMesh.position)<5.2;
    const blockers=state.enemies.filter(e=>!e.dead&&dist2D(e.pos,state.captureMesh.position)<7).length;
    if(at&&blockers===0)state.capture=clamp(state.capture+dt,0,8);
    else if(!at)state.capture=clamp(state.capture-dt*.15,0,8);
    if(state.capture>=8){
      state.phase="boss";ui.capture.classList.add("hidden");spawnBoss();
    }
  }else if(state.phase==="defense"){
    state.defense-=dt;state.waveClock-=dt;
    if(state.waveClock<=0){state.waveClock=4.8;spawnDefenseWave();}
    if(state.defense<=0){
      state.phase="exit";state.exitMarker.visible=true;toast("正门已开启，立即撤离！",2200);
    }
  }else if(state.phase==="exit"){
    state.gateOpen=clamp(state.gateOpen+dt,0,1);
    state.gate.children[0].position.x=-3.2-state.gateOpen*6;state.gate.children[1].position.x=3.2+state.gateOpen*6;
    if(p.pos.z<-58&&Math.abs(p.pos.x)<7)finish(true);
  }
  state.captureMesh.rotation.y+=dt*.6;
}
function updateUI(){
  const p=state.player;
  ui.hp.style.width=(100*p.hp/p.maxHp)+"%";ui.hpText.textContent=Math.max(0,Math.ceil(p.hp))+" / "+p.maxHp;
  ui.stamina.style.width=p.stamina+"%";ui.haki.style.width=p.haki+"%";
  ui.combo.textContent=state.combo>1?"连击 × "+state.combo:"";ui.kills.textContent="击败 "+state.kills;
  if(state.phase==="assault"){
    const blockers=state.enemies.filter(e=>!e.dead&&dist2D(e.pos,state.captureMesh.position)<7).length;
    ui.objective.textContent=state.capture>0?(blockers?"清除据点内敌人":"正在占领据点"):"突破防线 · 占领金色据点";
    ui.captureFill.style.width=(state.capture/8*100)+"%";ui.captureText.textContent=state.capture.toFixed(1)+" / 8 秒";
  }else if(state.phase==="boss")ui.objective.textContent="首领战 · 躲开红色预警并发动反击";
  else if(state.phase==="defense")ui.objective.textContent="保护盟友 · 坚守 "+Math.ceil(state.defense)+" 秒";
  else ui.objective.textContent="正门开启 · 穿过绿色撤离点";
  if(state.boss){
    const percent=Math.max(0,Math.ceil(state.boss.hp/state.boss.maxHp*100));
    ui.bossFill.style.width=percent+"%";
    ui.bossText.textContent=Math.max(0,Math.ceil(state.boss.hp))+" / "+state.boss.maxHp+` · ${percent}% · ${state.boss.phase2?"狂暴阶段":"第一阶段"}`;
  }
  const target=state.lockedTarget;
  ui.targetWrap.classList.toggle("hidden",!target);
  ui.crosshair?.classList.toggle("locked",!!target);
  if(target){
    ui.targetName.textContent=(ENEMY_NAMES[target.type]||"敌人")+" · "+Math.max(0,Math.ceil(target.hp))+"/"+target.maxHp;
    ui.targetDistance.textContent="距离 "+dist2D(target.pos,state.player.pos).toFixed(1)+"米";
  }
  document.querySelectorAll("[data-cd]").forEach(el=>{
    const key=el.dataset.cd,v=p.cooldowns[key];const span=el.querySelector(".cd");
    if(span)span.textContent=v>0?Math.ceil(v):(key==="ultimate"&&p.charge<100?Math.floor(p.charge)+"%":"");
    el.classList.toggle("cooling",v>0||(key==="ultimate"&&p.charge<100));
  });
  const summonButton=document.querySelector('[data-action="summon"]');
  if(summonButton){
    const remaining=Math.max(0,...state.companions.filter(c=>!c.dead).map(c=>c.life));
    summonButton.classList.toggle("active",remaining>0);
    const label=summonButton.querySelector("small");
    if(label)label.textContent=remaining>0?`支援 ${Math.ceil(remaining)}秒`:"12秒支援";
  }
  drawRadar();
}
function drawRadar(){
  const c=ui.radar,ctx=c.getContext("2d"),w=c.width,h=c.height;ctx.clearRect(0,0,w,h);
  ctx.fillStyle="rgba(9,30,45,.72)";ctx.beginPath();ctx.arc(w/2,h/2,w/2-2,0,Math.PI*2);ctx.fill();
  ctx.strokeStyle="#82d7e6";ctx.lineWidth=2;ctx.stroke();
  const sc=.72,px=w/2,pz=h/2;
  function dot(x,z,color,r){ctx.fillStyle=color;ctx.beginPath();ctx.arc(px+(x-state.player.pos.x)*sc,pz+(z-state.player.pos.z)*sc,r,0,Math.PI*2);ctx.fill();}
  state.enemies.forEach(e=>{if(!e.dead)dot(e.pos.x,e.pos.z,e.type==="boss"?"#ffc34b":"#ff6255",e.type==="boss"?4:2.5);});
  state.companions.forEach(c=>{if(!c.dead)dot(c.pos.x,c.pos.z,"#72efbf",2.8);});
  dot(state.captureMesh.position.x,state.captureMesh.position.z,"#ffd65b",3);if(state.ally)dot(state.ally.pos.x,state.ally.pos.z,"#4fe0cb",3);
  dot(state.player.pos.x,state.player.pos.z,"#fff",3.5);
  ctx.strokeStyle="#fff";ctx.beginPath();ctx.moveTo(px,pz);ctx.lineTo(px+Math.sin(state.yaw)*9,pz-Math.cos(state.yaw)*9);ctx.stroke();
}
let toastTimer;
function toast(msg,ms=1200){ui.toast.textContent=msg;ui.toast.classList.add("show");clearTimeout(toastTimer);toastTimer=setTimeout(()=>ui.toast.classList.remove("show"),ms);}
function damageNumber(pos,n,heavy){
  const el=document.createElement("span");el.className="damage"+(heavy?" heavy":"");el.textContent=n;
  const v=pos.clone().add(new THREE.Vector3((Math.random()-.5)*.6,3.8,0)).project(camera);
  el.style.left=((v.x*.5+.5)*100)+"%";el.style.top=((-v.y*.5+.5)*100)+"%";
  $("damageLayer").appendChild(el);setTimeout(()=>el.remove(),650);
}

function bindControls(){
  addEventListener("resize",()=>{camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();renderer.setSize(innerWidth,innerHeight);renderer.setPixelRatio(Math.min(devicePixelRatio||1,1.65));});
  addEventListener("keydown",e=>{
    state.keys[e.code]=true;
    if(e.code==="KeyJ")attack();if(e.code==="KeyK")beginDodge();if(e.code==="KeyU")skill1();
    if(e.code==="KeyI")skill2();if(e.code==="KeyO")skill3();if(e.code==="KeyL")summonCompanions();if(e.code==="Space"){e.preventDefault();useHaki();}
    if(e.code==="Escape"&&state.active)togglePause();
  });
  addEventListener("keyup",e=>state.keys[e.code]=false);
  canvas.addEventListener("click",()=>{if(state.active&&!state.paused&&matchMedia("(pointer:fine)").matches)canvas.requestPointerLock?.();});
  addEventListener("mousemove",e=>{if(document.pointerLockElement===canvas){state.yaw-=e.movementX*.0023;state.pitch=clamp(state.pitch-e.movementY*.002,-1.05,1.0);}});
  addEventListener("mousedown",e=>{if(e.button===0&&document.pointerLockElement===canvas)attack();});
  addEventListener("contextmenu",e=>e.preventDefault());

  const useTouch=("ontouchstart" in window)||(navigator.maxTouchPoints||0)>0;
  let joyId=null,joyRect=null;
  const updateJoyPoint=(clientX,clientY)=>{
    if(!joyRect)return;
    const cx=joyRect.left+joyRect.width/2,cy=joyRect.top+joyRect.height/2;
    let dx=clientX-cx,dy=clientY-cy;const radius=joyRect.width*.38,length=Math.hypot(dx,dy);
    if(length>radius){dx*=radius/length;dy*=radius/length;}
    const rawX=dx/radius,rawY=dy/radius,magnitude=Math.hypot(rawX,rawY),dead=.1;
    const strength=magnitude>dead?Math.min(1,(magnitude-dead)/(1-dead)):0;
    state.joy.x=magnitude>dead?rawX/magnitude*strength:0;
    state.joy.y=magnitude>dead?rawY/magnitude*strength:0;
    ui.stick.style.transform="translate("+dx+"px,"+dy+"px)";
  };
  const resetJoy=()=>{joyId=null;joyRect=null;state.joy.x=0;state.joy.y=0;ui.stick.style.transform="translate(0,0)";};

  let lookId=null,lx=0,ly=0;
  const updateLookPoint=(clientX,clientY)=>{
    const dx=clientX-lx,dy=clientY-ly;lx=clientX;ly=clientY;
    state.yaw-=dx*.006;state.pitch=clamp(state.pitch-dy*.005,-1.05,1);
  };
  const resetLook=()=>{lookId=null;};

  if(useTouch){
    // A single document-level router keeps the two fingers independent on Android.
    // Left touch = movement; right touch = camera. No element-local touch state is shared.
    const touchById=(touches,id)=>Array.from(touches).find(t=>t.identifier===id);
    const isActionTarget=target=>target?.closest?.("[data-action],#viewBtn,#pauseBtn,#startBtn,#restartBtn");
    const onTouchStart=e=>{
      let handled=false;
      for(const t of Array.from(e.changedTouches)){
        // TouchEvent.target is shared by the event; use each Touch.target so
        // a simultaneous button press cannot swallow the other finger.
        if(isActionTarget(t.target))continue;
        // Give an element an explicit owner first, then use non-overlapping
        // screen bands as the fallback.  The old 40–48% overlap let Android
        // classify a right-hand look touch as a second movement touch.
        const touchTarget=t.target?.closest?.("#joystick,#lookZone");
        const targetId=touchTarget?.id;
        const onJoystick=targetId==="joystick";
        const onLookZone=targetId==="lookZone";
        const inMoveZone=onJoystick||(!onLookZone&&t.clientX<innerWidth*.42&&t.clientY>innerHeight*.30);
        const inLookZone=onLookZone||(!onJoystick&&t.clientX>=innerWidth*.46&&t.clientY>innerHeight*.12);
        if(joyId===null&&inMoveZone){
          joyId=t.identifier;joyRect=ui.joystick.getBoundingClientRect();
          updateJoyPoint(t.clientX,t.clientY);handled=true;
        }else if(lookId===null&&inLookZone){
          lookId=t.identifier;lx=t.clientX;ly=t.clientY;handled=true;
        }
      }
      if(handled)e.preventDefault();
    };
    const onTouchMove=e=>{
      let handled=false;
      const joyTouch=joyId===null?null:touchById(e.touches,joyId);
      const lookTouch=lookId===null?null:touchById(e.touches,lookId);
      if(joyTouch){updateJoyPoint(joyTouch.clientX,joyTouch.clientY);handled=true;}
      if(lookTouch){updateLookPoint(lookTouch.clientX,lookTouch.clientY);handled=true;}
      if(handled)e.preventDefault();
    };
    const onTouchEnd=e=>{
      let handled=false;
      if(joyId!==null&&touchById(e.changedTouches,joyId)){resetJoy();handled=true;}
      if(lookId!==null&&touchById(e.changedTouches,lookId)){resetLook();handled=true;}
      if(handled)e.preventDefault();
    };
    document.addEventListener("touchstart",onTouchStart,{passive:false});
    document.addEventListener("touchmove",onTouchMove,{passive:false});
    document.addEventListener("touchend",onTouchEnd,{passive:false});
    document.addEventListener("touchcancel",onTouchEnd,{passive:false});
  }else{
    ui.joystick.addEventListener("pointerdown",e=>{
      joyId=e.pointerId;joyRect=ui.joystick.getBoundingClientRect();ui.joystick.setPointerCapture(e.pointerId);
      updateJoyPoint(e.clientX,e.clientY);e.preventDefault();
    });
    ui.joystick.addEventListener("pointermove",e=>{if(e.pointerId===joyId){updateJoyPoint(e.clientX,e.clientY);e.preventDefault();}});
    const endJoyPointer=e=>{if(e.pointerId===joyId)resetJoy();};
    ui.joystick.addEventListener("pointerup",endJoyPointer);ui.joystick.addEventListener("pointercancel",endJoyPointer);
    ui.joystick.addEventListener("lostpointercapture",endJoyPointer);

    ui.lookZone.addEventListener("pointerdown",e=>{
      lookId=e.pointerId;lx=e.clientX;ly=e.clientY;ui.lookZone.setPointerCapture(e.pointerId);e.preventDefault();
    });
    ui.lookZone.addEventListener("pointermove",e=>{if(e.pointerId===lookId){updateLookPoint(e.clientX,e.clientY);e.preventDefault();}});
    const endLookPointer=e=>{if(e.pointerId===lookId)resetLook();};
    ui.lookZone.addEventListener("pointerup",endLookPointer);ui.lookZone.addEventListener("pointercancel",endLookPointer);
  }

  document.querySelectorAll("[data-action]").forEach(b=>b.addEventListener("pointerdown",e=>{
    e.preventDefault();e.stopPropagation();({attack, dodge:beginDodge,s1:skill1,s2:skill2,s3:skill3,s4:skill4,s5:skill5,ultimate,haki:useHaki,summon:summonCompanions}[b.dataset.action])();
  }));
  ui.startBtn.addEventListener("click",startGame);ui.restartBtn.addEventListener("click",startGame);
  ui.pauseBtn.addEventListener("click",togglePause);
  ui.viewBtn.addEventListener("click",()=>{state.mode=state.mode==="first"?"top":"first";ui.viewBtn.textContent=state.mode==="first"?"第一视角":"第三视角";toast(state.mode==="first"?"已切换第一视角":"已切换第三视角",700);});
}
function togglePause(){if(!state.active)return;state.paused=!state.paused;ui.pauseBtn.textContent=state.paused?"继续":"暂停";toast(state.paused?"战斗暂停":"继续战斗",700);if(state.paused)document.exitPointerLock?.();}

bindControls();
function animate(){
  const dt=Math.min(clock.getDelta(),.035);
  if(state.active&&!state.paused){
    state.time+=dt;updateEnvironment(dt);updatePlayer(dt);updateCombat(dt);updateEnemies(dt);updateTargetLock(dt);updateAlly(dt);updateCompanions(dt);animateActors(dt);updateProjectiles(dt);updateHazards(dt);updateEffects(dt);updateFirstPersonEffects(dt);updatePhase(dt);updateUI();
  }else if(!state.active){
    camera.position.lerp(new THREE.Vector3(15,15,35),.04);camera.lookAt(0,2,-12);
    state.captureMesh.rotation.y+=dt*.3;
  }
  renderer.render(scene,camera);
  if(modelTestStatus&&state.active){
    modelTestFrames++;
    const now=performance.now(),elapsed=now-modelTestLastTime;
    if(elapsed>=1000){
      const fps=Math.round(modelTestFrames*1000/elapsed);
      modelTestStatus.textContent=`${modelTestMessage} · ${fps}帧/秒${state.mode==="first"?" · 第一视角隐藏身体":""}`;
      modelTestFrames=0;modelTestLastTime=now;
    }
  }
}
renderer.setAnimationLoop(animate);
if("serviceWorker" in navigator){
  navigator.serviceWorker.getRegistrations().then(registrations=>Promise.all(registrations.map(registration=>registration.unregister()))).catch(()=>{});
}
if("caches" in window)caches.keys().then(keys=>Promise.all(keys.map(key=>caches.delete(key)))).catch(()=>{});
