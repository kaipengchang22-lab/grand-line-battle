import * as THREE from "https://cdn.jsdelivr.net/npm/three@0.166.1/build/three.module.js";
import { GLTFLoader } from "https://cdn.jsdelivr.net/npm/three@0.166.1/examples/jsm/loaders/GLTFLoader.js";
import { FBXLoader } from "https://cdn.jsdelivr.net/npm/three@0.166.1/examples/jsm/loaders/FBXLoader.js";
import { clone as cloneSkeleton } from "https://cdn.jsdelivr.net/npm/three@0.166.1/examples/jsm/utils/SkeletonUtils.js";

const $ = (id) => document.getElementById(id);
const canvas = $("gameCanvas");
const ui = {
  start: $("startScreen"), startBtn: $("startBtn"), hud: $("hud"), objective: $("objectiveText"),
  hp: $("hpFill"), hpText: $("hpText"), stamina: $("staminaFill"), haki: $("hakiFill"),
  combo: $("combo"), kills: $("kills"), bossWrap: $("bossWrap"), bossFill: $("bossFill"),
  bossText: $("bossText"), capture: $("captureWrap"), captureFill: $("captureFill"),
  captureText: $("captureText"), toast: $("toast"), redFlash: $("redFlash"),
  result: $("resultScreen"), resultTitle: $("resultTitle"), resultStats: $("resultStats"),
  restartBtn: $("restartBtn"), pauseBtn: $("pauseBtn"), viewBtn: $("viewBtn"),
  radar: $("radar"), joystick: $("joystick"), stick: $("stick"), lookZone: $("lookZone"),
  targetWrap: $("targetWrap"), targetName: $("targetName"), targetDistance: $("targetDistance"),
  crosshair: document.querySelector(".crosshair"), impactFlash: $("impactFlash")
};

const renderer = new THREE.WebGLRenderer({canvas, antialias:true, alpha:false, powerPreference:"high-performance"});
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.65));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.08;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x9fd5e4);
scene.fog = new THREE.Fog(0x9fd5e4, 48, 125);
const camera = new THREE.PerspectiveCamera(72, innerWidth/innerHeight, 0.08, 180);
camera.rotation.order = "YXZ";
scene.add(camera);

const clock = new THREE.Clock();
const world = new THREE.Group();
scene.add(world);

const C = {
  ink:0x122b3b, ice:0xbfeaf2, ice2:0x79c8d8, orange:0xff7547, red:0xe94444,
  navy:0x153b66, marine:0xe8f3f4, blue:0x2a6fbb, gold:0xffc74d, skin:0xf2b38c,
  skin2:0xb96f50, brown:0x623a2c, black:0x111924, green:0x35c48d, purple:0x7d57d1
};
const SKY_CLEAR=new THREE.Color(0x9fd5e4),SKY_STORM=new THREE.Color(0x526779);
const mats = new Map();
// Film Red is now the production default. The previous GLBs remain available
// through ?model=original and ?model=rigged-luffy for regression testing.
const playerModelChoice=new URLSearchParams(location.search).get("model")||"film-red";
const PLAYER_3D_ASSET={
  "film-red":{
    type:"fbx",url:"./assets/models/film-red-luffy/luffy022_body_model.fbx?v=47",
    textureRoot:"./assets/models/film-red-luffy/",scale:1.35,y:.56,orientation:0,
    label:"路飞 Film Red · 32,549面 · 6个蒙皮网格"
  },
  original:{type:"gltf",url:"./assets/models/straw-hat-hero-original.glb?v=3",scale:1.85,y:0,orientation:0,label:"旧版测试主角"},
  "rigged-luffy":{
    type:"gltf",url:"./assets/models/luffy-semirealistic-rigged-animated.glb?v=1",scale:.78,y:.663,
    // This GLB faces -Z; the existing sprite root faces +Z.
    orientation:Math.PI,label:"半写实测试路飞"
  }
}[playerModelChoice]||null;
const modelTestStatus=PLAYER_3D_ASSET?document.createElement("div"):null;
if(modelTestStatus){
  modelTestStatus.id="modelTestStatus";
  modelTestStatus.textContent="3D模型加载中…";
  ui.hud.append(modelTestStatus);
}
let modelTestMessage=(PLAYER_3D_ASSET?.label||"3D模型")+" · 加载中…";
let modelTestFrames=0,modelTestLastTime=performance.now();
const playerSpriteTexture=new THREE.TextureLoader().load("./assets/luffy-sprite-atlas.webp");
playerSpriteTexture.colorSpace=THREE.SRGBColorSpace;
playerSpriteTexture.wrapS=playerSpriteTexture.wrapT=THREE.RepeatWrapping;
playerSpriteTexture.repeat.set(.25,.25);
playerSpriteTexture.offset.set(0,.75);
playerSpriteTexture.magFilter=THREE.LinearFilter;
playerSpriteTexture.minFilter=THREE.LinearMipmapLinearFilter;
playerSpriteTexture.anisotropy=Math.min(8,renderer.capabilities.getMaxAnisotropy());
// Infantry no longer uses the old 2D atlas.  Every enemy role resolves to a
// real FBX from the uploaded model library below.
const MARINE_ANIM_CLIPS={
  saberAttack:{hitAt:.5},
  rifleFire:{hitAt:.46}
};
const PLAYER_SPRITE_ANIMS={
  idle:{row:0,fps:5,loop:true},walk:{row:1,fps:9,loop:true},
  attack:{row:2,fps:12,loop:false},hurt:{row:3,fps:10,loop:false}
};
// Camera actions drive the same 3D Film Red skeleton as the world character.
const FIRST_PERSON_ACTIONS={
  basic:{duration:.32},combo:{duration:.92},rocketPunch:{duration:.64},burst:{duration:.82},
  axe:{duration:.74},rocket:{duration:.62},giant:{duration:1.18},haki:{duration:.86},dodge:{duration:.28},summon:{duration:.72}
};
const toonRamp=new THREE.DataTexture(new Uint8Array([42,105,185,255]),4,1,THREE.RedFormat);
toonRamp.minFilter=THREE.NearestFilter;toonRamp.magFilter=THREE.NearestFilter;toonRamp.needsUpdate=true;
const inkMaterial=new THREE.MeshBasicMaterial({color:C.ink,side:THREE.BackSide});
function toon(color, emissive=0x000000, opacity=1) {
  const key = color+"-"+emissive+"-"+opacity;
  if (!mats.has(key)) mats.set(key, new THREE.MeshToonMaterial({
    color, emissive, emissiveIntensity: emissive ? .55 : 0, transparent:opacity<1,
    opacity, flatShading:true, gradientMap:toonRamp
  }));
  return mats.get(key);
}
function standard(color, rough=.82, metal=.06) {
  return new THREE.MeshStandardMaterial({color, roughness:rough, metalness:metal, flatShading:true});
}
function add(parent, geo, mat, x=0,y=0,z=0, rx=0,ry=0,rz=0) {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x,y,z); m.rotation.set(rx,ry,rz);
  m.castShadow = true; m.receiveShadow = true; parent.add(m); return m;
}
function addModelOutlines(root,scale=1.035){
  const targets=[];
  root.traverse(m=>{
    if(!m.isMesh||m.material?.transparent||m.geometry?.type==="PlaneGeometry")return;
    m.geometry.computeBoundingBox();
    const size=new THREE.Vector3();m.geometry.boundingBox.getSize(size);
    if(Math.max(size.x,size.y,size.z)>.34)targets.push(m);
  });
  targets.forEach(m=>{
    const edge=new THREE.Mesh(m.geometry,inkMaterial);
    edge.scale.setScalar(scale);edge.castShadow=false;edge.receiveShadow=false;edge.raycast=()=>{};
    m.add(edge);
  });
}
function makeIceTexture(){
  const canvas=document.createElement("canvas");canvas.width=canvas.height=512;
  const ctx=canvas.getContext("2d");
  const grad=ctx.createLinearGradient(0,0,512,512);
  grad.addColorStop(0,"#d9f7fb");grad.addColorStop(.52,"#b9e8f0");grad.addColorStop(1,"#87cbd8");
  ctx.fillStyle=grad;ctx.fillRect(0,0,512,512);
  for(let i=0;i<95;i++){
    const x=(i*83)%512,y=(i*137)%512,r=3+(i%9);
    ctx.fillStyle=i%3?"rgba(255,255,255,.16)":"rgba(35,123,148,.10)";
    ctx.beginPath();ctx.ellipse(x,y,r*2,r,0,0,Math.PI*2);ctx.fill();
  }
  ctx.lineCap="round";
  for(let i=0;i<24;i++){
    let x=(i*97)%512,y=(i*61)%512;
    ctx.strokeStyle=i%2?"rgba(34,120,145,.30)":"rgba(255,255,255,.42)";
    ctx.lineWidth=i%2?2:1;ctx.beginPath();ctx.moveTo(x,y);
    for(let n=0;n<4;n++){x+=18+((i+n)*13)%38;y+=(((i+n)*29)%45)-22;ctx.lineTo(x,y);}
    ctx.stroke();
  }
  const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;
  texture.wrapS=texture.wrapT=THREE.RepeatWrapping;texture.repeat.set(4,7);
  texture.anisotropy=Math.min(4,renderer.capabilities.getMaxAnisotropy());return texture;
}
function seeded(n) { return ((Math.sin(n*999.41)*43758.5453)%1+1)%1; }
function dist2D(a,b){ const dx=a.x-b.x, dz=a.z-b.z; return Math.hypot(dx,dz); }
function clamp(v,a,b){ return Math.max(a,Math.min(b,v)); }

// World effects are deliberately geometry-first: low-poly cores, rings,
// cones and fragments give the attacks volume without introducing more image
// textures or a large post-processing pipeline on Android.
const WORLD_EFFECT_LIMIT=90;
function disposeWorldEffect(effect){
  const root=effect?.mesh;if(!root)return;
  root.traverse?.(node=>{
    if(node.geometry)node.geometry.dispose();
    if(effect.ownedMaterial&&node.material){
      const materials=Array.isArray(node.material)?node.material:[node.material];
      materials.forEach(material=>material?.dispose?.());
    }
  });
}
function pushWorldEffect(effect){
  while(state.effects.length>=WORLD_EFFECT_LIMIT){
    const old=state.effects.shift();scene.remove(old.mesh);disposeWorldEffect(old);
  }
  state.effects.push(effect);return effect;
}
function addWorldEffect(mesh,total=.5,kind="fade",options={}){
  if(!mesh.parent)scene.add(mesh);
  const material=mesh.material;
  return pushWorldEffect({mesh,time:total,total,kind,ownedMaterial:options.ownedMaterial??true,
    baseOpacity:material?.opacity??1,baseScale:mesh.scale.clone(),...options});
}
function triggerImpactFlash(strong=false){
  if(!ui.impactFlash)return;
  ui.impactFlash.classList.remove("hit");
  void ui.impactFlash.offsetWidth;
  ui.impactFlash.classList.toggle("strong",strong);
  ui.impactFlash.classList.add("hit");
}

const state = {
  active:false, paused:false, mode:"top", phase:"assault", time:0, capture:0, defense:30,
  waveClock:0, kills:0, combo:0, comboTimer:0, score:0, yaw:0, pitch:-.04,
  player:{pos:new THREE.Vector3(0,1.7,40), hp:300,maxHp:300, stamina:100,haki:30,
    speed:9.2, cooldowns:{attack:0,dodge:0,s1:0,s2:0,s3:0,s4:0,s5:0,ultimate:0,haki:0,summon:0}, dodge:0, invuln:0, guardTimer:0,
    buff:0, attackAnim:0, hurtAnim:0, fpAction:null, fpActionTime:0, fpActionDuration:0},
  enemies:[], projectiles:[], hazards:[], effects:[], fpEffects:[], ally:null, companions:[],summonToken:0,boss:null,
  lockedTarget:null,targetRing:null,targetHold:0,
  keys:{}, joy:{x:0,y:0}, shake:0, gateOpen:0, nextId:1
};

// Runtime-ready Spine data for the player.  The renderer keeps the existing
// high-resolution action atlas as a safe visual fallback, while this asset
// drives the visible cutout rig's bone timelines as soon as the JSON/atlas
// pair has loaded.  That lets us ship a real Spine pack without risking a
// blank scene if a mobile browser is offline during startup.
const LuffySpineAsset={
  json:"./assets/spine/luffy/luffy.json",
  atlas:"./assets/spine/luffy/luffy.atlas",
  image:"./assets/spine/luffy/luffy-parts.webp"
};
function spineAnimationDurations(data){
  const durations={};
  for(const [name,anim] of Object.entries(data?.animations||{})){
    let max=0;
    for(const bone of Object.values(anim?.bones||{})){
      for(const frames of Object.values(bone||{})){
        for(const frame of frames||[])max=Math.max(max,Number(frame?.time)||0);
      }
    }
    durations[name]=Math.max(.01,max);
  }
  return durations;
}
async function loadLuffySpineAsset(){
  try{
    const [jsonResponse,atlasResponse,imageResponse]=await Promise.all([fetch(LuffySpineAsset.json),fetch(LuffySpineAsset.atlas),fetch(LuffySpineAsset.image)]);
    if(!jsonResponse.ok||!atlasResponse.ok||!imageResponse.ok)throw new Error(`HTTP ${jsonResponse.status}/${atlasResponse.status}/${imageResponse.status}`);
    const data=await jsonResponse.json(),atlas=await atlasResponse.text();
    if(!data?.bones||!data?.slots||!data?.skins||!data?.animations)throw new Error("invalid Spine skeleton data");
    state.playerModel.userData.spineAsset={ready:true,data,atlas,image:LuffySpineAsset.image,animations:Object.keys(data.animations),durations:spineAnimationDurations(data),current:"idle",time:0};
    new THREE.TextureLoader().load(LuffySpineAsset.image,texture=>{
      texture.colorSpace=THREE.SRGBColorSpace;texture.magFilter=THREE.LinearFilter;texture.minFilter=THREE.LinearMipmapLinearFilter;
      state.playerModel.userData.spineAsset.texture=texture;
      // Keep the complete action atlas visible: this experimental cutout sheet
      // is retained as source data but is not yet production-aligned.
    },undefined,error=>console.warn("[Spine] Luffy attachment image fallback:",error));
  }catch(error){
    console.warn("[Spine] Luffy asset fallback:",error);
  }
}
function spineTimedValue(frames,time,key,fallback=0){
  if(!Array.isArray(frames)||!frames.length)return fallback;
  if(frames.length===1||time<=Number(frames[0].time||0))return Number(frames[0][key]??fallback);
  for(let i=1;i<frames.length;i++){
    const next=frames[i],prev=frames[i-1],t0=Number(prev.time||0),t1=Number(next.time||0);
    if(time<=t1){
      const q=t1>t0?clamp((time-t0)/(t1-t0),0,1):1;
      const eased=prev.curve&&Array.isArray(prev.curve)&&prev.curve.length===4?q:q;
      return Number(prev[key]??fallback)+(Number(next[key]??fallback)-Number(prev[key]??fallback))*eased;
    }
  }
  return Number(frames[frames.length-1][key]??fallback);
}
function applyLuffySpineAnimation(root,name,time){
  const asset=root?.userData?.spineAsset,rig=root?.userData?.spineRig,anim=asset?.data?.animations?.[name];
  if(!asset?.ready||!rig||!anim)return;
  const duration=asset.durations[name]||1,t=((time%duration)+duration)%duration;
  for(const [boneName,timelines] of Object.entries(anim.bones||{})){
    const bone=rig.bones[boneName];if(!bone)continue;
    const rotate=timelines.rotate;
    if(rotate)bone.rotation.z+=THREE.MathUtils.degToRad(spineTimedValue(rotate,t,"angle",0));
    const translate=timelines.translate;
    if(translate){bone.position.x+=spineTimedValue(translate,t,"x",0)*.02;bone.position.y+=spineTimedValue(translate,t,"y",0)*.02;}
    const scale=timelines.scale;
    if(scale){bone.scale.x*=spineTimedValue(scale,t,"x",1);bone.scale.y*=spineTimedValue(scale,t,"y",1);}
  }
  asset.current=name;asset.time=t;
}

const audio = {
  ctx:null,
  start(){
    if(!this.ctx) this.ctx = new (window.AudioContext||window.webkitAudioContext)();
    if(this.ctx.state==="suspended") this.ctx.resume();
  },
  tone(freq=180,dur=.07,type="square",gain=.035){
    if(!this.ctx) return;
    const o=this.ctx.createOscillator(), g=this.ctx.createGain();
    o.type=type; o.frequency.setValueAtTime(freq,this.ctx.currentTime);
    o.frequency.exponentialRampToValueAtTime(Math.max(40,freq*.62),this.ctx.currentTime+dur);
    g.gain.setValueAtTime(gain,this.ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(.001,this.ctx.currentTime+dur);
    o.connect(g).connect(this.ctx.destination); o.start(); o.stop(this.ctx.currentTime+dur);
  }
};

// A thin, irregular sheet of moving water. The foam is drawn from animated
// noise inside the wave itself, so there is no white rectangular decal.
function makeSurfPatch(width){
  const geometry=new THREE.PlaneGeometry(width,4.2,18,8);
  geometry.rotateX(-Math.PI/2);
  const material=new THREE.ShaderMaterial({
    uniforms:{uTime:{value:0},uArrival:{value:0},uOpacity:{value:0}},
    vertexShader:`
      uniform float uTime,uArrival;
      varying vec2 vUv;
      void main(){
        vUv=uv;
        vec3 p=position;
        float crest=exp(-pow((uv.y-.65)*4.8,2.0));
        float ripple=sin(uv.x*34.0+uTime*2.1)*.06+sin(uv.x*67.0-uTime*1.3)*.035;
        p.y=.045+uArrival*crest*(.23+ripple);
        gl_Position=projectionMatrix*modelViewMatrix*vec4(p,1.0);
      }`,
    fragmentShader:`
      precision highp float;
      uniform float uTime,uOpacity;
      varying vec2 vUv;
      float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
      float noise(vec2 p){
        vec2 i=floor(p),f=fract(p);f=f*f*(3.0-2.0*f);
        return mix(mix(hash(i),hash(i+vec2(1.,0.)),f.x),
                   mix(hash(i+vec2(0.,1.)),hash(i+vec2(1.,1.)),f.x),f.y);
      }
      void main(){
        float n=.55*noise(vUv*vec2(48.,12.)+vec2(uTime*.13,-uTime*.27))+
                .3*noise(vUv*vec2(96.,27.)-vec2(uTime*.42,uTime*.19))+
                .15*noise(vUv*vec2(182.,59.)+uTime*.09);
        float scallop=.035*sin(vUv.x*39.+uTime*.75)+.022*sin(vUv.x*87.-uTime*.5);
        float longitudinal=smoothstep(.03,.16,vUv.y+scallop)*(1.-smoothstep(.81,.99,vUv.y+scallop));
        float sides=smoothstep(.0,.11,vUv.x)*(1.-smoothstep(.89,1.,vUv.x));
        float crest=exp(-pow((vUv.y-.67+scallop)*5.8,2.));
        float lace=crest*smoothstep(.37,.72,n);
        vec3 sea=mix(vec3(.045,.29,.41),vec3(.20,.62,.67),.35+n*.55);
        vec3 color=mix(sea,vec3(.69,.88,.85),lace*.82);
        float alpha=uOpacity*longitudinal*sides*(.38+.18*n+.33*lace);
        if(alpha<.012)discard;
        gl_FragColor=vec4(color,alpha);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
    transparent:true,depthWrite:false,side:THREE.DoubleSide
  });
  const mesh=new THREE.Mesh(geometry,material);
  mesh.frustumCulled=false;mesh.renderOrder=2;
  return mesh;
}
function buildWorld(){
  const hemi = new THREE.HemisphereLight(0xeafcff,0x31526d,2.25); scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xfff4d4,3.0);
  sun.position.set(-28,45,30); sun.castShadow=true;
  sun.shadow.mapSize.set(1024,1024); sun.shadow.camera.left=-55; sun.shadow.camera.right=55;
  sun.shadow.camera.top=70; sun.shadow.camera.bottom=-70; sun.shadow.bias=-.0008; scene.add(sun);
  const rim=new THREE.DirectionalLight(0x7cccf4,.72);rim.position.set(36,22,-44);scene.add(rim);
  const fortressLamp=new THREE.PointLight(0xffb04d,1.8,38,2);fortressLamp.position.set(0,10,-61);scene.add(fortressLamp);

  const seaGeometry=new THREE.PlaneGeometry(180,210,54,64);
  const seaColors=[],seaPosition=seaGeometry.attributes.position;
  const deep=new THREE.Color(0x155271),shallow=new THREE.Color(0x4caab7);
  for(let i=0;i<seaPosition.count;i++){
    const x=Math.abs(seaPosition.getX(i)),z=seaPosition.getY(i)-12;
    const distance=Math.min(Math.abs(x-42),Math.abs(Math.abs(z+5)-63));
    const color=deep.clone().lerp(shallow,clamp(1-distance/22,0,1)*.75);
    seaColors.push(color.r,color.g,color.b);
  }
  seaGeometry.setAttribute("color",new THREE.Float32BufferAttribute(seaColors,3));
  const seaMaterial=new THREE.MeshPhysicalMaterial({color:0xffffff,vertexColors:true,roughness:.31,metalness:.08,clearcoat:.6,clearcoatRoughness:.25,side:THREE.DoubleSide});
  const sea=add(world,seaGeometry,seaMaterial,0,-.42,-12,-Math.PI/2);
  sea.receiveShadow=false;
  const iceMaterial=standard(C.ice,.76,.025);iceMaterial.map=makeIceTexture();
  const ice=add(world,new THREE.PlaneGeometry(82,126,12,16),iceMaterial,0,0,-5,-Math.PI/2);
  ice.receiveShadow=true;

  for(let i=0;i<32;i++){
    const x=(seeded(i*3.1)*2-1)*37, z=(seeded(i*7.7+4)*2-1)*58-4;
    const pts=[new THREE.Vector3(x,.022,z),new THREE.Vector3(x+(seeded(i+8)*2-1)*4,.024,z-2.5),
      new THREE.Vector3(x+(seeded(i+19)*2-1)*7,.022,z-6)];
    const line=new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts),
      new THREE.LineBasicMaterial({color:0x5eb0c4,transparent:true,opacity:.55}));
    world.add(line);
  }
  for(let i=0;i<20;i++){
    const x=(seeded(300+i)*2-1)*37,z=(seeded(360+i)*2-1)*57-4,r=.32+seeded(420+i)*.7;
    const facet=add(world,new THREE.CylinderGeometry(r,r*.92,.08,6),toon(i%2?0xd8f7fb:0x8bd4df),x,.045,z,0,seeded(480+i)*Math.PI,0);
    facet.scale.z=.55+seeded(520+i)*.5;facet.castShadow=true;facet.receiveShadow=true;
  }

  const quayMat=standard(0x73909a,.9,.02);
  add(world,new THREE.BoxGeometry(5,2.5,126),quayMat,-43,-.1,-5);
  add(world,new THREE.BoxGeometry(5,2.5,126),quayMat,43,-.1,-5);
  for(const side of [-1,1]){
    add(world,new THREE.BoxGeometry(.42,.18,124),toon(0x9bbbc1),side*40.45,1.22,-5);
    for(let i=0;i<10;i++)add(world,new THREE.CylinderGeometry(.18,.24,.8,8),toon(0x4d6671),side*40.35,.38,51-i*12);
  }
  const shoreBreakers=[];
  // Surf washes onto the two open ice ends. At the walled sides it hits the
  // outside of the quay, never passing through the stone into the arena.
  for(const side of [-1,1])for(let i=0;i<7;i++){
    const breaker=makeSurfPatch(12);
    breaker.position.set(-36+i*12,.035,side>0?61:-71);
    breaker.userData={edge:"open",side,phase:i*.11+(side>0?.27:0)};
    world.add(breaker);shoreBreakers.push(breaker);
  }
  for(const side of [-1,1])for(let i=0;i<8;i++){
    const breaker=makeSurfPatch(16);
    breaker.rotation.y=Math.PI/2;
    breaker.position.set(side*48,.035,-57+i*15);
    breaker.userData={edge:"wall",side,phase:i*.13+(side>0?.18:0)};
    world.add(breaker);shoreBreakers.push(breaker);
  }
  const shoreCount=112,surfMesh=new THREE.InstancedMesh(new THREE.IcosahedronGeometry(.095,1),
    new THREE.MeshPhysicalMaterial({color:0x9adfe8,emissive:0x194553,emissiveIntensity:.35,roughness:.25,transparent:true,opacity:.78,depthWrite:false}),shoreCount);
  const sprayDummy=new THREE.Object3D();sprayDummy.scale.setScalar(0);sprayDummy.updateMatrix();
  for(let i=0;i<shoreCount;i++)surfMesh.setMatrixAt(i,sprayDummy.matrix);
  surfMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  surfMesh.frustumCulled=false;world.add(surfMesh);
  const shoreSpray=Array.from({length:shoreCount},(_,i)=>({age:seeded(9400+i)*1.8,life:.65+seeded(9600+i)*.65,
    pos:new THREE.Vector3(),vel:new THREE.Vector3(),edge:i%4}));
  const weatherDrops=makeRainField(190);world.add(weatherDrops.mesh);
  const cloudMesh=makeCloudBank();world.add(cloudMesh);
  const gulls=makeGullFlock();gulls.forEach(g=>world.add(g));
  const vegetation=makeVegetation();vegetation.forEach(o=>world.add(o));
  const cannons=[];
  for(const side of [-1,1])for(const z of [-39,-4,31])cannons.push(makeCannon(side*36.4,z,side));
  cannons.forEach(o=>world.add(o));

  const wall=toon(0xb5cbd0);
  add(world,new THREE.BoxGeometry(82,9,5),wall,0,4.5,-67);
  add(world,new THREE.BoxGeometry(15,17,10),wall,-27,8,-66);
  add(world,new THREE.BoxGeometry(15,17,10),wall,27,8,-66);
  add(world,new THREE.CylinderGeometry(10,13,6,8),toon(0x8caeb7),0,11,-70);
  const emblem=add(world,new THREE.TorusGeometry(3.2,.55,8,24),toon(C.gold),0,11,-64.75,Math.PI/2);
  emblem.castShadow=false;
  for(const x of [-32,32])createFortressTower(x);

  // Layered naval fortress silhouette: keep the central battle lane clear.
  const stone=toon(0x89aab6),edge=toon(0xd2e4e5),shade=toon(0x355668);
  for(const side of [-1,1]){
    const x=side*24;
    add(world,new THREE.BoxGeometry(16,4,12),stone,x,10,-72);
    add(world,new THREE.BoxGeometry(18,.8,13),edge,x,12.4,-72);
    add(world,new THREE.BoxGeometry(11,10,8),stone,side*22,18,-74);
    add(world,new THREE.CylinderGeometry(6.1,7.2,1.3,8),shade,side*22,23.5,-74);
    for(let j=0;j<4;j++){
      const bx=x+(j-1.5)*4;
      add(world,new THREE.BoxGeometry(2.3,1.5,2.4),edge,bx,13.3,-66.3);
      add(world,new THREE.BoxGeometry(1.2,2.7,.2),shade,bx,9.4,-65.85);
    }
    for(let j=0;j<3;j++){
      const bx=side*(16+j*5);
      add(world,new THREE.BoxGeometry(1.1,6,3),shade,bx,3,-63.4);
      add(world,new THREE.BoxGeometry(1.8,.6,3.5),edge,bx,6.1,-63.3);
    }
  }
  add(world,new THREE.BoxGeometry(17,2,7),stone,0,17,-68);
  add(world,new THREE.BoxGeometry(18,.75,8),edge,0,18.4,-68);
  for(let j=-3;j<=3;j++)add(world,new THREE.BoxGeometry(1.6,1.6,2),edge,j*2.5,19.5,-64.8);
  // Small quayside seawalls, stairs and cover create scale without blocking movement.
  for(const side of [-1,1]){
    add(world,new THREE.BoxGeometry(1.3,1.4,48),stone,side*38,0.4,-30);
    for(let j=0;j<4;j++){
      add(world,new THREE.BoxGeometry(3.5,.25,1.2),edge,side*31,.16,-52+j*3);
      add(world,new THREE.BoxGeometry(.9,2,1.4),shade,side*39,1.4,-48+j*13);
    }
  }

  state.gate = new THREE.Group(); state.gate.position.set(0,0,-64.2); world.add(state.gate);
  add(state.gate,new THREE.BoxGeometry(6.3,10,.9),toon(0x365062),-3.2,5,0);
  add(state.gate,new THREE.BoxGeometry(6.3,10,.9),toon(0x365062),3.2,5,0);

  for(let i=0;i<16;i++){
    const side=i%2?-1:1, x=side*(14+(i%4)*7), z=43-Math.floor(i/2)*14;
    createCrate(x,z,i%3===0);
  }
  for(let i=0;i<6;i++) createFlag(i%2?-36:36,32-i*18,i%2?C.navy:C.orange);
  createShip(-62,-35,.75); createShip(63,4,-.7); createShip(-65,35,.25);

  state.captureMesh=new THREE.Group(); state.captureMesh.position.set(0,.08,-24); world.add(state.captureMesh);
  add(state.captureMesh,new THREE.TorusGeometry(5,.22,10,48),toon(C.gold,C.gold),0,.05,0,Math.PI/2);
  const beam=add(state.captureMesh,new THREE.CylinderGeometry(.35,2.8,10,16,1,true),
    new THREE.MeshBasicMaterial({color:C.gold,transparent:true,opacity:.12,side:THREE.DoubleSide}),0,5,0);
  beam.castShadow=false;

  state.exitMarker=new THREE.Group(); state.exitMarker.position.set(0,0,-60); state.exitMarker.visible=false; world.add(state.exitMarker);
  add(state.exitMarker,new THREE.TorusGeometry(4,.32,10,32),toon(C.green,C.green),0,.16,0,Math.PI/2);

  // Fortress façade layers and ice ridges add depth without large texture downloads.
  for(let i=-3;i<=3;i++){
    add(world,new THREE.BoxGeometry(7.5,1.3,.35),toon(i%2?0x8fb2bd:0x6f95a3),i*10,6.4,-64.3);
    add(world,new THREE.BoxGeometry(1.1,2.1,.45),toon(0x294d63),i*10,6.4,-64.05);
  }
  for(let i=0;i<18;i++){
    const x=(seeded(600+i)*2-1)*38,z=(seeded(720+i)*2-1)*58-4;
    add(world,new THREE.TetrahedronGeometry(.35+seeded(800+i)*.75,0),toon(i%3?0xd8f7fb:0x75c8d8),x,.18,z,0,seeded(910+i)*Math.PI,0);
  }
  world.userData.environment={sea,shoreBreakers,shoreSpray,surfMesh,sprayDummy,weatherDrops,cloudMesh,gulls,
    hemi,sun,rim,fortressLamp,cannons,weatherClock:0};
}

function makeRainField(count){
  const geometry=new THREE.BufferGeometry(),positions=new Float32Array(count*2*3);
  geometry.setAttribute("position",new THREE.BufferAttribute(positions,3));
  const mesh=new THREE.LineSegments(geometry,new THREE.LineBasicMaterial({color:0xc0e9f2,transparent:true,opacity:.36,depthWrite:false}));
  mesh.frustumCulled=false;mesh.visible=false;return {mesh,count,positions};
}
function makeCloudBank(){
  const geometry=new THREE.SphereGeometry(1,8,6),material=new THREE.MeshStandardMaterial({color:0xf2f5f3,roughness:1,flatShading:true});
  const mesh=new THREE.InstancedMesh(geometry,material,24);mesh.frustumCulled=false;mesh.userData.base=[];
  const dummy=new THREE.Object3D();
  for(let i=0;i<24;i++){
    const x=(seeded(9700+i)*2-1)*70,z=-64+seeded(9800+i)*125,y=18+seeded(9900+i)*11;
    const scale=new THREE.Vector3(4+seeded(10000+i)*7,1.1+seeded(10100+i)*1.8,2.6+seeded(10200+i)*5);
    dummy.position.set(x,y,z);dummy.scale.copy(scale);dummy.updateMatrix();mesh.setMatrixAt(i,dummy.matrix);mesh.userData.base.push({x,y,z,scale});
  }
  mesh.instanceMatrix.needsUpdate=true;mesh.visible=false;return mesh;
}
function makeGullFlock(){
  const result=[],wingGeo=new THREE.BufferGeometry();
  wingGeo.setAttribute("position",new THREE.Float32BufferAttribute([0,0,0,.62,.12,0,1.35,0,.02,0,0,0,1.35,0,.02,.62,.08,.08],3));
  wingGeo.computeVertexNormals();
  const wingMat=new THREE.MeshBasicMaterial({color:0xe9f3f2,side:THREE.DoubleSide});
  for(let i=0;i<5;i++){
    const bird=new THREE.Group(),body=new THREE.Mesh(new THREE.SphereGeometry(.16,7,5),wingMat);
    body.scale.set(1,.45,.65);bird.add(body);
    const left=new THREE.Group(),right=new THREE.Group();left.position.x=-.08;right.position.x=.08;right.scale.x=-1;
    left.add(new THREE.Mesh(wingGeo,wingMat));right.add(new THREE.Mesh(wingGeo,wingMat));bird.add(left,right);
    bird.userData={left,right,phase:seeded(10300+i)*Math.PI*2,radius:22+seeded(10400+i)*24,height:13+seeded(10500+i)*9,speed:.035+seeded(10600+i)*.025};
    bird.traverse(n=>{if(n.isMesh){n.castShadow=false;n.frustumCulled=false;}});result.push(bird);
  }
  return result;
}
function makeVegetation(){
  const count=38,trunk=new THREE.InstancedMesh(new THREE.CylinderGeometry(.09,.14,1,5),toon(0x66503a),count);
  const canopy=new THREE.InstancedMesh(new THREE.ConeGeometry(.68,1.15,6),toon(0x397a53),count*2);
  const shrub=new THREE.InstancedMesh(new THREE.IcosahedronGeometry(.48,0),toon(0x4d9360),count);
  const planter=new THREE.InstancedMesh(new THREE.CylinderGeometry(.65,.79,.28,7),toon(0x55656a),count);
  const dummy=new THREE.Object3D();let leaf=0;
  for(let i=0;i<count;i++){
    const side=i%2?1:-1;let z=52-(i*2.83)%108;
    if([-39,-4,31].some(cannonZ=>Math.abs(z-cannonZ)<3.4))z+=4.1;
    const x=side*(34.2+seeded(10700+i)*3.8),h=1.5+seeded(10800+i)*2.1;
    dummy.rotation.y=seeded(10900+i)*6;
    dummy.position.set(x,.14,z);dummy.scale.set(h*.72,1,h*.72);dummy.updateMatrix();planter.setMatrixAt(i,dummy.matrix);
    dummy.position.set(x,h*.29+.28,z);dummy.scale.set(h*.9,h*.58,h*.9);dummy.updateMatrix();trunk.setMatrixAt(i,dummy.matrix);
    for(let tier=0;tier<2;tier++){
      dummy.position.set(x,h*(.63+tier*.27)+.28,z);dummy.scale.setScalar(h*(.75-tier*.17));dummy.updateMatrix();canopy.setMatrixAt(leaf++,dummy.matrix);
    }
    dummy.position.set(x+side*.55,.39,z+.8);dummy.scale.set(h*.36,h*.25,h*.33);dummy.updateMatrix();shrub.setMatrixAt(i,dummy.matrix);
  }
  for(const mesh of [trunk,canopy,shrub,planter]){mesh.instanceMatrix.needsUpdate=true;mesh.castShadow=false;mesh.receiveShadow=false;}
  return [trunk,canopy,shrub,planter];
}
function makeCannon(x,z,side){
  const root=new THREE.Group();root.position.set(x,0,z);root.rotation.y=-side*Math.PI/2;
  const bronze=standard(0x48545a,.56,.48),iron=standard(0x26323a,.5,.65),stone=toon(0x65757a);
  add(root,new THREE.CylinderGeometry(1.45,1.8,.52,8),stone,0,.26,0);
  add(root,new THREE.BoxGeometry(1.35,.66,2.15),toon(0x553d30),0,.82,0);
  for(const sideSign of [-1,1])add(root,new THREE.CylinderGeometry(.53,.53,.25,10),iron,sideSign*.82,.46,0,0,0,Math.PI/2);
  const barrel=new THREE.Group();barrel.position.set(0,1.18,-.12);barrel.rotation.x=Math.PI/2;root.add(barrel);
  add(barrel,new THREE.CylinderGeometry(.36,.48,2.7,10),bronze,0,1.05,0);
  add(barrel,new THREE.TorusGeometry(.37,.08,6,12),iron,0,2.34,0,Math.PI/2);
  const muzzle=add(barrel,new THREE.CylinderGeometry(.29,.34,.12,10),iron,0,2.42,0);muzzle.material.side=THREE.DoubleSide;
  root.traverse(n=>{if(n.isMesh)n.castShadow=n.receiveShadow=false;});return root;
}

function createFortressTower(x){
  const g=new THREE.Group();g.position.set(x,0,-63.5);world.add(g);
  add(g,new THREE.CylinderGeometry(3.3,3.8,10,10),toon(0x8daeb8),0,5,0);
  add(g,new THREE.CylinderGeometry(3.8,3.8,.7,10),toon(0x607f8b),0,10.1,0);
  add(g,new THREE.ConeGeometry(4.1,2.7,10),toon(0x31586c),0,11.8,0);
  for(let i=0;i<5;i++){
    const window=add(g,new THREE.BoxGeometry(.62,1.18,.08),new THREE.MeshBasicMaterial({color:0xffcf70,transparent:true,opacity:.82}),
      Math.cos(i*Math.PI*2/5)*2.9,6.0,Math.sin(i*Math.PI*2/5)*2.9,0,-i*Math.PI*2/5,0);
    window.castShadow=false;window.receiveShadow=false;
  }
  const lamp=new THREE.PointLight(0xffb34f,.5,10,2);lamp.position.set(0,7,2.6);g.add(lamp);
}

function createCrate(x,z,barrel){
  const g=new THREE.Group(); g.position.set(x,0,z); world.add(g);
  if(barrel){
    add(g,new THREE.CylinderGeometry(1.15,1.15,2.5,10),toon(0x8b5436),0,1.25,0);
    add(g,new THREE.TorusGeometry(1.17,.1,6,16),toon(C.ink),0,.65,0,Math.PI/2);
    add(g,new THREE.TorusGeometry(1.17,.1,6,16),toon(C.ink),0,1.85,0,Math.PI/2);
  }else{
    add(g,new THREE.BoxGeometry(2.4,2.4,2.4),toon(0xa86a3f),0,1.2,0);
    add(g,new THREE.BoxGeometry(2.55,.17,.18),toon(0x5f3929),0,1.2,1.24,0,0,.7);
    add(g,new THREE.BoxGeometry(2.55,.17,.18),toon(0x5f3929),0,1.2,1.25,0,0,-.7);
  }
}
function createFlag(x,z,color){
  const g=new THREE.Group(); g.position.set(x,0,z); world.add(g);
  add(g,new THREE.CylinderGeometry(.1,.13,8,8),toon(C.ink),0,4,0);
  const f=add(g,new THREE.PlaneGeometry(3.5,2),toon(color),1.75,6.8,0,0,0,0); f.material.side=THREE.DoubleSide;
}
function createShip(x,z,rot){
  const g=new THREE.Group(); g.position.set(x,-.2,z); g.rotation.y=rot; world.add(g);
  add(g,new THREE.BoxGeometry(14,2.8,4),toon(0x4b302c),0,1.2,0);
  add(g,new THREE.CylinderGeometry(.16,.22,12,8),toon(0x303743),0,7,0);
  const sail=add(g,new THREE.PlaneGeometry(7,6),toon(0xe9ddd0),0,8,0); sail.material.side=THREE.DoubleSide;
}
function updateEnvironment(dt){
  const env=world.userData.environment;if(!env)return;
  env.weatherClock=(env.weatherClock+dt)%94;
  const smooth=q=>{q=clamp(q,0,1);return q*q*(3-2*q);};
  const overcast=Math.max(smooth((env.weatherClock-37)/10)*(1-smooth((env.weatherClock-73)/8)),0);
  const rain=smooth((env.weatherClock-58)/9)*(1-smooth((env.weatherClock-80)/10));
  const storm=clamp(overcast*.55+rain*.55,0,.78);
  scene.background.copy(SKY_CLEAR).lerp(SKY_STORM,storm);
  scene.fog.color.copy(scene.background);
  env.hemi.intensity=2.25-storm*.95;env.sun.intensity=3-storm*1.65;env.rim.intensity=.72-storm*.4;
  env.sun.color.setHex(rain>0.2?0xb8c9d8:0xfff0ce);
  env.cloudMesh.visible=overcast>.03;
  env.cloudMesh.material.color.setHex(rain>.2?0x8998a3:0xd5e0e0);
  env.weatherDrops.mesh.visible=rain>.04;
  env.weatherDrops.mesh.material.opacity=.36*rain;
  if(env.weatherDrops.mesh.visible){
    const p=env.weatherDrops.positions;
    for(let i=0;i<env.weatherDrops.count;i++){
      const x=(seeded(i*3.7)*2-1)*72+Math.sin(state.time*.7)*1.8,z=(seeded(i*8.1+22)*2-1)*74-5;
      const y=22-((state.time*24+seeded(i*11.3)*34)%34),j=i*6;
      p[j]=x;p[j+1]=y;p[j+2]=z;p[j+3]=x-.32;p[j+4]=y-1.05;p[j+5]=z+.16;
    }
    env.weatherDrops.mesh.geometry.attributes.position.needsUpdate=true;
  }
  env.cloudMesh.position.x=Math.sin(state.time*.012)*3.4;
  env.gulls.forEach((bird,i)=>{
    const b=bird.userData,t=state.time*b.speed+b.phase;
    bird.position.set(Math.cos(t)*b.radius,b.height+Math.sin(t*2.1)*.65,Math.sin(t)*b.radius-8);
    bird.rotation.y=t+Math.PI/2;b.left.rotation.z=Math.sin(state.time*8+b.phase)*.5;
    b.right.rotation.z=-b.left.rotation.z;
  });
  const ocean=env.sea.geometry.attributes.position;
  for(let i=0;i<ocean.count;i++){
    const x=ocean.getX(i),z=ocean.getY(i),t=state.time;
    ocean.setZ(i,Math.sin(x*.115+z*.035+t*1.25)*.18+Math.sin(z*.17-x*.046-t*1.72)*.1);
  }
  ocean.needsUpdate=true;
  env.normalTimer=(env.normalTimer||0)+dt;
  if(env.normalTimer>.12){env.sea.geometry.computeVertexNormals();env.normalTimer=0;}
  env.shoreBreakers?.forEach((breaker,i)=>{
    const travel=(state.time*.31+breaker.userData.phase)%1,arrival=Math.sin(Math.PI*travel);
    if(breaker.userData.edge==="open"){
      breaker.position.z=breaker.userData.side>0?61-5.6*travel:-71+5.6*travel;
    }else breaker.position.x=breaker.userData.side*(48-2.25*travel);
    breaker.visible=arrival>.07;
    breaker.material.uniforms.uTime.value=state.time+i*.41;
    breaker.material.uniforms.uArrival.value=arrival;
    breaker.material.uniforms.uOpacity.value=Math.pow(Math.max(0,arrival),1.3)*.9;
  });
  const spray=env.shoreSpray,dummy=env.sprayDummy;
  spray.forEach((particle,i)=>{
    particle.age+=dt;
    if(particle.age>=particle.life){
      const pulse=Math.max(0,Math.sin(state.time*1.7+particle.edge*1.7));
      if(pulse<.45){dummy.scale.setScalar(0);dummy.updateMatrix();env.surfMesh.setMatrixAt(i,dummy.matrix);return;}
      particle.age=0;particle.life=.5+seeded(state.time*7+i*19)*.72;
      const edge=particle.edge;
      particle.pos.set((seeded(i*3+Math.floor(state.time*1.8))*2-1)*38,.09,(edge===0?57.2:edge===1?-67.2:(seeded(i*5)*2-1)*118-5));
      if(edge>1)particle.pos.set(edge===2?-45.8:45.8,.45,(seeded(i*3+Math.floor(state.time*1.8))*2-1)*116-5);
      particle.vel.set((seeded(i*13+state.time)*2-1)*.65,(edge>1?1.9:.9)+seeded(i*17)*1.35,(edge===0?.8:edge===1?-.8:0));
    }
    particle.pos.addScaledVector(particle.vel,dt);particle.vel.y-=2.7*dt;
    const q=particle.age/particle.life;
    dummy.position.copy(particle.pos);
    dummy.scale.setScalar(Math.max(.05,Math.sin(Math.PI*q))*(.55+seeded(i*6.1)*.9));
    dummy.updateMatrix();env.surfMesh.setMatrixAt(i,dummy.matrix);
  });
  env.surfMesh.instanceMatrix.needsUpdate=true;
  if(env.fortressLamp)env.fortressLamp.intensity=1.65+Math.sin(state.time*1.6)*.18;
}

function createMarineModel(type,boss=false){
  const g=new THREE.Group();
  const scale=boss?1.55:(type==="captain"?1.18:1);
  const uniform=type==="shield"?0xd9e5e8:(boss?0xf0e7d0:C.marine);
  add(g,new THREE.CylinderGeometry(.42,.5,.75,8),toon(C.black),-.42,.4,0);
  add(g,new THREE.CylinderGeometry(.42,.5,.75,8),toon(C.black),.42,.4,0);
  add(g,new THREE.CylinderGeometry(.34,.38,1.35,8),toon(0x315c82),-.38,1.35,0);
  add(g,new THREE.CylinderGeometry(.34,.38,1.35,8),toon(0x315c82),.38,1.35,0);
  add(g,new THREE.CylinderGeometry(.85,1.02,1.8,8),toon(uniform),0,2.65,0);
  add(g,new THREE.BoxGeometry(1.85,.18,.18),toon(C.gold),0,2.55,.86);
  add(g,new THREE.SphereGeometry(.65,12,8),toon(boss?C.skin2:C.skin),0,4.05,0);
  add(g,new THREE.CylinderGeometry(.7,.76,.42,12),toon(C.marine),0,4.57,0);
  add(g,new THREE.BoxGeometry(1.2,.08,.72),toon(C.marine),0,4.48,.18);
  add(g,new THREE.BoxGeometry(.16,.09,.08),toon(C.ink),-.23,4.12,.59);
  add(g,new THREE.BoxGeometry(.16,.09,.08),toon(C.ink),.23,4.12,.59);
  add(g,new THREE.BoxGeometry(.42,.07,.06),toon(boss?0x5b251f:C.brown),0,3.82,.61);
  add(g,new THREE.CylinderGeometry(.25,.3,1.55,8),toon(uniform),-.95,2.78,0,0,0,-.12);
  add(g,new THREE.CylinderGeometry(.25,.3,1.55,8),toon(uniform),.95,2.78,0,0,0,.12);
  add(g,new THREE.ConeGeometry(.12,.28,7),toon(boss?C.skin2:C.skin),0,4.02,.66,Math.PI/2);
  add(g,new THREE.BoxGeometry(.33,.055,.055),toon(C.ink),-.24,4.25,.61,0,0,-.08);
  add(g,new THREE.BoxGeometry(.33,.055,.055),toon(C.ink),.24,4.25,.61,0,0,.08);
  add(g,new THREE.BoxGeometry(.62,.18,.08),toon(C.navy),-.35,3.1,.86,0,0,-.5);
  add(g,new THREE.BoxGeometry(.62,.18,.08),toon(C.navy),.35,3.1,.86,0,0,.5);
  add(g,new THREE.BoxGeometry(1.42,.19,.12),toon(C.navy),0,2.03,.84);
  add(g,new THREE.BoxGeometry(.32,.29,.14),toon(C.gold),0,2.03,.94);
  add(g,new THREE.CylinderGeometry(.28,.28,.12,8),toon(C.gold),-.83,3.47,0,0,0,Math.PI/2);
  add(g,new THREE.CylinderGeometry(.28,.28,.12,8),toon(C.gold),.83,3.47,0,0,0,Math.PI/2);
  add(g,new THREE.BoxGeometry(1.65,1.7,.12),toon(uniform),0,2.55,-.92,.08,0,0);
  add(g,new THREE.CylinderGeometry(.16,.16,.09,10),toon(C.gold),0,4.61,.71,Math.PI/2);

  if(type==="sword"||type==="captain"||boss){
    add(g,new THREE.BoxGeometry(.13,2.5,.14),toon(0xd9f3ff),1.12,2.1,.65,0,0,-.25);
    add(g,new THREE.BoxGeometry(.7,.12,.18),toon(C.gold),1.1,3.18,.64,0,0,-.25);
  }
  if(type==="gun"){
    add(g,new THREE.BoxGeometry(.28,.3,2.25),toon(0x393c43),.62,2.6,1.05,.05,0,0);
    add(g,new THREE.BoxGeometry(.42,.65,.55),toon(0x70452d),.62,2.28,.15);
  }
  if(type==="shield"){
    const s=add(g,new THREE.CylinderGeometry(1.18,1.18,.24,12),toon(0x5d88a6),-.72,2.7,.75,Math.PI/2);
    add(s,new THREE.TorusGeometry(.8,.13,8,20),toon(C.gold),0,0,-.14,Math.PI/2);
  }
  if(type==="captain"){
    add(g,new THREE.BoxGeometry(2.6,.22,1.1),toon(0xc9e5ec),0,3.46,-.34);
    add(g,new THREE.ConeGeometry(.18,.5,8),toon(C.gold),0,4.98,0);
  }
  if(boss){
    add(g,new THREE.BoxGeometry(2.8,.28,1.5),toon(0xece4cc),0,3.52,-.45);
    add(g,new THREE.CylinderGeometry(.76,.85,.25,12),toon(C.red),0,4.82,0);
    add(g,new THREE.TorusGeometry(.98,.16,8,20),toon(C.gold),0,3.1,.82);
    add(g,new THREE.BoxGeometry(.9,.5,.22),toon(C.red,C.red),0,2.55,1.02);
  }
  if(boss){
    add(g,new THREE.CylinderGeometry(.34,.42,.6,8),toon(C.red),-1.0,2.05,.15);
    add(g,new THREE.CylinderGeometry(.34,.42,.6,8),toon(C.red),1.0,2.05,.15);
    add(g,new THREE.BoxGeometry(.62,.28,.12),toon(0x3a211c),0,3.69,.62);
  }
  if(boss||type==="captain")addModelOutlines(g,boss?1.025:1.032);
  g.scale.setScalar(scale);
  return g;
}

function createPlayerModel(){
  const g=new THREE.Group();
  const rimMaterial=new THREE.SpriteMaterial({
    map:playerSpriteTexture,transparent:true,alphaTest:.02,depthTest:true,depthWrite:false,
    color:0x76dcff,toneMapped:false,opacity:.22,blending:THREE.AdditiveBlending
  });
  const rimSprite=new THREE.Sprite(rimMaterial);
  rimSprite.center.set(.5,.08);rimSprite.position.set(.08,.34,-.14);rimSprite.scale.set(5.58,5.58,1);
  rimSprite.renderOrder=2;g.add(rimSprite);
  const depthMaterial=new THREE.SpriteMaterial({
    map:playerSpriteTexture,transparent:true,alphaTest:.08,depthTest:true,depthWrite:false,
    color:0x173647,toneMapped:false,opacity:.34
  });
  const depthSprite=new THREE.Sprite(depthMaterial);
  depthSprite.center.set(.5,.08);depthSprite.position.set(-.075,.32,-.08);depthSprite.scale.set(5.52,5.52,1);
  depthSprite.renderOrder=3;g.add(depthSprite);
  const material=new THREE.SpriteMaterial({
    map:playerSpriteTexture,transparent:true,alphaTest:.08,depthTest:true,depthWrite:false,
    color:0xffffff,toneMapped:true
  });
  const sprite=new THREE.Sprite(material);
  sprite.center.set(.5,.08);sprite.position.set(0,.32,0);sprite.scale.set(5.35,5.35,1);
  sprite.renderOrder=4;g.add(sprite);
  const shadow=add(g,new THREE.CircleGeometry(.72,28),new THREE.MeshBasicMaterial({
    color:0x07131c,transparent:true,opacity:.32,depthWrite:false
  }),0,.035,0,-Math.PI/2);
  shadow.castShadow=false;shadow.receiveShadow=false;
  g.userData.sprite=sprite;g.userData.depthSprite=depthSprite;g.userData.shadow=shadow;
  g.userData.spriteAction="idle";g.userData.facing=1;
  g.userData.rimSprite=rimSprite;
  setupSpineStyleRig(g,sprite,depthSprite,rimSprite,"luffy",false);
  return g;
}

// Real 3D player pipeline ---------------------------------------------------
// A valid production GLB only needs to contain a skinned mesh and clips named
// Idle, Walk, Attack (Hurt is optional).  The gameplay state remains the
// authority; the animation mixer never moves the player in world space.
function applyFilmRedTextures(model){
  const loader=new THREE.TextureLoader();
  const cache={};
  const load=(name,color=false)=>{
    if(!cache[name]){
      cache[name]=loader.load(PLAYER_3D_ASSET.textureRoot+name);
      if(color)cache[name].colorSpace=THREE.SRGBColorSpace;
      cache[name].anisotropy=Math.min(8,renderer.capabilities.getMaxAnisotropy());
    }
    return cache[name];
  };
  model.traverse(node=>{
    if(!node.isMesh)return;
    const materials=Array.isArray(node.material)?node.material:[node.material];
    materials.forEach(material=>{
      if(!material)return;
      const key=(material.name||"").toLowerCase();
      if(key.includes("cloak")){
        material.map=load("luffy022_cloak_d.png",true);
        material.normalMap=load("luffy022_cloak_n.png");
        material.metalnessMap=load("luffy022_cloak_m.png");
      }else if(key.includes("arm")){
        material.map=load("luffy022_arm_d.png",true);
      }else{
        material.map=load("luffy022_body_d.png",true);
        material.normalMap=load("luffy022_body_n.png");
        material.metalnessMap=load("luffy022_body_m.png");
      }
      material.metalness=.08;material.roughness=.72;material.transparent=false;material.needsUpdate=true;
    });
  });
}
// Use character-space axes expressed in each bone's bind frame. FBX bone
// local X is often the limb's length axis, NOT the character's bending axis.
function characterBoneAxes(model){
  model.updateMatrixWorld(true);
  const point=name=>model.getObjectByName(name)?.getWorldPosition(new THREE.Vector3());
  const head=point("Bip001_Head"),hips=point("Bip001_Pelvis"),left=point("Bip001_L_Thigh"),right=point("Bip001_R_Thigh");
  const up=head&&hips?head.sub(hips).normalize():new THREE.Vector3(0,1,0);
  const side=left&&right?right.sub(left).normalize():new THREE.Vector3(1,0,0);
  const forward=new THREE.Vector3().crossVectors(side,up).normalize();
  side.crossVectors(up,forward).normalize();
  return [side,up,forward];
}
function bindBonePose(bone,axes){
  const inverse=bone.getWorldQuaternion(new THREE.Quaternion()).invert();
  return {bone,base:bone.quaternion.clone(),axes:axes.map(axis=>axis.clone().applyQuaternion(inverse))};
}
function turnBone(entry,x=0,y=0,z=0){
  if(!entry)return;
  const angles=[x,y,z];
  for(let i=0;i<3;i++)if(angles[i])entry.bone.quaternion.multiply(new THREE.Quaternion().setFromAxisAngle(entry.axes[i],angles[i]));
}
function setupFilmRedProceduralRig(model){
  model.updateMatrixWorld(true);
  const names={
    pelvis:"Bip001_Pelvis",spine:"Bip001_Spine",chest:"Bip001_Spine1",neck:"Bip001_Neck",head:"Bip001_Head",
    armL:"Bip001_L_UpperArm",forearmL:"Bip001_L_Forearm",armR:"Bip001_R_UpperArm",forearmR:"Bip001_R_Forearm",
    thighL:"Bip001_L_Thigh",calfL:"Bip001_L_Calf",thighR:"Bip001_R_Thigh",calfR:"Bip001_R_Calf"
  };
  const bones={},axes=characterBoneAxes(model);
  Object.entries(names).forEach(([key,name])=>{
    const bone=model.getObjectByName(name);
    if(bone)bones[key]=bindBonePose(bone,axes);
  });
  return bones;
}
function configurePlayer3D(root,model,animations=[]){
  let skinned=0,meshes=0;
  model.traverse(node=>{if(node.isMesh){meshes++;if(node.isSkinnedMesh)skinned++;node.castShadow=false;node.receiveShadow=true;
    // The export contains a detached arm accessory with invalid bind offsets.
    if(playerModelChoice==="film-red"&&node.name==="luffy022_arm02_d")node.visible=false;
  }});
  if(!skinned){
    console.warn("[Player3D] model rejected: no skinned mesh");
    modelTestMessage="Film Red 校验失败（无蒙皮网格）· 正在显示2D备用角色";return;
  }
  if(playerModelChoice==="film-red")applyFilmRedTextures(model);
  model.name=playerModelChoice==="film-red"?"Luffy_Film_Red_Character":"Luffy_GLTF_Character";
  model.rotation.order="YXZ";
  // Film Red mesh vertices are Z-up although its FBX bones report Y-up.
  // Yaw must be applied AFTER the upright correction, or the cape/head flip down.
  if(playerModelChoice==="film-red")model.rotation.x=-Math.PI/2;
  model.rotation.y=PLAYER_3D_ASSET.orientation;model.scale.setScalar(PLAYER_3D_ASSET.scale);
  model.updateMatrixWorld(true);
  const playerBounds=new THREE.Box3().setFromObject(model);
  model.userData.groundY=Number.isFinite(playerBounds.min.y)?-playerBounds.min.y:PLAYER_3D_ASSET.y;
  model.position.y=model.userData.groundY;
  const mixer=new THREE.AnimationMixer(model),actions={};
  animations.forEach(clip=>actions[clip.name.toLowerCase()]=mixer.clipAction(clip));
  root.add(model);
  root.userData.model3d={enabled:true,model,mixer,actions,current:null,
    procedural:!animations.length,proceduralBones:!animations.length?setupFilmRedProceduralRig(model):null};
  if(playerModelChoice==="film-red")installFirstPersonRig(model);
  [root.userData.sprite,root.userData.depthSprite,root.userData.rimSprite].forEach(item=>{if(item)item.visible=false;});
  if(root.userData.shadow)root.userData.shadow.visible=true;
  playPlayer3DAction(root,"idle",true);
  modelTestMessage=(PLAYER_3D_ASSET.label||"3D主角")+" · 已加载";
  toast("Film Red 路飞已加载",900);
  console.info("[Player3D] loaded",{choice:playerModelChoice,meshes,skinned,animations:animations.map(a=>a.name)});
}
function parseCharacterFBX(buffer,path){
  const warn=console.warn;let repairedWarnings=0,model;
  // Suppress only the known exporter defect during synchronous parsing.
  // Akainu emits 76,422 identical warnings otherwise, freezing mobile consoles.
  console.warn=(...args)=>{
    if(args[0]==="THREE.FBXLoader: unknown attribute mapping type NoMappingInformation")repairedWarnings++;
    else warn.apply(console,args);
  };
  try{model=new FBXLoader().parse(buffer,path);}finally{console.warn=warn;}
  model.traverse(node=>{
    if(!node.isMesh)return;
    node.geometry.deleteAttribute("color");
    const normal=node.geometry.getAttribute("normal");
    let invalidNormal=!normal;
    if(normal)for(let i=0;i<normal.array.length;i++)if(!Number.isFinite(normal.array[i])){invalidNormal=true;break;}
    if(invalidNormal)node.geometry.computeVertexNormals();
    const materials=Array.isArray(node.material)?node.material:[node.material];
    materials.forEach(material=>{if(material){material.vertexColors=false;material.needsUpdate=true;}});
  });
  if(repairedWarnings)console.info("[FBX] repaired invalid exporter color mapping",repairedWarnings);
  return model;
}
function loadCharacterFBX(url,onLoad,onError){
  new THREE.FileLoader().setResponseType("arraybuffer").load(url,buffer=>{
    try{onLoad(parseCharacterFBX(buffer,THREE.LoaderUtils.extractUrlBase(url)));}
    catch(error){onError(error);}
  },undefined,onError);
}
function loadPlayerGLB(root){
  if(!PLAYER_3D_ASSET)return;
  const onError=error=>{
    console.warn("[Player3D] model fallback:",error);
    modelTestMessage="Film Red 加载失败 · 正在显示2D备用角色";
  };
  if(PLAYER_3D_ASSET.type==="fbx"){
    loadCharacterFBX(PLAYER_3D_ASSET.url,model=>configurePlayer3D(root,model,model.animations||[]),onError);
    return;
  }
  new GLTFLoader().load(PLAYER_3D_ASSET.url,gltf=>{
    const model=gltf.scene;
    // Reject unskinned or incomplete test files before hiding the fallback.
    if(playerModelChoice==="rigged-luffy"&&(
      !model.getObjectByProperty("isSkinnedMesh",true)||
      !["idle","walk","attack"].every(name=>gltf.animations.some(clip=>clip.name.toLowerCase()===name))
    )){
      console.warn("[GLB] rigged-luffy needs a skinned mesh and Idle/Walk/Attack clips");
      modelTestMessage="测试GLB校验失败 · 正在显示2D备用角色";
      return;
    }
    configurePlayer3D(root,model,gltf.animations);
  },undefined,onError);
}
function playPlayer3DAction(root,name,force=false){
  const data=root?.userData?.model3d;if(!data?.enabled)return;
  const resolved=data.actions[name]||data.actions.idle||Object.values(data.actions)[0];
  if(!resolved||(!force&&data.current===resolved))return;
  if(data.current)data.current.fadeOut(.12);
  resolved.reset().setEffectiveTimeScale(1).setEffectiveWeight(1).fadeIn(.12).play();
  data.current=resolved;
}
function updatePlayer3D(root,dt,moving,p){
  const data=root?.userData?.model3d;if(!data?.enabled)return false;
  const clip=p.hurtAnim>0?(data.actions.hurt?"hurt":"idle"):(p.attackAnim>0||p.castTime>0?"attack":(moving?"walk":"idle"));
  playPlayer3DAction(root,clip);
  data.mixer.update(dt);
  if(data.procedural&&data.proceduralBones){
    const rig=data.proceduralBones,walk=Math.sin(state.time*9),attack=p.attackAnim>0?Math.sin((1-p.attackAnim)*Math.PI):0;
    Object.values(rig).forEach(entry=>entry.bone.quaternion.copy(entry.base));
    data.moveBlend=THREE.MathUtils.damp(data.moveBlend||0,moving?1:0,12,dt);
    const stride=walk*.32*data.moveBlend;
    const turn=(bone,x=0,y=0,z=0)=>turnBone(bone,clamp(x,-.56,.56),clamp(y,-.42,.42),clamp(z,-.44,.44));
    turn(rig.armL,0,0,.28);turn(rig.armR,0,0,-.28);
    turn(rig.forearmL,-.16);turn(rig.forearmR,-.16);
    turn(rig.thighL,stride);turn(rig.thighR,-stride);
    turn(rig.calfL,Math.max(0,-stride)*.7);turn(rig.calfR,Math.max(0,stride)*.7);
    turn(rig.armL,-stride*.6);turn(rig.armR,stride*.6);
    turn(rig.spine,0,0,Math.sin(state.time*4.5)*.018*data.moveBlend);
    turn(rig.chest,Math.sin(state.time*2.2)*.012);

    // Film Red has a valid skeleton but no native motion clips.  These poses
    // are layered on the same bones as locomotion so every skill still has a
    // readable anticipation, release and recovery instead of a sliding model.
    const skill=p.castKind||"basic";
    const duration={axe:.55,rocket:.42,burst:.82,haki:.86,giant:1.05,summon:.72}[skill]||.34;
    const q=p.castTime>0?1-clamp(p.castTime/duration,0,1):p.attackAnim>0?1-p.attackAnim:0;
    const pulse=Math.sin(Math.PI*clamp(q,0,1));
    const windup=1-clamp(q/.28,0,1);
    if(p.attackAnim>0||p.castTime>0){
      if(skill==="combo"){
        const side=Math.sin(q*Math.PI*5.5);
        turn(rig.spine,0,side*.16,side*.12);turn(rig.chest,side*.24,0,0);
        turn(rig.armR,-1.1*pulse-side*.35,0,-.18*pulse);
        turn(rig.forearmR,-.75*pulse,0,0);
        turn(rig.armL,.65*pulse,0,.16*pulse);
      }else if(skill==="rocketPunch"){
        turn(rig.pelvis,-.12*pulse,0,0);turn(rig.spine,-.32*pulse,0,.12*pulse);
        turn(rig.chest,-.28*pulse,0,0);turn(rig.armR,-1.72*pulse,0,-.22*pulse);
        turn(rig.forearmR,-.95*pulse,0,0);turn(rig.armL,.62*pulse,0,.18*pulse);
      }else if(skill==="axe"){
        turn(rig.pelvis,.22*pulse,0,0);turn(rig.spine,.12*pulse,0,-.18*pulse);
        turn(rig.chest,.22*pulse,0,-.1*pulse);turn(rig.armR,-.45*pulse,0,-.25*pulse);
        turn(rig.forearmR,-.35*pulse,0,0);turn(rig.armL,-.4*pulse,0,.25*pulse);
        turn(rig.thighR,-1.35*pulse,0,0);turn(rig.calfR,.45*pulse,0,0);turn(rig.thighL,.12*pulse,0,0);
      }else if(skill==="rocket"){
        turn(rig.pelvis,-.18*pulse,0,0);turn(rig.spine,-.5*pulse,0,0);turn(rig.chest,-.34*pulse,0,0);
        turn(rig.armR,-1.45*pulse,0,-.18*pulse);turn(rig.armL,-1.1*pulse,0,.2*pulse);
        turn(rig.forearmR,-.65*pulse,0,0);turn(rig.forearmL,-.55*pulse,0,0);
      }else if(skill==="burst"){
        turn(rig.pelvis,.1*pulse,0,0);turn(rig.spine,-.18*pulse,0,0);turn(rig.chest,-.22*pulse,0,0);
        turn(rig.armR,-1.15*pulse,0,-.65*pulse);turn(rig.armL,-1.15*pulse,0,.65*pulse);
        turn(rig.forearmR,-.55*pulse,0,-.32*pulse);turn(rig.forearmL,-.55*pulse,0,.32*pulse);
      }else if(skill==="haki"){
        turn(rig.pelvis,.12*pulse,0,0);turn(rig.spine,-.25*pulse,0,0);turn(rig.chest,-.3*pulse,0,0);
        turn(rig.armR,-.8*pulse,0,-.95*pulse);turn(rig.armL,-.8*pulse,0,.95*pulse);
        turn(rig.forearmR,-.38*pulse,0,-.55*pulse);turn(rig.forearmL,-.38*pulse,0,.55*pulse);
      }else if(skill==="summon"){
        turn(rig.spine,-.14*pulse,0,0);turn(rig.chest,-.18*pulse,0,0);
        turn(rig.armR,-.44*pulse,0,-.25*pulse);turn(rig.armL,-.44*pulse,0,.25*pulse);
        turn(rig.forearmR,-.22*pulse);turn(rig.forearmL,-.22*pulse);
      }else if(skill==="giant"){
        turn(rig.pelvis,.18*pulse,0,0);turn(rig.spine,-.36*pulse,0,0);turn(rig.chest,-.48*pulse,0,0);
        turn(rig.armR,-1.6*pulse,0,-.35*pulse);turn(rig.armL,-1.6*pulse,0,.35*pulse);
        turn(rig.forearmR,-.92*pulse,0,-.18*pulse);turn(rig.forearmL,-.92*pulse,0,.18*pulse);
        turn(rig.thighR,-.25*pulse,0,0);turn(rig.thighL,-.25*pulse,0,0);
      }else{
        turn(rig.spine,0,0,.08*pulse);turn(rig.chest,-.3*pulse,0,0);
        turn(rig.armR,-1.35*pulse,0,-.2*pulse);turn(rig.forearmR,-.75*pulse,0,0);
        turn(rig.armL,.55*pulse,0,.18*pulse);
      }
    }
  }
  // A small body lean and walk rise adds readability but stays below the
  // threshold where the player slides or breaks collision logic.
  const bob=moving?Math.abs(Math.sin(state.time*8.5))*.055:0;
  data.model.position.y=data.model.userData.groundY+bob;
  data.model.rotation.z=p.hurtAnim>0?Math.sin(Math.PI*p.hurtAnim)*-.11:0;
  data.model.rotation.y=PLAYER_3D_ASSET.orientation;
  return true;
}

// Lightweight Spine-compatible cutout rig.  Luffy gets a visible copy of the
// same bone hierarchy; marine actors keep the old full-body atlas fallback
// until their own exported parts are ready.
function setupSpineStyleRig(root,main,depth,rim,role="marine",visible=false){
  const skeleton=new THREE.Group();skeleton.name="spine-skeleton";skeleton.visible=visible;root.add(skeleton);
  const bones={root:skeleton,pelvis:new THREE.Group(),torso:new THREE.Group(),chest:new THREE.Group(),neck:new THREE.Group(),head:new THREE.Group(),hat:new THREE.Group(),armL:new THREE.Group(),forearmL:new THREE.Group(),armR:new THREE.Group(),forearmR:new THREE.Group(),sash:new THREE.Group(),shortsL:new THREE.Group(),legL:new THREE.Group(),shortsR:new THREE.Group(),legR:new THREE.Group()};
  skeleton.add(bones.pelvis);bones.pelvis.add(bones.torso,bones.sash,bones.shortsL,bones.shortsR);
  bones.torso.add(bones.chest,bones.armL,bones.armR);bones.chest.add(bones.neck);bones.neck.add(bones.head);bones.head.add(bones.hat);
  bones.armL.add(bones.forearmL);bones.armR.add(bones.forearmR);bones.shortsL.add(bones.legL);bones.shortsR.add(bones.legR);
  // Bind-pose offsets are the local coordinates used by the cutout parts.
  bones.pelvis.position.set(0,.30,0);
  bones.torso.position.set(0,1.55,0);
  bones.chest.position.set(0,.55,0);
  bones.neck.position.set(0,.40,0);
  bones.head.position.set(0,.38,0);
  bones.hat.position.set(0,1.15,0);
  bones.armL.position.set(-1.02,1.04,0);
  bones.forearmL.position.set(0,-1.02,0);
  bones.armR.position.set(1.02,1.04,0);
  bones.forearmR.position.set(0,-1.02,0);
  bones.sash.position.set(0,.82,0);
  bones.shortsL.position.set(-.55,.64,0);
  bones.legL.position.set(0,-.56,0);
  bones.shortsR.position.set(.55,.64,0);
  bones.legR.position.set(0,-.56,0);
  const bind={};Object.entries(bones).forEach(([name,bone])=>{bind[name]={position:bone.position.clone(),rotation:bone.rotation.clone(),scale:bone.scale.clone()};});
  root.userData.spineRig={role,bones,bind,drawOrder:["rim","depth","main"],attachments:{main,depth,rim},base:{
    mainPos:main?.position.clone()||new THREE.Vector3(),mainScale:main?.scale.clone()||new THREE.Vector3(1,1,1),
    depthPos:depth?.position.clone()||new THREE.Vector3(),depthScale:depth?.scale.clone()||new THREE.Vector3(1,1,1),
    rimPos:rim?.position.clone()||new THREE.Vector3(),rimScale:rim?.scale.clone()||new THREE.Vector3(1,1,1)
  }};
}

// Build visible sprites from the generated transparent parts sheet.  Every
// sprite is parented to its named bone, so the JSON timelines and the local
// walk/attack pose both move the correct limb instead of rotating one flat
// full-body image.
function attachLuffySpineCutout(root,texture){
  const rig=root?.userData?.spineRig;if(!rig||rig.cutoutReady||!texture)return;
  const W=1145,H=1374;
  const defs=[
    {name:"leg-l",bone:"legL",cell:[572,1030,286,344],size:[.78,1.78],center:[.5,.05],pos:[0,0],order:1},
    {name:"leg-r",bone:"legR",cell:[859,1030,286,344],size:[.78,1.78],center:[.5,.05],pos:[0,0],order:2},
    // The generated sheet contains one complete shorts piece; using it once
    // avoids the doubled/ghosted lower body that two full shorts cells cause.
    {name:"torso",bone:"torso",cell:[859,0,286,344],size:[2.55,2.28],center:[.5,.5],pos:[0,0],order:3},
    {name:"shorts",bone:"pelvis",cell:[286,688,286,344],size:[2.02,.92],center:[.5,.5],pos:[0,.35],order:4},
    {name:"sash",bone:"sash",cell:[0,688,286,344],size:[2.18,.90],center:[.84,.15],pos:[.56,0],order:5},
    {name:"upper-arm-l",bone:"armL",cell:[0,344,286,344],size:[.98,1.52],center:[.82,.08],pos:[0,0],order:6},
    {name:"upper-arm-r",bone:"armR",cell:[572,344,286,344],size:[.98,1.52],center:[.38,.08],pos:[0,0],order:7},
    {name:"forearm-l",bone:"forearmL",cell:[286,344,286,344],size:[.82,1.58],center:[.56,.08],pos:[0,0],order:8},
    {name:"forearm-r",bone:"forearmR",cell:[859,344,286,344],size:[.82,1.58],center:[.42,.08],pos:[0,0],order:9},
    {name:"neck",bone:"neck",cell:[572,0,286,344],size:[.86,.70],center:[.5,.82],pos:[0,0],order:10},
    {name:"head",bone:"head",cell:[286,0,286,344],size:[2.18,2.18],center:[.5,.86],pos:[0,0],order:11},
    {name:"hat",bone:"hat",cell:[0,0,286,344],size:[3.22,1.52],center:[.5,.82],pos:[0,0],order:12}
  ];
  const group=rig.bones.root;group.scale.setScalar(.82);rig.cutoutScale=.82;rig.cutoutSprites={};
  defs.forEach(d=>{
    const [x,y,w,h]=d.cell,map=texture.clone();map.needsUpdate=true;
    map.wrapS=THREE.ClampToEdgeWrapping;map.wrapT=THREE.ClampToEdgeWrapping;
    // Inset the UV rectangle by a pixel so LinearFilter never samples the
    // neighboring cell and creates a stray hat/arm sliver at the edge.
    const pad=1;map.repeat.set((w-pad*2)/W,(h-pad*2)/H);map.offset.set((x+pad)/W,1-(y+h-pad)/H);
    const material=new THREE.SpriteMaterial({map,transparent:true,alphaTest:.04,depthTest:false,depthWrite:false,color:0xffffff,toneMapped:false});
    const sprite=new THREE.Sprite(material);sprite.center.set(d.center?.[0]??.5,d.center?.[1]??.5);sprite.position.set(d.pos[0],d.pos[1],.14+d.order*.001);sprite.scale.set(d.size[0],d.size[1],1);sprite.renderOrder=10+d.order;sprite.frustumCulled=false;
    rig.bones[d.bone]?.add(sprite);rig.cutoutSprites[d.name]=sprite;
  });
  rig.cutoutReady=true;rig.bones.root.visible=true;root.userData.spineCutoutGroup=group;
  // Keep the old atlas alive as a network/offline fallback, then remove it
  // from the draw list once all transparent parts are ready.
  if(rig.attachments.main)rig.attachments.main.visible=false;
  if(rig.attachments.depth)rig.attachments.depth.visible=false;
  if(rig.attachments.rim)rig.attachments.rim.visible=false;
}
function updateSpineStyleRig(root,{moving=false,action="idle",progress=0,look=0,flash=false,buff=false}={}){
  const rig=root.userData.spineRig;if(!rig)return;
  Object.entries(rig.bones).forEach(([name,bone])=>{if(name!=="root"&&rig.bind?.[name]){bone.position.copy(rig.bind[name].position);bone.rotation.copy(rig.bind[name].rotation);bone.scale.copy(rig.bind[name].scale);}});
  const b=rig.bones,p=clamp(progress,0,1),step=state.time*(moving?8.5:2.2),walkWave=Math.sin(step),walkLift=moving?Math.abs(walkWave)*.06:0;
  const actionPulse=(action!=="idle"&&action!=="walk")?Math.sin(Math.PI*p):0;
  const sideLook=clamp(Math.sin(look)*.08,-.1,.1);
  b.pelvis.position.set(rig.bind.pelvis.position.x,rig.bind.pelvis.position.y+walkLift*.28,rig.bind.pelvis.position.z+.012);b.pelvis.rotation.z=moving?walkWave*.026:0;b.pelvis.rotation.y=sideLook*.35;
  b.torso.position.z=.028;b.chest.position.z=.044;b.head.position.z=.062;b.armL.position.z=.036;b.armR.position.z=.048;b.legL.position.z=.018;b.legR.position.z=.02;
  b.torso.rotation.z=(moving?walkWave*.012:0)+actionPulse*.035;b.torso.rotation.y=sideLook;
  b.chest.rotation.x=actionPulse*.045;b.chest.rotation.z=-actionPulse*.02;
  b.head.rotation.y=sideLook*1.25;b.head.rotation.z=(moving?-walkWave*.018:0)-actionPulse*.025;
  b.armL.rotation.z=(moving?-walkWave*.045:0)-actionPulse*.18;b.armR.rotation.z=(moving?walkWave*.045:0)+actionPulse*.18;
  b.legL.rotation.x=moving?walkWave*.08:0;b.legR.rotation.x=moving?-walkWave*.08:0;

  const a=rig.attachments,base=rig.base;if(!a.main)return;
  const stretch=(actionPulse*.075)+(moving?Math.abs(walkWave)*.012:0),lateral=actionPulse*(rig.role==="luffy"?.055:.04);
  a.main.position.set(base.mainPos.x+lateral,base.mainPos.y+walkLift,base.mainPos.z);
  a.main.rotation.z=(moving?walkWave*.012:0)+actionPulse*(rig.role==="luffy"?.055:.035);
  a.main.scale.set(base.mainScale.x*(1+stretch),base.mainScale.y*(1-stretch*.32),base.mainScale.z);
  if(a.depth){
    a.depth.position.set(base.depthPos.x+lateral-.012,base.depthPos.y+walkLift+.006,base.depthPos.z-.012);
    a.depth.rotation.copy(a.main.rotation);a.depth.scale.copy(a.main.scale);
  }
  if(a.rim){
    a.rim.position.set(base.rimPos.x+lateral+.012,base.rimPos.y+walkLift+.012,base.rimPos.z-.018);
    a.rim.rotation.copy(a.main.rotation);a.rim.scale.set(base.rimScale.x*(1+stretch*1.18),base.rimScale.y*(1-stretch*.2),base.rimScale.z);
    a.rim.material.opacity=flash?.58:(buff?.34:.22);
    a.rim.material.color.setHex(flash?0xffd5b5:(buff?0xffbe70:0x76dcff));
  }
  if(rig.cutoutReady){const sx=(root.userData.facing||1)<0?-(rig.cutoutScale||.82):(rig.cutoutScale||.82);b.root.scale.set(sx,rig.cutoutScale||.82,rig.cutoutScale||.82);}
}

function setPlayerSpriteFrame(row,column,flip=false){
  const x=flip?(column+1)*.25:column*.25,y=1-(row+1)*.25;
  playerSpriteTexture.repeat.x=flip?-.25:.25;
  if(playerSpriteTexture.offset.x!==x||playerSpriteTexture.offset.y!==y)playerSpriteTexture.offset.set(x,y);
}

function updatePlayerSprite(moving,p,inputX){
  const sprite=state.playerModel.userData.sprite;if(!sprite)return;
  let action="idle",frame=0;
  if(p.hurtAnim>0){action="hurt";frame=Math.min(3,Math.floor((1-p.hurtAnim)*4));}
  else if(p.attackAnim>0||p.castTime>0){
    action="attack";
    const progress=p.attackAnim>0?1-p.attackAnim:1-clamp(p.castTime/.6,0,1);
    frame=Math.min(3,Math.floor(progress*4));
  }else if(moving){action="walk";frame=Math.floor(state.time*PLAYER_SPRITE_ANIMS.walk.fps)%4;}
  else frame=Math.floor(state.time*PLAYER_SPRITE_ANIMS.idle.fps)%4;
  if(moving&&Math.abs(inputX)>.08)state.playerModel.userData.facing=inputX<0?-1:1;
  setPlayerSpriteFrame(PLAYER_SPRITE_ANIMS[action].row,frame,state.playerModel.userData.facing<0);
  sprite.scale.x=Math.abs(sprite.scale.x);
  sprite.material.opacity=p.invuln>0&&Math.floor(state.time*22)%2?.48:1;
  sprite.material.color.setHex(p.buff>0?0xffe7aa:0xffffff);
  const depth=state.playerModel.userData.depthSprite;
  if(depth){
    depth.position.x=sprite.position.x-.075;depth.position.y=sprite.position.y+.005;depth.scale.copy(sprite.scale);
    depth.material.opacity=sprite.material.opacity*.34;depth.material.color.setHex(p.buff>0?0x5e3c2a:0x173647);
  }
  const groundShadow=state.playerModel.userData.shadow;
  if(groundShadow){const step=moving?Math.abs(Math.sin(state.time*9))*.08:0;groundShadow.scale.set(1.02+step,.72-step*.35,1);}
  const poseProgress=p.hurtAnim>0?1-p.hurtAnim:(p.attackAnim>0?1-p.attackAnim:(p.castTime>0?1-clamp(p.castTime/.9,0,1):0));
  updateSpineStyleRig(state.playerModel,{moving,action:p.hurtAnim>0?"hurt":(p.attackAnim>0||p.castTime>0?"attack":(moving?"walk":"idle")),progress:poseProgress,look:state.yaw,flash:p.hurtAnim>0,buff:p.buff>0});
  const spineName=p.hurtAnim>0?"hurt":(p.attackAnim>0||p.castTime>0?({combo:"skill_combo",rocketPunch:"skill_rocket",rocket:"skill_rocket",burst:"skill_haki",haki:"skill_haki",giant:"ultimate_giant_punch"}[p.castKind]||"attack"):(moving?"walk":"idle"));
  const spineAsset=state.playerModel.userData.spineAsset;
  if(spineAsset?.ready){
    const spineTime=(spineName==="idle"||spineName==="walk")?state.time:poseProgress*(spineAsset.durations[spineName]||1);
    applyLuffySpineAnimation(state.playerModel,spineName,spineTime);
  }
  state.playerModel.userData.spriteAction=action;
}

function createAllyModel(){
  const g=new THREE.Group();
  add(g,new THREE.CylinderGeometry(.55,.7,1.1,9),toon(0x173747),-.48,.55,0);
  add(g,new THREE.CylinderGeometry(.55,.7,1.1,9),toon(0x173747),.48,.55,0);
  add(g,new THREE.CylinderGeometry(1.25,1.05,2.3,10),toon(0x277d8e),0,2.2,0);
  add(g,new THREE.SphereGeometry(.88,12,8),toon(0x5aa7ae),0,4.05,0);
  add(g,new THREE.ConeGeometry(.24,.75,7),toon(0x245f73),-.72,4.45,0,0,0,-.45);
  add(g,new THREE.ConeGeometry(.24,.75,7),toon(0x245f73),.72,4.45,0,0,0,.45);
  add(g,new THREE.BoxGeometry(.17,.1,.08),toon(C.ink),-.3,4.14,.77);
  add(g,new THREE.BoxGeometry(.17,.1,.08),toon(C.ink),.3,4.14,.77);
  add(g,new THREE.CylinderGeometry(.33,.4,2.1,8),toon(0x277d8e),-1.35,2.55,0,0,0,-.2);
  add(g,new THREE.CylinderGeometry(.33,.4,2.1,8),toon(0x277d8e),1.35,2.55,0,0,0,.2);
  add(g,new THREE.CylinderGeometry(1.12,1.2,.25,10),toon(C.gold),0,3.22,0);
  add(g,new THREE.BoxGeometry(1.5,.2,.12),toon(0xd4f4f5),0,3.45,.86);
  add(g,new THREE.ConeGeometry(.18,.38,7),toon(0x5aa7ae),0,4.03,.9,Math.PI/2);
  addModelOutlines(g,1.025);
  g.scale.setScalar(1.16); return g;
}

function addHealthBar(model,width=2.2,y=5.3){
  const root=new THREE.Group(); root.position.y=y; model.add(root);
  const bg=add(root,new THREE.PlaneGeometry(width,.22),new THREE.MeshBasicMaterial({color:0x17232d,side:THREE.DoubleSide}),0,0,0);
  bg.castShadow=false;
  const fill=add(root,new THREE.PlaneGeometry(width-.08,.14),new THREE.MeshBasicMaterial({color:0x49dd82,side:THREE.DoubleSide}),0,0,.01);
  fill.castShadow=false; root.userData.fill=fill; root.userData.width=width-.08; return root;
}

// Real model assets selected from the uploaded model library.  Enemy roots stay
// hidden until the FBX is completely loaded and ground-corrected, so a slow or
// failed request can never leave a floating health bar or a 2D placeholder.
const TROOP_3D_ASSETS={
  // Mesh vertices are Z-up; their FBX skeleton may already read as Y-up.
  garpCaptain:{url:"./assets/models/troops/garp/12002.fbx?v=52",height:3.55,rotation:Math.PI,upAxis:"z",label:"加普精英队长",diffuse:"./assets/models/troops/garp/12002_D.png"},
  fakeNami:{url:"./assets/models/troops/fake-nami/falsenami001_body.fbx?v=52",height:2.9,rotation:Math.PI,upAxis:"z",label:"伪草帽·娜美",diffuse:"./assets/models/troops/fake-nami/falsenami001_body_d.png"},
  fakeLuffy:{url:"./assets/models/troops/fake-luffy/falseluffy001_body.fbx?v=61",height:3.05,rotation:Math.PI,upAxis:"z",label:"伪草帽·路飞",diffuse:"./assets/models/troops/fake-luffy/falseluffy001_body_d.png"},
  fakeSniper:{url:"./assets/models/troops/fake-sniper/falseusopp001_body.fbx?v=52",height:2.95,rotation:Math.PI,upAxis:"z",label:"伪草帽·狙击手",diffuse:"./assets/models/troops/fake-sniper/falseusopp001_body_d.png"},
  toyA:{url:"./assets/models/troops/toy-a/02_wanou_01.fbx?v=52",height:2.5,rotation:Math.PI,upAxis:"z",label:"玩偶兵·突击型",diffuse:"./assets/models/troops/toy-a/sugar001_threedoll_d.png"},
  toyB:{url:"./assets/models/troops/toy-b/02_wanou_02.fbx?v=52",height:2.7,rotation:Math.PI,upAxis:"z",label:"玩偶兵·重装型",diffuse:"./assets/models/troops/toy-b/sugar001_threedoll_d.png"},
  toyC:{url:"./assets/models/troops/toy-c/02_wanou_03.fbx?v=52",height:2.55,rotation:Math.PI,upAxis:"z",label:"玩偶兵·远程型",diffuse:"./assets/models/troops/toy-c/sugar001_threedoll_d.png"},
  boss:{url:"./assets/models/troops/akainu/12110_U.fbx?v=52",height:5.05,rotation:Math.PI,upAxis:"z",label:"赤犬",diffuse:"./assets/models/troops/akainu/12010_Body_BC.png"},
  allyJinbe:{url:"./assets/models/allies/jinbe/14007_U.fbx?v=61",height:3.3,upAxis:"z",label:"甚平",diffuse:"./assets/models/allies/jinbe/14007_D.png",
    maps:{"14007_b":"./assets/models/allies/jinbe/14007_B_D.png"}},
  allySanji:{url:"./assets/models/allies/sanji/11023_C.fbx?v=61",height:3.05,upAxis:"z",label:"山治",diffuse:"./assets/models/allies/sanji/11023_Body_BC.png",
    maps:{"face":"./assets/models/allies/sanji/11023_Face_BC.png","hair":"./assets/models/allies/sanji/11023_Hair_BC.png"}},
  allyChopper:{url:"./assets/models/allies/chopper/11006_U.fbx?v=61",height:1.72,upAxis:"z",label:"乔巴",diffuse:"./assets/models/allies/chopper/11006_D.png"}
};
// Role-to-asset mapping for the ordinary marine slots.  The three toy FBX
// files are deliberately used here because they are the lightest true 3D
// models in the uploaded library and are suitable for Android infantry.
const TROOP_ROLE_ASSETS={sword:"toyA",gun:"toyC",shield:"toyB",captain:"garpCaptain",boss:"boss"};
function troopAssetType(type){return TROOP_3D_ASSETS[type]?type:(TROOP_ROLE_ASSETS[type]||null);}
const troopModelPromises=new Map(),troopTextureCache=new Map(),reportedModelFailures=new Set();
function troopTexture(url){
  if(!url)return null;
  if(!troopTextureCache.has(url)){
    const texture=new THREE.TextureLoader().load(url);
    texture.colorSpace=THREE.SRGBColorSpace;
    texture.anisotropy=Math.min(4,renderer.capabilities.getMaxAnisotropy());
    troopTextureCache.set(url,texture);
  }
  return troopTextureCache.get(url);
}
function loadTroopPrototype(type){
  const asset=TROOP_3D_ASSETS[type];if(!asset)return Promise.resolve(null);
  if(!troopModelPromises.has(type)){
    troopModelPromises.set(type,new Promise((resolve,reject)=>{
      loadCharacterFBX(asset.url,model=>{
        let meshes=0,skinned=0;const defaultMap=troopTexture(asset.diffuse);
        model.traverse(node=>{
          if(!node.isMesh)return;meshes++;if(node.isSkinnedMesh)skinned++;
          node.castShadow=false;node.receiveShadow=true;node.frustumCulled=false;
          const materials=Array.isArray(node.material)?node.material:[node.material];
          materials.forEach(material=>{
            if(!material)return;
            const materialName=(material.name||"").toLowerCase();
            const override=Object.entries(asset.maps||{}).find(([key])=>key==="14007_b"?materialName===key:materialName.includes(key));
            if(override)material.map=troopTexture(override[1]);
            else if(defaultMap)material.map=defaultMap;
            material.transparent=false;material.opacity=1;material.side=THREE.FrontSide;material.needsUpdate=true;
          });
        });
        if(!meshes){reject(new Error(`${asset.label} FBX 中没有可渲染网格`));return;}
        console.info("[Troop3D] prototype loaded",{type,label:asset.label,meshes,skinned,animations:(model.animations||[]).map(a=>a.name)});
        resolve(model);
      },reject);
    }));
  }
  return troopModelPromises.get(type);
}
function reportTroopModelFailure(type,error){
  const asset=TROOP_3D_ASSETS[type];
  console.error("[Troop3D] load failed",{type,url:asset?.url,error});
  if(reportedModelFailures.has(type))return;
  reportedModelFailures.add(type);
  toast(`${asset?.label||type}模型加载失败，请检查网络或资源路径`,2200);
}
async function attachTroop3D(e){
  const assetType=e.assetType||troopAssetType(e.type),asset=TROOP_3D_ASSETS[assetType];if(!asset)return;
  e.model.userData.assetState="loading";
  try{
    const prototype=await loadTroopPrototype(assetType);
    if(!prototype||e.dead||!e.model.parent)return;
    const actor=cloneSkeleton(prototype);actor.name=`${assetType}_LibraryModel`;
    // FBX is Z-up while the game world is Y-up.  The old code measured the
    // unrotated Y dimension, producing sideways and floating characters.
    // Euler's default XYZ applies Y yaw before X pitch: a 180° facing turn
    // then reverses the upright correction and renders every actor head-down.
    actor.rotation.order="YXZ";
    if(asset.upAxis==="z")actor.rotation.x=-Math.PI/2;
    actor.rotation.y=0; // Upright FBX meshes already face the combat root's +Z.
    actor.updateMatrixWorld(true);
    let box=new THREE.Box3().setFromObject(actor),size=box.getSize(new THREE.Vector3());
    if(!Number.isFinite(size.y)||size.y<=.001)throw new Error(`${asset.label}尺寸无效`);
    actor.scale.multiplyScalar(asset.height/(size.y*e.model.scale.y));actor.updateMatrixWorld(true);
    box=new THREE.Box3().setFromObject(actor);actor.position.y-=box.min.y;
    actor.userData.baseY=actor.position.y;
    setupTroopRig(actor,assetType);
    e.model.add(actor);e.libraryModel=actor;e.model.userData.assetState="ready";e.model.visible=true;
    (e.model.userData.fallbackMeshes||[]).forEach(mesh=>mesh.visible=false);
    console.info("[Troop3D] actor attached",{type:e.type,assetType,height:asset.height});
  }catch(error){
    e.model.userData.assetState="failed";reportTroopModelFailure(assetType,error);
  }
}

const STATS={
  sword:{hp:85,speed:3.9,damage:14,range:2.1,color:C.red},
  gun:{hp:62,speed:3.0,damage:11,range:16,color:C.gold},
  shield:{hp:150,speed:2.55,damage:10,range:2.2,color:C.blue},
  captain:{hp:210,speed:3.25,damage:21,range:2.6,color:C.purple},
  garpCaptain:{hp:235,speed:3.35,damage:24,range:2.7,color:C.gold},
  fakeNami:{hp:88,speed:4.15,damage:16,range:2.4,color:0xf68a32},
  fakeLuffy:{hp:125,speed:3.65,damage:19,range:2.3,color:C.red},
  fakeSniper:{hp:72,speed:3.05,damage:14,range:17,color:C.gold},
  toyA:{hp:58,speed:4.45,damage:10,range:1.8,color:0x61d6b0},
  toyB:{hp:105,speed:2.75,damage:15,range:2.1,color:0x7f72d8},
  toyC:{hp:64,speed:3.15,damage:12,range:14,color:0xe786c7}
};
const TROOP_BASE={garpCaptain:"captain",fakeNami:"sword",fakeLuffy:"shield",fakeSniper:"gun",toyA:"sword",toyB:"shield",toyC:"gun"};
const ENEMY_NAMES={
  sword:"海军刀兵",gun:"海军枪兵",shield:"海军盾兵",captain:"海军精英队长",boss:"赤犬",
  garpCaptain:"加普精英队长",fakeNami:"伪草帽·娜美",fakeLuffy:"伪草帽·路飞",fakeSniper:"伪草帽·狙击手",
  toyA:"玩偶兵·突击型",toyB:"玩偶兵·重装型",toyC:"玩偶兵·远程型"
};
function ensureTargetRing(){
  if(state.targetRing)return state.targetRing;
  const material=new THREE.MeshBasicMaterial({color:C.gold,transparent:true,opacity:.9,side:THREE.DoubleSide,depthWrite:false});
  const ring=new THREE.Mesh(new THREE.RingGeometry(1.02,1.28,36),material);
  ring.rotation.x=-Math.PI/2;ring.position.y=.08;ring.visible=false;ring.renderOrder=5;scene.add(ring);state.targetRing=ring;
  return ring;
}
function setLockedTarget(target){
  if(state.lockedTarget===target)return;
  if(state.lockedTarget?.bar?.userData?.fill)state.lockedTarget.bar.userData.fill.material.color.setHex(0x49dd82);
  state.lockedTarget=target||null;
  if(target?.bar?.userData?.fill)target.bar.userData.fill.material.color.setHex(C.gold);
}
function updateTargetLock(dt){
  const direction=aimDirection();direction.y=0;direction.normalize();
  let candidate=null,best=-Infinity;
  for(const e of state.enemies){
    if(e.dead)continue;
    const to=e.pos.clone().sub(state.player.pos);to.y=0;const distance=to.length();
    if(distance<.01||distance>38)continue;
    const dot=to.multiplyScalar(1/distance).dot(direction);
    if(dot<.88)continue;
    const score=dot*5-distance*.018+(e.type==="boss"?.08:0);
    if(score>best){best=score;candidate=e;}
  }
  if(candidate){setLockedTarget(candidate);state.targetHold=.28;}
  else if(state.targetHold>0)state.targetHold-=dt;
  else setLockedTarget(null);
  const ring=ensureTargetRing(),target=state.lockedTarget;
  ring.visible=!!target;
  if(target){
    ring.position.set(target.pos.x,.08,target.pos.z);const pulseScale=1+Math.sin(state.time*7)*.08;
    ring.scale.setScalar((target.type==="boss"?1.55:1)*pulseScale);ring.rotation.z+=dt*.8;
  }
}
function spawnEnemy(type="sword",x=0,z=0){
  const s=STATS[type]||STATS.sword,combatType=TROOP_BASE[type]||type,assetType=troopAssetType(type),model=createMarineModel(combatType,false);
  if(type!==combatType){
    const accent=s.color;
    add(model,new THREE.TorusGeometry(type.startsWith("toy")?.58:.86,.11,7,18),toon(accent,accent),0,type.startsWith("toy")?3.15:4.58,.35,Math.PI/2);
    if(type.startsWith("toy"))model.scale.multiplyScalar(.82);
    if(type==="fakeNami")add(model,new THREE.SphereGeometry(.74,10,8),toon(0xee7138),0,4.42,-.28);
    if(type==="fakeLuffy")add(model,new THREE.CylinderGeometry(.9,.9,.12,16),toon(0xe4b343),0,4.83,0);
    if(type==="garpCaptain")add(model,new THREE.BoxGeometry(2.7,.24,1.15),toon(0xf4e6c9),0,3.52,-.4);
  }
  model.userData.fallbackMeshes=[];model.traverse(node=>{if(node.isMesh)model.userData.fallbackMeshes.push(node);});
  rigActor(model);
  // Do not render the old procedural/sprite placeholder.  The actor becomes
  // visible only after its real uploaded FBX is loaded and ground-corrected.
  model.visible=false;
  model.position.set(x,0,z);model.userData.rig.last.copy(model.position); scene.add(model);
  const e={id:state.nextId++,type,combatType,assetType,model,pos:model.position,hp:s.hp,maxHp:s.hp,speed:s.speed,
    damage:s.damage,range:s.range,attackCd:.5+Math.random(),stun:0,dead:false,
    animSprite:model.userData.animSprite||null,animName:"idle",animTime:0,
    attackActive:false,attackAnimTime:0,attackHitDone:false,attackKind:null,
    attackTarget:null,attackTargetRef:null,attackTargetAlly:false,hitFlash:0,
    bar:addHealthBar(model,2.15,type==="captain"||type==="garpCaptain"?6.3:(type.startsWith("toy")?4.45:5.3))};
  if(assetType&&TROOP_3D_ASSETS[assetType])e.bar.position.y=(TROOP_3D_ASSETS[assetType].height+.38)/model.scale.y;
  state.enemies.push(e);attachTroop3D(e);return e;
}
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
  let count=0;
  result.forEach((entry,i)=>{
    if(entry.status!=="fulfilled")return console.warn("[Companion] model unavailable",roles[i],entry.reason);
    try{createCompanion(roles[i],entry.value);count++;}catch(error){console.warn("[Companion] invalid model",roles[i],error);}
  });
  toast(count?`甚平、山治、乔巴支援 12 秒（${count}/3）`:"伙伴模型加载失败，请检查网络",1600);
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
