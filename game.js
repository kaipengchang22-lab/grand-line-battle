import * as THREE from "https://cdn.jsdelivr.net/npm/three@0.166.1/build/three.module.js";

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
  radar: $("radar"), joystick: $("joystick"), stick: $("stick"), lookZone: $("lookZone")
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
const mats = new Map();
const playerSpriteTexture=new THREE.TextureLoader().load("./assets/luffy-sprite-atlas.webp");
playerSpriteTexture.colorSpace=THREE.SRGBColorSpace;
playerSpriteTexture.wrapS=playerSpriteTexture.wrapT=THREE.RepeatWrapping;
playerSpriteTexture.repeat.set(.25,.25);
playerSpriteTexture.offset.set(0,.75);
playerSpriteTexture.magFilter=THREE.LinearFilter;
playerSpriteTexture.minFilter=THREE.LinearMipmapLinearFilter;
playerSpriteTexture.anisotropy=Math.min(8,renderer.capabilities.getMaxAnisotropy());
// A dedicated first-person sheet keeps the camera view logically separate
// from the third-person full-body atlas.  It is a compact 4x2 WebP with real
// alpha: idle/walk frames on top, attack/giant-fist/recovery frames below.
const firstPersonTexture=new THREE.TextureLoader().load("./assets/luffy-firstperson-actions-v2.webp");
firstPersonTexture.colorSpace=THREE.SRGBColorSpace;
firstPersonTexture.wrapS=firstPersonTexture.wrapT=THREE.RepeatWrapping;
firstPersonTexture.magFilter=THREE.LinearFilter;
firstPersonTexture.minFilter=THREE.LinearMipmapLinearFilter;
firstPersonTexture.anisotropy=Math.min(8,renderer.capabilities.getMaxAnisotropy());
// A second UV-isolated copy lets the first-person atlas cross-fade between
// adjacent hand-drawn poses instead of snapping on a single frame boundary.
const firstPersonBlendTexture=firstPersonTexture.clone();
firstPersonBlendTexture.needsUpdate=true;
// Marine infantry action atlases.  Each sheet is a 4x2 row-major strip with
// eight transparent frames; per-enemy texture clones keep UV offsets isolated
// so one soldier changing pose never changes every other soldier on screen.
const marineAnimSources={
  walk:"./assets/marine-walk-8f.webp",
  saberAttack:"./assets/marine-saber-attack-8f.webp",
  rifleFire:"./assets/marine-rifle-fire-8f.webp"
};
const marineAnimTextures={};
Object.entries(marineAnimSources).forEach(([name,url])=>{
  const texture=new THREE.TextureLoader().load(url);
  texture.colorSpace=THREE.SRGBColorSpace;
  texture.wrapS=texture.wrapT=THREE.RepeatWrapping;
  texture.magFilter=THREE.LinearFilter;
  texture.minFilter=THREE.LinearMipmapLinearFilter;
  texture.anisotropy=Math.min(8,renderer.capabilities.getMaxAnisotropy());
  marineAnimTextures[name]=texture;
});
const MARINE_ANIM_CLIPS={
  idle:{texture:"walk",fps:1,loop:true},
  walk:{texture:"walk",fps:8,loop:true},
  saberAttack:{texture:"saberAttack",fps:8,loop:false,hitAt:.5},
  rifleFire:{texture:"rifleFire",fps:8,loop:false,hitAt:.46}
};
const PLAYER_SPRITE_ANIMS={
  idle:{row:0,fps:5,loop:true},walk:{row:1,fps:9,loop:true},
  attack:{row:2,fps:12,loop:false},hurt:{row:3,fps:10,loop:false}
};
// First-person pose clips are deliberately short and hand-timed around the
// gameplay events.  They reuse the detailed arm atlas while giving every
// skill its own silhouette, anticipation and follow-through.
const FIRST_PERSON_ACTIONS={
  basic:{duration:.32,frames:[0,4,5,6,7]},
  combo:{duration:.92,frames:[4,5,6,7,4,6,7]},
  rocketPunch:{duration:.64,frames:[0,5,6,6]},
  burst:{duration:.82,frames:[7,0,7,6]},
  axe:{duration:.74,frames:[7,5,6,6]},
  rocket:{duration:.62,frames:[5,6,5,6]},
  giant:{duration:1.18,frames:[7,5,6,6]},
  haki:{duration:.86,frames:[7,0,7,6]},
  dodge:{duration:.28,frames:[1,2,3]}
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
function makeSeaTexture(){
  const canvas=document.createElement("canvas");canvas.width=canvas.height=512;
  const ctx=canvas.getContext("2d");
  const grad=ctx.createLinearGradient(0,0,512,512);
  grad.addColorStop(0,"#0d4b72");grad.addColorStop(.45,"#196c92");grad.addColorStop(1,"#0a385d");
  ctx.fillStyle=grad;ctx.fillRect(0,0,512,512);
  ctx.lineCap="round";
  for(let i=0;i<42;i++){
    const y=(i*47)%512,x=(i*83)%512,len=46+(i%8)*18;
    ctx.strokeStyle=i%3?"rgba(154,232,244,.22)":"rgba(226,252,255,.38)";
    ctx.lineWidth=i%4?2:3;ctx.beginPath();ctx.moveTo(x,y);
    ctx.quadraticCurveTo(x+len*.45,y-7-(i%3)*3,x+len,y+((i%5)-2)*4);ctx.stroke();
  }
  for(let i=0;i<70;i++){
    const x=(i*71)%512,y=(i*113)%512,r=1+(i%3);
    ctx.fillStyle="rgba(201,250,255,.28)";ctx.beginPath();ctx.arc(x,y,r,0,Math.PI*2);ctx.fill();
  }
  const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;
  texture.wrapS=texture.wrapT=THREE.RepeatWrapping;texture.repeat.set(3.5,4.5);
  texture.anisotropy=Math.min(4,renderer.capabilities.getMaxAnisotropy());return texture;
}
function seeded(n) { return ((Math.sin(n*999.41)*43758.5453)%1+1)%1; }
function dist2D(a,b){ const dx=a.x-b.x, dz=a.z-b.z; return Math.hypot(dx,dz); }
function clamp(v,a,b){ return Math.max(a,Math.min(b,v)); }

const state = {
  active:false, paused:false, mode:"first", phase:"assault", time:0, capture:0, defense:30,
  waveClock:0, kills:0, combo:0, comboTimer:0, score:0, yaw:0, pitch:-.04,
  player:{pos:new THREE.Vector3(0,1.7,40), hp:300,maxHp:300, stamina:100,haki:30,
    speed:9.2, cooldowns:{attack:0,dodge:0,s1:0,s2:0,s3:0,s4:0,s5:0,ultimate:0,haki:0}, dodge:0, invuln:0,
    buff:0, attackAnim:0, hurtAnim:0, fpAction:null, fpActionTime:0, fpActionDuration:0},
  enemies:[], projectiles:[], hazards:[], effects:[], fpEffects:[], ally:null, boss:null,
  keys:{}, joy:{x:0,y:0}, shake:0, gateOpen:0, nextId:1
};

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

function buildWorld(){
  const hemi = new THREE.HemisphereLight(0xeafcff,0x31526d,2.25); scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xfff4d4,3.0);
  sun.position.set(-28,45,30); sun.castShadow=true;
  sun.shadow.mapSize.set(1024,1024); sun.shadow.camera.left=-55; sun.shadow.camera.right=55;
  sun.shadow.camera.top=70; sun.shadow.camera.bottom=-70; sun.shadow.bias=-.0008; scene.add(sun);
  const rim=new THREE.DirectionalLight(0x7cccf4,.72);rim.position.set(36,22,-44);scene.add(rim);
  const fortressLamp=new THREE.PointLight(0xffb04d,1.8,38,2);fortressLamp.position.set(0,10,-61);scene.add(fortressLamp);

  const seaMaterial=standard(0x287ca0,.65,.05);seaMaterial.map=makeSeaTexture();
  const sea=add(world,new THREE.PlaneGeometry(180,210),seaMaterial,0,-.42,-12,-Math.PI/2);
  sea.receiveShadow=false;
  const waterWaves=[];
  for(let i=0;i<18;i++){
    const wave=add(world,new THREE.PlaneGeometry(12+(i%4)*7,.035),new THREE.MeshBasicMaterial({
      color:i%3?0x89e1ef:0xd1faff,transparent:true,opacity:.14+(i%4)*.025,
      blending:THREE.AdditiveBlending,depthWrite:false,side:THREE.DoubleSide
    }),((seeded(1200+i)*2-1)*62),-.34,(seeded(1310+i)*2-1)*78-7,-Math.PI/2,0,(seeded(1420+i)*2-1)*.18);
    wave.userData.wavePhase=seeded(1500+i)*Math.PI*2;wave.userData.waveBaseX=wave.position.x;waterWaves.push(wave);
  }
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
  const foamMat=new THREE.MeshBasicMaterial({color:0xd8fbff,transparent:true,opacity:.48,blending:THREE.AdditiveBlending,depthWrite:false,side:THREE.DoubleSide});
  const foam=[];
  foam.push(add(world,new THREE.PlaneGeometry(78,.32),foamMat,0,-.26,57.8,-Math.PI/2));
  foam.push(add(world,new THREE.PlaneGeometry(78,.32),foamMat,0,-.26,-67.8,-Math.PI/2));
  foam.push(add(world,new THREE.PlaneGeometry(.32,116),foamMat,-41.1,-.26,-5,-Math.PI/2));
  foam.push(add(world,new THREE.PlaneGeometry(.32,116),foamMat,41.1,-.26,-5,-Math.PI/2));
  foam.forEach((f,i)=>{f.userData.wavePhase=i*1.7;f.userData.waveBaseX=f.position.x;});

  const wall=toon(0xb5cbd0);
  add(world,new THREE.BoxGeometry(82,9,5),wall,0,4.5,-67);
  add(world,new THREE.BoxGeometry(15,17,10),wall,-27,8,-66);
  add(world,new THREE.BoxGeometry(15,17,10),wall,27,8,-66);
  add(world,new THREE.CylinderGeometry(10,13,6,8),toon(0x8caeb7),0,11,-70);
  const emblem=add(world,new THREE.TorusGeometry(3.2,.55,8,24),toon(C.gold),0,11,-64.75,Math.PI/2);
  emblem.castShadow=false;
  for(const x of [-32,32])createFortressTower(x);

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
  world.userData.environment={sea,seaMap:seaMaterial.map,waterWaves,foam,fortressLamp};
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
  if(env.seaMap){env.seaMap.offset.x=(env.seaMap.offset.x+dt*.012)%1;env.seaMap.offset.y=(env.seaMap.offset.y+dt*.006)%1;}
  env.waterWaves?.forEach((wave,i)=>{
    const q=state.time*.62+wave.userData.wavePhase;
    wave.position.x=wave.userData.waveBaseX+Math.sin(q)*.85;
    wave.position.y=-.34+Math.sin(q*1.7)*.018;
    wave.material.opacity=(.12+(i%4)*.025)*(0.82+Math.sin(q)*.18);
  });
  env.foam?.forEach((foam,i)=>{
    const q=state.time*1.7+foam.userData.wavePhase;
    foam.material.opacity=.35+Math.sin(q)*.11;foam.scale.x=1+Math.sin(q*1.13)*.035;
  });
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
  return g;
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

const STATS={
  sword:{hp:85,speed:3.9,damage:14,range:2.1,color:C.red},
  gun:{hp:62,speed:3.0,damage:11,range:16,color:C.gold},
  shield:{hp:150,speed:2.55,damage:10,range:2.2,color:C.blue},
  captain:{hp:210,speed:3.25,damage:21,range:2.6,color:C.purple}
};
function spawnEnemy(type="sword",x=0,z=0){
  const s=STATS[type], model=createMarineModel(type,false);
  rigActor(model);
  if(type==="sword"||type==="gun"||type==="captain")addMarineSprite(model,type);
  model.position.set(x,0,z);model.userData.rig.last.copy(model.position); scene.add(model);
  const e={id:state.nextId++,type,model,pos:model.position,hp:s.hp,maxHp:s.hp,speed:s.speed,
    damage:s.damage,range:s.range,attackCd:.5+Math.random(),stun:0,dead:false,
    animSprite:model.userData.animSprite||null,animName:"idle",animTime:0,
    attackActive:false,attackAnimTime:0,attackHitDone:false,attackKind:null,
    attackTarget:null,attackTargetRef:null,attackTargetAlly:false,hitFlash:0,
    bar:addHealthBar(model,2.15,type==="captain"?6.3:5.3)};
  state.enemies.push(e); return e;
}
function spawnBoss(){
  const model=createMarineModel("captain",true);rigActor(model); model.position.set(0,0,-48); scene.add(model);
  const e={id:state.nextId++,type:"boss",model,pos:model.position,hp:720,maxHp:720,speed:2.7,damage:30,
    range:3.3,attackCd:2,stun:0,dead:false,phase2:false,ultimate:false,bar:addHealthBar(model,3.2,7.65)};
  state.enemies.push(e); state.boss=e; ui.bossWrap.classList.remove("hidden");
  toast("海军本部大将登场！",2200); audio.tone(72,.55,"sawtooth",.07);
}
function spawnAlly(){
  const model=createAllyModel();rigActor(model); model.position.set(0,0,-24); scene.add(model);
  state.ally={model,pos:model.position,hp:260,maxHp:260,attackCd:0};
  addHealthBar(model,3,6.4);
}

function clearActors(){
  state.enemies.forEach(e=>{disposeMarineSprite(e.model);scene.remove(e.model);}); state.enemies=[];
  state.projectiles.forEach(p=>scene.remove(p.mesh)); state.projectiles=[];
  state.hazards.forEach(h=>scene.remove(h.mesh)); state.hazards=[];
  state.effects.forEach(f=>scene.remove(f.mesh)); state.effects=[];
  if(state.ally){scene.remove(state.ally.model);state.ally=null;}
  state.boss=null;
}

const arms=new THREE.Group();
camera.add(arms);
function setFirstPersonFrame(index){
  const col=index%4,row=Math.floor(index/4);
  // A tiny inset prevents linear filtering from pulling pixels from the
  // neighboring action cell at the four frame boundaries.
  const padX=.004,padY=.007;
  firstPersonTexture.repeat.set(.25-padX*2,.5-padY*2);
  firstPersonTexture.offset.set(col*.25+padX,row===0?.5+padY:padY);
}
function setFirstPersonBlendFrame(index){
  const col=index%4,row=Math.floor(index/4),padX=.004,padY=.007;
  firstPersonBlendTexture.repeat.set(.25-padX*2,.5-padY*2);
  firstPersonBlendTexture.offset.set(col*.25+padX,row===0?.5+padY:padY);
}
function buildArms(){
  arms.position.set(0,-.72,-.92);
  const material=new THREE.MeshBasicMaterial({
    map:firstPersonTexture,transparent:true,depthTest:false,depthWrite:false,
    toneMapped:false,opacity:1
  });
  const blendMaterial=new THREE.MeshBasicMaterial({
    map:firstPersonBlendTexture,transparent:true,depthTest:false,depthWrite:false,
    toneMapped:false,opacity:0
  });
  const sprite=new THREE.Mesh(new THREE.PlaneGeometry(1,1),material);
  const blendSprite=new THREE.Mesh(new THREE.PlaneGeometry(1,1),blendMaterial);
  sprite.scale.set(2.05,1.12,1);sprite.frustumCulled=false;sprite.renderOrder=22;
  blendSprite.scale.copy(sprite.scale);blendSprite.frustumCulled=false;blendSprite.renderOrder=23;
  arms.add(sprite);arms.userData.sprite=sprite;setFirstPersonFrame(0);
  arms.add(blendSprite);arms.userData.blend=blendSprite;setFirstPersonBlendFrame(0);
}
function easeInOutCubic(t){
  const p=clamp(t,0,1);return p<.5?4*p*p*p:1-Math.pow(-2*p+2,3)/2;
}
function applyFirstPersonPose(sprite,name,progress,frame){
  const p=clamp(progress,0,1),pulse=Math.sin(Math.PI*p);
  let x=0,y=0,rot=0,sx=2.05,sy=1.12;
  if(name==="basic"){
    x=.05+pulse*.10;y=.02+pulse*.06;rot=-.03+p*.08;sx=2.06+pulse*.22;sy=1.14+pulse*.16;
  }else if(name==="combo"){
    x=Math.sin(p*Math.PI*4)*.08;y=.04+pulse*.08;rot=Math.sin(p*Math.PI*2)*.08;sx=2.1+pulse*.28;sy=1.18+pulse*.20;
  }else if(name==="rocketPunch"){
    x=.10+pulse*.18;y=.02+pulse*.03;rot=.02;sx=2.12+pulse*.32;sy=1.20+pulse*.22;
  }else if(name==="burst"){
    y=.08+pulse*.12;rot=Math.sin(p*Math.PI)*.10;sx=2.20+pulse*.25;sy=1.35+pulse*.22;
  }else if(name==="axe"){
    x=-.04+pulse*.10;y=-.02+pulse*.12;rot=-.10+p*.22;sx=2.16+pulse*.28;sy=1.25+pulse*.28;
  }else if(name==="rocket"){
    x=.12+pulse*.20;y=pulse*.04;rot=.04;sx=2.30+pulse*.30;sy=1.28+pulse*.20;
  }else if(name==="giant"){
    y=.12+pulse*.18;rot=Math.sin(p*Math.PI*2)*.08;sx=2.30+pulse*.52;sy=1.55+pulse*.40;
  }else if(name==="haki"){
    y=.04+pulse*.08;rot=-.05+p*.10;sx=2.18+pulse*.25;sy=1.32+pulse*.22;
  }else if(name==="dodge"){
    x=Math.sin(p*Math.PI)*-.16;y=.02;rot=-.16+p*.32;sx=1.95;sy=1.10;
  }
  if(frame===6&&(name==="giant"||name==="rocketPunch"||name==="axe")){
    sx*=1.05;sy*=1.08;
  }
  sprite.position.set(x,y,0);sprite.rotation.z=rot;sprite.scale.set(sx,sy,1);
  return .86+pulse*.14;
}
function updateFirstPersonSprite(p,moving=false){
  const sprite=arms.userData.sprite;if(!sprite)return;
  const blendSprite=arms.userData.blend;
  const material=sprite.material;
  const blink=p.invuln>0&&Math.floor(state.time*22)%2,opacity=blink?.52:1;
  const hurt=p.hurtAnim>0;
  const action=!hurt&&p.fpAction?FIRST_PERSON_ACTIONS[p.fpAction]:null;
  let frame=0,nextFrame=0,frameBlend=0,progress=0,poseProgress=0;
  if(hurt){
    frame=3;
  }else if(action){
    progress=clamp((p.fpActionTime||0)/Math.max(.001,p.fpActionDuration||action.duration),0,1);
    const framePos=progress*Math.max(0,action.frames.length-1);
    const index=Math.min(action.frames.length-1,Math.floor(framePos));
    frame=action.frames[index];nextFrame=action.frames[Math.min(action.frames.length-1,index+1)];
    frameBlend=index===action.frames.length-1?0:framePos-index;
    poseProgress=easeInOutCubic(progress);
  }else if(p.attackAnim>0||p.castTime>0){
    progress=p.attackAnim>0?1-p.attackAnim:1-clamp(p.castTime/.6,0,1);
    if(p.castKind==="giant")frame=6;
    else if(p.castKind==="rocket")frame=5;
    else frame=[4,5,6,7][Math.min(3,Math.floor(progress*4))];
  }else if(moving){
    frame=1+(Math.floor(state.time*8)%2);
  }
  setFirstPersonFrame(frame);
  if(action&&!hurt){
    const alpha=applyFirstPersonPose(sprite,p.fpAction,poseProgress,frame);
    if(blendSprite){
      setFirstPersonBlendFrame(nextFrame);blendSprite.position.copy(sprite.position);
      blendSprite.rotation.copy(sprite.rotation);blendSprite.scale.copy(sprite.scale);
      blendSprite.material.opacity=opacity*alpha*frameBlend;
    }
    material.opacity=opacity*alpha*(1-frameBlend);
  }else if(hurt){
    if(blendSprite)blendSprite.material.opacity=0;
    sprite.position.set(0,-.06,.02);sprite.rotation.z=(1-p.hurtAnim)*.10;sprite.scale.set(1.92,1.22,1);material.opacity=opacity;
  }else if(p.attackAnim>0||p.castTime>0){
    if(blendSprite)blendSprite.material.opacity=0;
    const punch=clamp(progress,0,1),giant=frame===6;
    sprite.position.set(.06+punch*.08,.02+punch*.05,0);sprite.rotation.z=0;
    sprite.scale.set(giant?2.36:2.12,giant?1.72:1.26,1);material.opacity=opacity*(.86+punch*.14);
  }else{
    if(blendSprite)blendSprite.material.opacity=0;
    sprite.position.set(0,0,0);sprite.rotation.z=0;sprite.scale.set(2.05,1.12,1);material.opacity=opacity;
  }
}
buildArms();
const firstPersonFx=new THREE.Group();
firstPersonFx.position.set(0,0,-1.18);firstPersonFx.renderOrder=30;camera.add(firstPersonFx);
const firstPersonGlowTextures=new Map();
function firstPersonGlowTexture(color){
  const key=String(color);if(firstPersonGlowTextures.has(key))return firstPersonGlowTextures.get(key);
  const c=document.createElement("canvas");c.width=c.height=128;const ctx=c.getContext("2d");
  const col=new THREE.Color(color),r=Math.round(col.r*255),g=Math.round(col.g*255),b=Math.round(col.b*255);
  const grad=ctx.createRadialGradient(64,64,4,64,64,64);
  grad.addColorStop(0,`rgba(${r},${g},${b},.86)`);grad.addColorStop(.24,`rgba(${r},${g},${b},.36)`);
  grad.addColorStop(1,`rgba(${r},${g},${b},0)`);ctx.fillStyle=grad;ctx.fillRect(0,0,128,128);
  const texture=new THREE.CanvasTexture(c);texture.colorSpace=THREE.SRGBColorSpace;texture.needsUpdate=true;
  firstPersonGlowTextures.set(key,texture);return texture;
}
function addFirstPersonFxMesh(mesh,kind,total,baseScale=1,spin=0){
  mesh.renderOrder=31;firstPersonFx.add(mesh);
  state.fpEffects.push({mesh,kind,time:total,total,baseScale,spin,baseOpacity:mesh.material.opacity||1});
}
function addFirstPersonGlow(color,scale,total=.5){
  const material=new THREE.SpriteMaterial({map:firstPersonGlowTexture(color),transparent:true,depthTest:false,depthWrite:false,
    blending:THREE.AdditiveBlending,opacity:.62,color:0xffffff,toneMapped:false});
  const sprite=new THREE.Sprite(material);sprite.position.set(0,0,.02);sprite.scale.set(scale,scale,1);
  addFirstPersonFxMesh(sprite,"glow",total,scale,-.45);
}
function addFirstPersonRing(color,scale,total=.42){
  const material=new THREE.MeshBasicMaterial({color,transparent:true,depthTest:false,depthWrite:false,
    side:THREE.DoubleSide,blending:THREE.AdditiveBlending,opacity:.92});
  const ring=new THREE.Mesh(new THREE.RingGeometry(.34,.43,40),material);ring.position.z=.04;
  ring.scale.setScalar(scale);addFirstPersonFxMesh(ring,"ring",total,scale,.7);
}
function addFirstPersonStreak(color,x,y,angle,width=1.7,total=.26){
  const material=new THREE.MeshBasicMaterial({color,transparent:true,depthTest:false,depthWrite:false,
    side:THREE.DoubleSide,blending:THREE.AdditiveBlending,opacity:.9});
  const streak=new THREE.Mesh(new THREE.PlaneGeometry(1,.045),material);
  streak.position.set(x,y,.08);streak.rotation.z=angle;streak.scale.set(width,1,1);
  addFirstPersonFxMesh(streak,"streak",total,width,.0);
}
function spawnFirstPersonFx(kind){
  if(!firstPersonFx)return;
  if(kind==="basic"){
    addFirstPersonStreak(0xfff4c2,-.22,.08,-.35,1.55,.24);
    addFirstPersonStreak(0xffd36a,.24,-.02,.32,1.35,.28);
  }else if(kind==="combo"){
    addFirstPersonGlow(0xffb34f,2.4,.74);addFirstPersonRing(0xffd26a,1.05,.52);
    addFirstPersonStreak(0xfff6d38a,-.36,.18,-.48,2.0,.30);
    addFirstPersonStreak(0xfff6d38a,.35,.05,.42,2.0,.42);
    addFirstPersonStreak(0xfff6d38a,-.10,-.12,-.14,2.25,.58);
  }else if(kind==="rocketPunch"){
    addFirstPersonGlow(0xff7a3b23,2.6,.55);addFirstPersonStreak(0xfff5a14e,0,.02,0,3.1,.48);
    addFirstPersonRing(0xfff4c26b,1.28,.44);
  }else if(kind==="burst"){
    addFirstPersonGlow(0xffe23e2e,3.3,.72);addFirstPersonRing(0xfff4c26b,1.5,.66);
    addFirstPersonStreak(0xffe94a34,-.32,.14,-.75,1.8,.58);
    addFirstPersonStreak(0xfff7d48b,.34,.12,.75,1.8,.58);
  }else if(kind==="axe"){
    addFirstPersonGlow(0xffd84b2d,2.8,.64);addFirstPersonRing(0xfff4a142,1.3,.58);
    addFirstPersonStreak(0xffffc05b,-.22,.1,-.9,2.7,.56);
    addFirstPersonStreak(0xffff744d,.22,.08,.9,2.2,.68);
  }else if(kind==="rocket"){
    addFirstPersonGlow(0xffe56c2c,2.8,.58);addFirstPersonStreak(0xffffd18a,0,0,0,3.6,.52);
    addFirstPersonRing(0xffffa549,1.1,.42);
  }else if(kind==="giant"){
    addFirstPersonGlow(0xffe24b28,4.5,1.08);addFirstPersonRing(0xffffd36a,2.1,.9);
    addFirstPersonStreak(0xffffe6a4,-.4,.22,-.62,2.8,.78);
    addFirstPersonStreak(0xffffe6a4,.4,.22,.62,2.8,.92);
  }else if(kind==="haki"){
    addFirstPersonGlow(0x5d4de2,3.2,.8);addFirstPersonRing(0x8d6bff,1.72,.72);
    addFirstPersonStreak(0xc3b4ff,-.38,.1,-.42,2.0,.62);
    addFirstPersonStreak(0x6fe7ff,.38,.1,.42,2.0,.72);
  }else if(kind==="dodge"){
    addFirstPersonStreak(0x8be9ff,0,0,0,3.0,.24);addFirstPersonGlow(0x35cde8,1.9,.26);
  }
}
function clearFirstPersonEffects(){
  for(const f of state.fpEffects){firstPersonFx.remove(f.mesh);f.mesh.geometry?.dispose();f.mesh.material?.dispose();}
  state.fpEffects.length=0;
}
function updateFirstPersonEffects(dt){
  for(let i=state.fpEffects.length-1;i>=0;i--){
    const f=state.fpEffects[i];f.time-=dt;const q=1-clamp(f.time/f.total,0,1);
    const fade=1-q;f.mesh.material.opacity=f.baseOpacity*fade;
    if(f.kind==="ring"){
      f.mesh.scale.setScalar(f.baseScale*(.45+q*1.65));f.mesh.rotation.z+=f.spin*dt;
    }else if(f.kind==="streak"){
      f.mesh.scale.x=f.baseScale*(.22+q*1.85);f.mesh.scale.y=1+Math.sin(q*Math.PI)*.65;
    }else if(f.kind==="glow"){
      f.mesh.scale.setScalar(f.baseScale*(.62+q*1.38));f.mesh.material.opacity=f.baseOpacity*(1-q)*.78;
      f.mesh.rotation.z+=f.spin*dt;
    }
    if(f.time<=0){firstPersonFx.remove(f.mesh);f.mesh.geometry?.dispose();f.mesh.material?.dispose();state.fpEffects.splice(i,1);}
  }
}
function startFirstPersonAction(name){
  const clip=FIRST_PERSON_ACTIONS[name];if(!clip)return;
  const p=state.player;p.fpAction=name;p.fpActionTime=0;p.fpActionDuration=clip.duration;spawnFirstPersonFx(name);
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
function cloneMarineTexture(base){
  const map=base.clone();
  map.needsUpdate=true;
  map.wrapS=map.wrapT=THREE.RepeatWrapping;
  map.magFilter=THREE.LinearFilter;
  map.minFilter=THREE.LinearMipmapLinearFilter;
  map.anisotropy=Math.min(8,renderer.capabilities.getMaxAnisotropy());
  return map;
}
function syncMarineTexture(map,name){
  if(!map)return;
  const source=marineAnimTextures[name];
  // TextureLoader finishes asynchronously.  Copy its image onto clones that
  // were made before the network response so the first spawned wave also
  // renders correctly on slower phones.
  // Texture.clone() may share the source image object with the loader.  In
  // that case the clone updates automatically; only copy for an independent
  // source created before the asynchronous loader response.
  if(source?.image&&map.image!==source.image&&map.source!==source.source){map.image=source.image;map.needsUpdate=true;}
}
function setMarineSpriteFrame(sprite,map,frame){
  if(!sprite||!map)return;
  const index=clamp(Math.floor(frame),0,7),col=index%4,row=Math.floor(index/4);
  const padX=.004,padY=.007;
  map.repeat.set(.25-padX*2,.5-padY*2);
  map.offset.set(col*.25+padX,row===0?.5+padY:padY);
  if(sprite.material.map!==map){sprite.material.map=map;sprite.material.needsUpdate=true;}
}
function addMarineSprite(model,type){
  // The generated atlas becomes the readable character silhouette.  Hide the
  // old low-poly pieces but keep the root, shadow and health bar structure.
  model.traverse(o=>{if(o.isMesh)o.visible=false;});
  const maps={};
  Object.entries(marineAnimTextures).forEach(([name,base])=>{maps[name]=cloneMarineTexture(base);});
  const material=new THREE.SpriteMaterial({
    map:maps.walk,transparent:true,alphaTest:.08,depthTest:true,depthWrite:false,
    color:0xffffff,toneMapped:false,opacity:1
  });
  const sprite=new THREE.Sprite(material);
  const rootScale=model.scale.x||1;
  const worldHeight=type==="captain"?6.0:5.35;
  sprite.center.set(.5,0);
  sprite.position.set(0,0,0);
  sprite.scale.set(worldHeight*.74/rootScale,worldHeight/rootScale,1);
  sprite.renderOrder=3;sprite.frustumCulled=false;model.add(sprite);
  const depthMaterial=new THREE.SpriteMaterial({
    map:maps.walk,transparent:true,alphaTest:.08,depthTest:true,depthWrite:false,
    color:0x132f43,toneMapped:false,opacity:.32
  });
  const depthSprite=new THREE.Sprite(depthMaterial);
  depthSprite.center.set(.5,0);depthSprite.position.set(-.09,.04,-.07);
  depthSprite.scale.copy(sprite.scale);depthSprite.renderOrder=2;depthSprite.frustumCulled=false;model.add(depthSprite);
  const shadow=add(model,new THREE.CircleGeometry(.92,28),new THREE.MeshBasicMaterial({
    color:0x07131c,transparent:true,opacity:type==="captain"?.34:.25,depthWrite:false
  }),0,.045,0,-Math.PI/2);
  shadow.scale.set(type==="captain"?1.45:1.2,.62,1);shadow.castShadow=false;shadow.receiveShadow=false;shadow.renderOrder=1;
  model.userData.animSprite=sprite;
  model.userData.animDepthSprite=depthSprite;
  model.userData.animShadow=shadow;
  model.userData.animMaps=maps;
  model.userData.animName="idle";
  setMarineSpriteFrame(sprite,maps.walk,0);
}
function setMarineAnimation(e,name,force=false){
  const sprite=e.model?.userData.animSprite;if(!sprite)return;
  const next=MARINE_ANIM_CLIPS[name]?name:"idle";
  if(!force&&e.animName===next)return;
  e.animName=next;e.animTime=0;
  const clip=MARINE_ANIM_CLIPS[next],maps=e.model.userData.animMaps;
  const map=maps?.[clip.texture]||maps?.walk;
  syncMarineTexture(map,clip.texture);
  const depth=e.model.userData.animDepthSprite;
  if(depth){depth.material.map=map;depth.material.needsUpdate=true;}
  setMarineSpriteFrame(sprite,map,0);
}
function updateMarineSprite(e,dt){
  const sprite=e.model.userData.animSprite;if(!sprite)return;
  const name=e.animName||"idle",clip=MARINE_ANIM_CLIPS[name]||MARINE_ANIM_CLIPS.idle;
  e.animTime=(e.animTime||0)+dt;
  const frame=name==="idle"?0:(clip.loop
    ?Math.floor(e.animTime*clip.fps)%8
    :Math.min(7,Math.floor(e.animTime*clip.fps)));
  const map=e.model.userData.animMaps?.[clip.texture]||e.model.userData.animMaps?.walk;
  syncMarineTexture(map,clip.texture);
  const flashing=(e.hitFlash||0)>0&&Math.floor(state.time*28)%2===0;
  const depth=e.model.userData.animDepthSprite;
  if(depth&&depth.material.map!==map){depth.material.map=map;depth.material.needsUpdate=true;}
  const phase=e.animTime*(name==="walk"?Math.PI*2*1.05:Math.PI*1.25);
  const moving=name==="walk",actionPulse=name==="saberAttack"||name==="rifleFire"?Math.sin(Math.PI*clamp(e.animTime,0,1)):0;
  sprite.position.y=(moving?Math.abs(Math.sin(phase))*.075:actionPulse*.045);
  sprite.position.x=actionPulse>0?Math.sin(Math.PI*clamp(e.animTime,0,1))*.055:0;
  sprite.rotation.z=moving?Math.sin(phase)*.018:actionPulse*.035;
  if(depth){
    depth.position.x=sprite.position.x-.09;depth.position.y=sprite.position.y+.04;depth.rotation.copy(sprite.rotation);depth.scale.copy(sprite.scale);
    depth.material.opacity=(flashing?.86:1)*.32;
  }
  const shadow=e.model.userData.animShadow;
  if(shadow){const lift=moving?Math.abs(Math.sin(phase))*.08:actionPulse*.04;shadow.scale.x=(e.type==="captain"?1.45:1.2)+lift*.8;shadow.scale.y=.62-lift*.25;}
  setMarineSpriteFrame(sprite,map,frame);
  sprite.material.color.setHex(flashing?0xffb2a8:0xffffff);
  sprite.material.opacity=flashing?.86:1;
  if(!clip.loop&&e.animTime>=1){
    e.attackActive=false;e.attackAnimTime=0;e.attackTargetRef=null;
    setMarineAnimation(e,"idle",true);
  }
}
function disposeMarineSprite(model){
  const sprite=model?.userData?.animSprite;if(!sprite)return;
  Object.values(model.userData.animMaps||{}).forEach(map=>map.dispose());
  sprite.material.dispose();
  const depth=model.userData.animDepthSprite;
  if(depth){depth.material.dispose();depth.geometry.dispose();}
  const shadow=model.userData.animShadow;
  if(shadow){shadow.material.dispose();shadow.geometry.dispose();}
  model.userData.animSprite=null;model.userData.animDepthSprite=null;model.userData.animShadow=null;model.userData.animMaps=null;
}
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
    poseActor(a.model,dt,moving,a.model.userData.swing,a.model.userData.hurt);
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
  pulse(point,C.gold,radius);burst(point,C.orange,12);
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
  pulse(point,C.orange,4.5);burst(point,C.gold,13);
  scheduleCombat(.4,()=>areaStrike(point,4.5,90));
  toast("橡胶·战斧！",850);
}
function skill5(){
  if(!canCast("s5",30))return;
  const p=state.player;p.stamina-=30;p.cooldowns.s5=14;
  p.dodge=.42;p.dodgeDir=playerDirection();p.invuln=.5;startFirstPersonAction("rocket");
  p.rocket={time:.46,last:p.pos.clone(),hits:new Set()};p.castTime=.42;p.castKind="rocket";
  pulse(p.pos,C.orange,3);burst(p.pos,C.gold,8);state.shake=.24;toast("橡胶·火箭！",850);
}
function ultimate(){
  if(!canCast("ultimate"))return;
  const p=state.player;
  if(p.charge<100){toast("命中敌人积攒大招 · "+Math.floor(p.charge)+"%",900);return;}
  p.charge=0;p.cooldowns.ultimate=40;p.castTime=1.05;p.castKind="giant";p.invuln=1.1;startFirstPersonAction("giant");
  const point=p.pos.clone().addScaledVector(playerDirection(),7);point.y=0;
  const fist=new THREE.Mesh(new THREE.SphereGeometry(1.65,12,8),toon(C.skin));
  fist.position.copy(point);fist.position.y=7;scene.add(fist);
  state.effects.push({mesh:fist,time:1.05,total:1.05,giant:true});
  pulse(point,C.gold,7);burst(point,C.orange,22);
  scheduleCombat(.75,()=>{areaStrike(point,7,230);audio.tone(65,.3,"sawtooth",.05);});
  toast("三档 · 巨人之拳！",1300);
}

function resetGame(){
  clearActors();clearFirstPersonEffects();state.combatActions=[];
  Object.assign(state,{active:false,paused:false,phase:"assault",time:0,capture:0,defense:30,
    waveClock:0,kills:0,combo:0,maxCombo:0,comboTimer:0,score:0,yaw:0,pitch:-.04,shake:0,gateOpen:0});
  Object.assign(state.player,{charge:0,castTime:0,castKind:null,rocket:null,hp:300,maxHp:300,stamina:100,haki:30,speed:9.2,dodge:0,invuln:0,buff:0,attackAnim:0,hurtAnim:0,fpAction:null,fpActionTime:0,fpActionDuration:0});
  state.player.pos.set(0,1.7,40);
  Object.keys(state.player.cooldowns).forEach(k=>state.player.cooldowns[k]=0);
  state.gate.children[0].position.x=-3.2; state.gate.children[1].position.x=3.2;
  state.exitMarker.visible=false; ui.bossWrap.classList.add("hidden"); ui.capture.classList.remove("hidden");
  const initial=[
    ["sword",-5,23],["sword",6,18],["gun",-15,10],["shield",12,5],["sword",-8,-4],
    ["gun",16,-10],["captain",0,-14],["shield",-15,-18],["sword",17,-25]
  ];
  initial.forEach(v=>spawnEnemy(v[0],v[1],v[2]));
  updateUI();
}
resetGame();

function startGame(){
  audio.start(); resetGame(); state.active=true; state.mode="first";
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
  p.invuln=Math.max(0,p.invuln-dt); p.buff=Math.max(0,p.buff-dt);
  p.attackAnim=Math.max(0,p.attackAnim-dt*5.5); p.hurtAnim=Math.max(0,p.hurtAnim-dt*5);
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
  state.playerModel.rotation.y=state.yaw+Math.PI;
  poseActor(state.playerModel,dt,moving,p.attackAnim,p.hurtAnim);
  updatePlayerSprite(moving,p,ix);
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
  updateFirstPersonSprite(p,moving);
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
  const damage=p.buff>0?31:23; hitCone(damage,4.4,.72);
  audio.tone(170,.07,"square",.035);
}
function skill1(){
  const p=state.player;if(!canCast("s1"))return;
  p.cooldowns.s1=p.buff>0?5.5:8;p.attackAnim=1;p.castKind="combo";startFirstPersonAction("combo");state.shake=.14;
  pulse(p.pos,C.gold,2.4);burst(p.pos,C.orange,8);
  for(let i=0;i<5;i++)scheduleCombat(i*.075,()=>{p.attackAnim=1;hitCone(15,6.3,.58);audio.tone(210+i*30,.045,"square",.025);});
  toast("连环拳风！",800);
}
function skill2(){
  const p=state.player;if(!canCast("s2"))return;
  p.cooldowns.s2=10;p.attackAnim=1;p.castKind="rocketPunch";startFirstPersonAction("rocketPunch");
  const dir=aimDirection(), pos=p.pos.clone().add(new THREE.Vector3(0,-.05,0)).addScaledVector(dir,1.2);
  const m=new THREE.Mesh(new THREE.SphereGeometry(.3,10,8),toon(C.orange,C.orange));
  m.position.copy(pos);m.userData.rocket=true;m.quaternion.setFromUnitVectors(new THREE.Vector3(0,0,1),dir);
  const trail=new THREE.Mesh(new THREE.ConeGeometry(.18,.95,10),new THREE.MeshBasicMaterial({color:0xffb04e,transparent:true,opacity:.7,blending:THREE.AdditiveBlending,depthWrite:false}));
  trail.rotation.x=Math.PI/2;trail.position.z=-.58;m.add(trail);scene.add(m);
  state.projectiles.push({mesh:m,pos:m.position,vel:dir.multiplyScalar(25),life:1.5,owner:"player",damage:62,radius:4,rocket:true});
  pulse(p.pos,C.orange,2.3);burst(pos,C.gold,7);state.shake=.16;
  audio.tone(280,.14,"sawtooth",.045);toast("冲击飞拳！",800);
}
function skill3(){
  const p=state.player;if(!canCast("s3"))return;
  p.cooldowns.s3=22;p.buff=9;p.castTime=.82;p.castKind="burst";startFirstPersonAction("burst");p.hp=clamp(p.hp+35,0,p.maxHp);state.shake=.18;
  pulse(p.pos,C.red,5);burst(p.pos,C.gold,14);toast("热血爆发：速度与攻击强化！",1400);audio.tone(95,.45,"sawtooth",.05);
}
function useHaki(){
  const p=state.player;if(!canCast("haki")||p.haki<50)return;
  p.cooldowns.haki=25;p.haki-=50;state.shake=.38;p.invuln=.8;p.castTime=.86;p.castKind="haki";startFirstPersonAction("haki");
  pulse(p.pos,C.purple,11);burst(p.pos,C.purple,18);
  state.enemies.forEach(e=>{if(!e.dead&&dist2D(e.pos,p.pos)<12){e.stun=e.type==="boss"?1.2:3;damageEnemy(e,e.type==="boss"?55:85,true);}});
  for(let i=state.hazards.length-1;i>=0;i--){const h=state.hazards[i];if(h.type==="line"&&h.time>0){scene.remove(h.mesh);state.hazards.splice(i,1);}}
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
  if(e.type==="shield"&&!heavy)amount*=.68;
  e.hp-=amount;e.model.userData.hurt=1;e.hitFlash=.18;
  state.player.charge=clamp(state.player.charge+amount*.12,0,100);state.player.haki=clamp(state.player.haki+amount*.08,0,100);
  state.score+=Math.round(amount*(1+state.combo*.025));damageNumber(e.pos,Math.round(amount),heavy);
  if(e.hp<=0)killEnemy(e);
}
function killEnemy(e){
  if(e.dead)return;e.dead=true;state.kills++;state.score+=e.type==="boss"?1200:100;
  burst(e.pos,e.type==="boss"?C.gold:C.orange,e.type==="boss"?26:9);
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
  p.hp-=amount;p.invuln=.42;p.hurtAnim=1;p.fpAction=null;p.fpActionTime=0;p.fpActionDuration=0;clearFirstPersonEffects();state.shake=.28;state.combo=0;
  ui.redFlash.classList.remove("hit");void ui.redFlash.offsetWidth;ui.redFlash.classList.add("hit");
  audio.tone(92,.16,"sawtooth",.055);if(p.hp<=0)finish(false);
}

function beginEnemyAttack(e,target,kind){
  e.attackActive=true;e.attackAnimTime=0;e.attackHitDone=false;e.attackKind=kind;
  e.attackTarget=target.clone();
  e.attackTargetAlly=!!(state.ally&&target===state.ally.pos);
  e.attackTargetRef=e.attackTargetAlly?state.ally:state.player;
  if(e.animSprite)setMarineAnimation(e,kind==="gun"?"rifleFire":"saberAttack",true);
}
function tickEnemyAttack(e,dt){
  if(!e.attackActive)return false;
  e.attackAnimTime+=dt;
  const hitAt=e.attackKind==="gun"?MARINE_ANIM_CLIPS.rifleFire.hitAt:MARINE_ANIM_CLIPS.saberAttack.hitAt;
  if(!e.attackHitDone&&e.attackAnimTime>=hitAt){
    const target=e.attackTargetRef?.pos||e.attackTarget;
    if(e.attackKind==="gun"){
      enemyShot(e,target,e.attackTargetAlly);
    }else if(target&&dist2D(e.pos,target)<e.range+.65){
      if(e.attackTargetAlly&&state.ally)hurtAlly(e.damage);else hurtPlayer(e.damage);
    }
    e.attackHitDone=true;
  }
  if(e.attackAnimTime>=1){
    e.attackActive=false;e.attackAnimTime=0;e.attackTargetRef=null;
    if(e.animSprite)setMarineAnimation(e,"idle",true);
  }
  return true;
}

function updateEnemies(dt){
  const p=state.player;
  state.enemies.forEach(e=>{
    if(e.dead)return;
    e.attackCd-=dt;e.stun=Math.max(0,e.stun-dt);e.hitFlash=Math.max(0,(e.hitFlash||0)-dt);
    e.bar.lookAt(camera.position);const ratio=clamp(e.hp/e.maxHp,0,1);
    e.bar.userData.fill.scale.x=ratio;e.bar.userData.fill.position.x=-(1-ratio)*e.bar.userData.width/2;
    if(e.stun>0){
      e.attackActive=false;e.attackAnimTime=0;e.attackTargetRef=null;
      if(e.animSprite)setMarineAnimation(e,"idle",true);
      e.model.rotation.z=Math.sin(state.time*18)*.025;return;
    }else e.model.rotation.z=0;

    if(e.type==="boss"){updateBoss(e,dt);return;}
    if(e.attackActive){tickEnemyAttack(e,dt);return;}
    const target=(state.phase==="defense"&&state.ally&&dist2D(e.pos,state.ally.pos)<dist2D(e.pos,p.pos)+4)?state.ally.pos:p.pos;
    const to=target.clone().sub(e.pos);to.y=0;const d=to.length();if(d>.01)e.model.rotation.y=Math.atan2(to.x,to.z);
    if(e.type==="gun"&&d<18&&d>5){
      if(e.attackCd<=0){e.attackCd=2.0+Math.random()*.5;beginEnemyAttack(e,target,"gun");}
      else if(e.animSprite)setMarineAnimation(e,"idle");
    }else if(e.type==="gun"&&d<=5){
      if(d>.01)e.pos.addScaledVector(to.normalize(),-e.speed*dt);
      if(e.animSprite)setMarineAnimation(e,"walk");
    }else if(d>e.range){
      const crowd=state.enemies.filter(o=>o!==e&&!o.dead&&dist2D(o.pos,e.pos)<1.2).length;
      e.pos.addScaledVector(to.normalize(),e.speed*dt*(crowd?.55:1));
      if(e.animSprite)setMarineAnimation(e,"walk");
    }else if(e.attackCd<=0){
      e.attackCd=e.type==="captain"?1.25:1.55;
      if(e.animSprite)beginEnemyAttack(e,target,"melee");
      else{
        e.model.userData.swing=1;
        if(state.ally&&target===state.ally.pos)hurtAlly(e.damage);else hurtPlayer(e.damage);
      }
    }else if(e.animSprite){
      setMarineAnimation(e,"idle");
    }
  });
  state.enemies=state.enemies.filter(e=>!e.dead);
}
function updateBoss(e,dt){
  const p=state.player,to=p.pos.clone().sub(e.pos);to.y=0;const d=to.length();
  e.model.rotation.y=Math.atan2(to.x,to.z);
  if(e.hp<e.maxHp*.5&&!e.phase2){
    e.phase2=true;e.speed=3.45;e.model.scale.multiplyScalar(1.08);pulse(e.pos,C.red,8);
    for(let i=0;i<5;i++)spawnEnemy(i%2?"sword":"gun",-12+i*6,-41-Math.abs(2-i)*2);
    toast("首领进入狂暴阶段！",1800);
  }
  if(e.hp<e.maxHp*.2&&!e.ultimate){
    e.ultimate=true;e.attackCd=.2;toast("警告：毁灭射线蓄力！使用震慑可打断",2500);
    spawnLineHazard(e.pos,p.pos,1.9,58);return;
  }
  if(d>e.range+1.2)e.pos.addScaledVector(to.normalize(),e.speed*dt);
  if(e.attackCd<=0){
    e.model.userData.swing=1;e.attackCd=e.phase2?1.85:2.6;
    const r=Math.random();
    if(r<.42)spawnCircleHazard(p.pos.clone(),2.8,e.phase2?28:22,1.0);
    else if(r<.78)spawnCircleHazard(e.pos.clone(),5.2,e.phase2?35:27,.72);
    else spawnLineHazard(e.pos,p.pos,1.25,e.phase2?42:32);
  }
}
function enemyShot(e,target,targetAllyOverride=null){
  const pos=e.pos.clone().add(new THREE.Vector3(0,2.8,0));
  const targetAlly=targetAllyOverride===null?!!(state.ally&&target===state.ally.pos):targetAllyOverride;
  const aim=target.clone();aim.y=targetAlly?2.1:1.7;
  const dir=aim.sub(pos).normalize();
  const m=new THREE.Mesh(new THREE.SphereGeometry(.12,7,6),toon(C.gold,C.gold));m.position.copy(pos);scene.add(m);
  state.projectiles.push({mesh:m,pos:m.position,vel:dir.multiplyScalar(13),life:2,owner:"enemy",damage:e.damage,targetAlly});
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

function updateProjectiles(dt){
  for(let i=state.projectiles.length-1;i>=0;i--){
    const p=state.projectiles[i];p.life-=dt;p.pos.addScaledVector(p.vel,dt);
    if(p.mesh.userData.rocket)p.mesh.rotateZ(dt*10);else p.mesh.rotation.x+=dt*8;
    let remove=p.life<=0;
    if(p.owner==="player"){
      for(const e of state.enemies){if(!e.dead&&dist2D(p.pos,e.pos)<1.25){
        if(p.rocket){state.enemies.forEach(o=>{if(!o.dead&&dist2D(o.pos,p.pos)<p.radius)damageEnemy(o,p.damage*(1-dist2D(o.pos,p.pos)/(p.radius*1.8)),true);});burst(p.pos,C.orange,16);state.shake=.28;}
        else damageEnemy(e,p.damage,false);remove=true;break;
      }}
    }else if(p.targetAlly&&state.ally&&p.pos.distanceTo(state.ally.pos.clone().add(new THREE.Vector3(0,1.4,0)))<1.35){hurtAlly(p.damage);remove=true;}
    else if(!p.targetAlly&&p.pos.distanceTo(state.player.pos)<1.35){hurtPlayer(p.damage);remove=true;}
    if(remove){scene.remove(p.mesh);state.projectiles.splice(i,1);}
  }
}
function spawnCircleHazard(pos,radius,damage,delay){
  pos.y=.05;const mat=new THREE.MeshBasicMaterial({color:C.red,transparent:true,opacity:.22,side:THREE.DoubleSide});
  const mesh=new THREE.Mesh(new THREE.RingGeometry(radius*.72,radius,40),mat);mesh.rotation.x=-Math.PI/2;mesh.position.copy(pos);scene.add(mesh);
  state.hazards.push({mesh,type:"circle",pos:pos.clone(),radius,damage,time:delay,total:delay});
}
function spawnLineHazard(from,to,delay,damage){
  const dir=to.clone().sub(from);dir.y=0;dir.normalize();const len=42;
  const mat=new THREE.MeshBasicMaterial({color:C.red,transparent:true,opacity:.2,side:THREE.DoubleSide});
  const mesh=new THREE.Mesh(new THREE.PlaneGeometry(1.4,len),mat);mesh.rotation.x=-Math.PI/2;
  mesh.position.copy(from).addScaledVector(dir,len/2);mesh.position.y=.06;mesh.rotation.z=-Math.atan2(dir.x,-dir.z);scene.add(mesh);
  state.hazards.push({mesh,type:"line",pos:from.clone(),dir,len,width:1.45,damage,time:delay,total:delay});
}
function updateHazards(dt){
  for(let i=state.hazards.length-1;i>=0;i--){
    const h=state.hazards[i];h.time-=dt;h.mesh.material.opacity=.14+.3*(1-h.time/h.total);
    if(h.time<=0){
      if(h.type==="circle"&&dist2D(state.player.pos,h.pos)<h.radius)hurtPlayer(h.damage);
      if(h.type==="line"){
        const rel=state.player.pos.clone().sub(h.pos);rel.y=0;const along=rel.dot(h.dir);
        const perp=rel.clone().addScaledVector(h.dir,-along).length();
        if(along>0&&along<h.len&&perp<h.width)hurtPlayer(h.damage);
      }
      burst(h.type==="circle"?h.pos:state.player.pos,C.red,12);scene.remove(h.mesh);state.hazards.splice(i,1);
    }
  }
}
function pulse(pos,color,radius){
  const ringMat=new THREE.MeshBasicMaterial({color,transparent:true,opacity:.86,side:THREE.DoubleSide,depthWrite:false});
  const m=new THREE.Mesh(new THREE.RingGeometry(.5,.72,32),ringMat);
  m.rotation.x=-Math.PI/2;m.position.copy(pos);m.position.y=.12;scene.add(m);
  state.effects.push({mesh:m,time:.55,total:.55,radius});
  const core=new THREE.Mesh(new THREE.RingGeometry(.16,.32,24),new THREE.MeshBasicMaterial({
    color:0xffffff,transparent:true,opacity:.92,side:THREE.DoubleSide,depthWrite:false
  }));
  core.rotation.x=-Math.PI/2;core.position.copy(pos);core.position.y=.135;scene.add(core);
  state.effects.push({mesh:core,time:.32,total:.32,radius:radius*.68});
}
function burst(pos,color,count){
  for(let i=0;i<count;i++){
    const size=.1+Math.random()*.16;
    const m=new THREE.Mesh(new THREE.TetrahedronGeometry(size,0),toon(i%4===0?0xffffff:color,color));
    m.position.copy(pos).add(new THREE.Vector3(0,1.7+Math.random()*.8,0));m.scale.y=1.8+Math.random()*2.4;scene.add(m);
    const v=new THREE.Vector3(Math.random()-.5,Math.random()*.85+.2,Math.random()-.5).normalize().multiplyScalar(5+Math.random()*5);
    state.effects.push({mesh:m,time:.6+Math.random()*.35,total:1,vel:v});
  }
}
function updateEffects(dt){
  for(let i=state.effects.length-1;i>=0;i--){
    const f=state.effects[i];f.time-=dt;
    if(f.giant){f.mesh.position.y=7*(1-clamp((f.total-f.time)/.75,0,1));}
    else if(f.vel){f.mesh.position.addScaledVector(f.vel,dt);f.vel.y-=9*dt;f.mesh.rotation.x+=dt*8;}
    else{const q=1-f.time/f.total;f.mesh.scale.setScalar(1+q*f.radius);f.mesh.material.opacity=1-q;}
    if(f.time<=0){scene.remove(f.mesh);f.mesh.geometry.dispose();if(!f.vel&&!f.giant)f.mesh.material.dispose();state.effects.splice(i,1);}
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
  if(state.boss){ui.bossFill.style.width=(state.boss.hp/state.boss.maxHp*100)+"%";ui.bossText.textContent=Math.max(0,Math.ceil(state.boss.hp))+" / "+state.boss.maxHp;}
  document.querySelectorAll("[data-cd]").forEach(el=>{
    const key=el.dataset.cd,v=p.cooldowns[key];const span=el.querySelector(".cd");
    if(span)span.textContent=v>0?Math.ceil(v):(key==="ultimate"&&p.charge<100?Math.floor(p.charge)+"%":"");
    el.classList.toggle("cooling",v>0||(key==="ultimate"&&p.charge<100));
  });
  drawRadar();
}
function drawRadar(){
  const c=ui.radar,ctx=c.getContext("2d"),w=c.width,h=c.height;ctx.clearRect(0,0,w,h);
  ctx.fillStyle="rgba(9,30,45,.72)";ctx.beginPath();ctx.arc(w/2,h/2,w/2-2,0,Math.PI*2);ctx.fill();
  ctx.strokeStyle="#82d7e6";ctx.lineWidth=2;ctx.stroke();
  const sc=.72,px=w/2,pz=h/2;
  function dot(x,z,color,r){ctx.fillStyle=color;ctx.beginPath();ctx.arc(px+(x-state.player.pos.x)*sc,pz+(z-state.player.pos.z)*sc,r,0,Math.PI*2);ctx.fill();}
  state.enemies.forEach(e=>{if(!e.dead)dot(e.pos.x,e.pos.z,e.type==="boss"?"#ffc34b":"#ff6255",e.type==="boss"?4:2.5);});
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
    if(e.code==="KeyI")skill2();if(e.code==="KeyO")skill3();if(e.code==="Space"){e.preventDefault();useHaki();}
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
    e.preventDefault();e.stopPropagation();({attack, dodge:beginDodge,s1:skill1,s2:skill2,s3:skill3,s4:skill4,s5:skill5,ultimate,haki:useHaki}[b.dataset.action])();
  }));
  ui.startBtn.addEventListener("click",startGame);ui.restartBtn.addEventListener("click",startGame);
  ui.pauseBtn.addEventListener("click",togglePause);
  ui.viewBtn.addEventListener("click",()=>{state.mode=state.mode==="first"?"top":"first";ui.viewBtn.textContent=state.mode==="first"?"第一视角":"俯视视角";toast(state.mode==="first"?"已切换第一视角":"已切换俯视视角",700);});
}
function togglePause(){if(!state.active)return;state.paused=!state.paused;ui.pauseBtn.textContent=state.paused?"继续":"暂停";toast(state.paused?"战斗暂停":"继续战斗",700);if(state.paused)document.exitPointerLock?.();}

bindControls();
function animate(){
  const dt=Math.min(clock.getDelta(),.035);
  if(state.active&&!state.paused){
    state.time+=dt;updateEnvironment(dt);updatePlayer(dt);updateCombat(dt);updateEnemies(dt);updateAlly(dt);animateActors(dt);updateProjectiles(dt);updateHazards(dt);updateEffects(dt);updateFirstPersonEffects(dt);updatePhase(dt);updateUI();
  }else if(!state.active){
    camera.position.lerp(new THREE.Vector3(15,15,35),.04);camera.lookAt(0,2,-12);
    state.captureMesh.rotation.y+=dt*.3;
  }
  renderer.render(scene,camera);
}
renderer.setAnimationLoop(animate);
if("serviceWorker" in navigator){
  navigator.serviceWorker.getRegistrations().then(registrations=>Promise.all(registrations.map(registration=>registration.unregister()))).catch(()=>{});
}
if("caches" in window)caches.keys().then(keys=>Promise.all(keys.map(key=>caches.delete(key)))).catch(()=>{});
