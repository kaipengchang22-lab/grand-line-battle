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
function toon(color, emissive=0x000000, opacity=1) {
  const key = color+"-"+emissive+"-"+opacity;
  if (!mats.has(key)) mats.set(key, new THREE.MeshToonMaterial({
    color, emissive, emissiveIntensity: emissive ? .55 : 0, transparent:opacity<1,
    opacity, flatShading:true
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
function seeded(n) { return ((Math.sin(n*999.41)*43758.5453)%1+1)%1; }
function dist2D(a,b){ const dx=a.x-b.x, dz=a.z-b.z; return Math.hypot(dx,dz); }
function clamp(v,a,b){ return Math.max(a,Math.min(b,v)); }

const state = {
  active:false, paused:false, mode:"first", phase:"assault", time:0, capture:0, defense:30,
  waveClock:0, kills:0, combo:0, comboTimer:0, score:0, yaw:0, pitch:-.04,
  player:{pos:new THREE.Vector3(0,1.7,40), hp:300,maxHp:300, stamina:100,haki:30,
    speed:9.2, cooldowns:{attack:0,dodge:0,s1:0,s2:0,s3:0,haki:0}, dodge:0, invuln:0,
    buff:0, attackAnim:0, hurtAnim:0},
  enemies:[], projectiles:[], hazards:[], effects:[], ally:null, boss:null,
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

  const sea=add(world,new THREE.PlaneGeometry(180,210),standard(0x287ca0,.65,.05),0,-.42,-12,-Math.PI/2);
  sea.receiveShadow=false;
  const ice=add(world,new THREE.PlaneGeometry(82,126,12,16),standard(C.ice,.82,.02),0,0,-5,-Math.PI/2);
  ice.receiveShadow=true;

  for(let i=0;i<32;i++){
    const x=(seeded(i*3.1)*2-1)*37, z=(seeded(i*7.7+4)*2-1)*58-4;
    const pts=[new THREE.Vector3(x,.022,z),new THREE.Vector3(x+(seeded(i+8)*2-1)*4,.024,z-2.5),
      new THREE.Vector3(x+(seeded(i+19)*2-1)*7,.022,z-6)];
    const line=new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts),
      new THREE.LineBasicMaterial({color:0x5eb0c4,transparent:true,opacity:.55}));
    world.add(line);
  }

  const quayMat=standard(0x73909a,.9,.02);
  add(world,new THREE.BoxGeometry(5,2.5,126),quayMat,-43,-.1,-5);
  add(world,new THREE.BoxGeometry(5,2.5,126),quayMat,43,-.1,-5);

  const wall=toon(0xb5cbd0);
  add(world,new THREE.BoxGeometry(82,9,5),wall,0,4.5,-67);
  add(world,new THREE.BoxGeometry(15,17,10),wall,-27,8,-66);
  add(world,new THREE.BoxGeometry(15,17,10),wall,27,8,-66);
  add(world,new THREE.CylinderGeometry(10,13,6,8),toon(0x8caeb7),0,11,-70);
  const emblem=add(world,new THREE.TorusGeometry(3.2,.55,8,24),toon(C.gold),0,11,-64.75,Math.PI/2);
  emblem.castShadow=false;

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
  g.scale.setScalar(scale);
  return g;
}

function createPlayerModel(){
  const g=new THREE.Group();
  add(g,new THREE.CylinderGeometry(.38,.46,.72,9),toon(0x263745),-.4,.38,0);
  add(g,new THREE.CylinderGeometry(.38,.46,.72,9),toon(0x263745),.4,.38,0);
  add(g,new THREE.CylinderGeometry(.31,.35,1.25,9),toon(0x2f788b),-.36,1.28,0);
  add(g,new THREE.CylinderGeometry(.31,.35,1.25,9),toon(0x2f788b),.36,1.28,0);
  add(g,new THREE.CylinderGeometry(.82,.68,1.65,10),toon(C.orange),0,2.6,0);
  add(g,new THREE.BoxGeometry(1.5,.16,.18),toon(C.gold),0,2.15,.72);
  add(g,new THREE.SphereGeometry(.62,14,10),toon(C.skin),0,3.92,0);
  add(g,new THREE.SphereGeometry(.67,12,7,0,Math.PI*2,0,Math.PI*.52),toon(0x29212a),0,4.16,0);
  for(let i=0;i<7;i++)add(g,new THREE.ConeGeometry(.13,.5,7),toon(0x29212a),-.48+i*.16,4.36,.08,0,0,(i-3)*.13);
  add(g,new THREE.TorusGeometry(.72,.12,8,24),toon(C.gold),0,4.48,0,Math.PI/2);
  add(g,new THREE.CylinderGeometry(.54,.58,.22,16),toon(C.orange),0,4.58,0);
  add(g,new THREE.BoxGeometry(.14,.08,.07),toon(C.ink),-.22,3.99,.57);
  add(g,new THREE.BoxGeometry(.14,.08,.07),toon(C.ink),.22,3.99,.57);
  add(g,new THREE.CylinderGeometry(.22,.28,1.55,9),toon(C.skin),-.88,2.68,0,0,0,-.15);
  add(g,new THREE.CylinderGeometry(.22,.28,1.55,9),toon(C.skin),.88,2.68,0,0,0,.15);
  add(g,new THREE.TorusGeometry(.23,.07,7,12),toon(C.ink),-.98,1.96,0,Math.PI/2);
  add(g,new THREE.TorusGeometry(.23,.07,7,12),toon(C.ink),.98,1.96,0,Math.PI/2);
  const scarf=add(g,new THREE.PlaneGeometry(1.1,.9),toon(C.red),-.72,3.2,-.46,0,.25,.22);scarf.material.side=THREE.DoubleSide;
  return g;
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
  model.position.set(x,0,z); scene.add(model);
  const e={id:state.nextId++,type,model,pos:model.position,hp:s.hp,maxHp:s.hp,speed:s.speed,
    damage:s.damage,range:s.range,attackCd:.5+Math.random(),stun:0,dead:false,bar:addHealthBar(model,2.15,type==="captain"?6.3:5.3)};
  state.enemies.push(e); return e;
}
function spawnBoss(){
  const model=createMarineModel("captain",true); model.position.set(0,0,-48); scene.add(model);
  const e={id:state.nextId++,type:"boss",model,pos:model.position,hp:720,maxHp:720,speed:2.7,damage:30,
    range:3.3,attackCd:2,stun:0,dead:false,phase2:false,ultimate:false,bar:addHealthBar(model,3.2,7.65)};
  state.enemies.push(e); state.boss=e; ui.bossWrap.classList.remove("hidden");
  toast("海军本部大将登场！",2200); audio.tone(72,.55,"sawtooth",.07);
}
function spawnAlly(){
  const model=createAllyModel(); model.position.set(0,0,-24); scene.add(model);
  state.ally={model,pos:model.position,hp:260,maxHp:260,attackCd:0};
  addHealthBar(model,3,6.4);
}

function clearActors(){
  state.enemies.forEach(e=>scene.remove(e.model)); state.enemies=[];
  state.projectiles.forEach(p=>scene.remove(p.mesh)); state.projectiles=[];
  state.hazards.forEach(h=>scene.remove(h.mesh)); state.hazards=[];
  state.effects.forEach(f=>scene.remove(f.mesh)); state.effects=[];
  if(state.ally){scene.remove(state.ally.model);state.ally=null;}
  state.boss=null;
}

const arms=new THREE.Group();
camera.add(arms);
function buildArms(){
  arms.position.set(0,-.72,-.92);
  const left=new THREE.Group(), right=new THREE.Group();
  left.position.set(-.48,-.05,0); right.position.set(.48,-.05,0); arms.add(left,right);
  [left,right].forEach((a,i)=>{
    add(a,new THREE.CylinderGeometry(.13,.19,.9,9),toon(C.skin),0,0,0,Math.PI/2,0,i?-.12:.12);
    add(a,new THREE.SphereGeometry(.24,10,8),toon(C.skin),0,-.02,-.48);
    add(a,new THREE.TorusGeometry(.2,.07,7,12),toon(C.ink),0,-.02,-.35,Math.PI/2);
  });
  arms.userData.left=left; arms.userData.right=right;
}
buildArms();
buildWorld();
state.playerModel=createPlayerModel();
scene.add(state.playerModel);

function resetGame(){
  clearActors();
  Object.assign(state,{active:false,paused:false,phase:"assault",time:0,capture:0,defense:30,
    waveClock:0,kills:0,combo:0,maxCombo:0,comboTimer:0,score:0,yaw:0,pitch:-.04,shake:0,gateOpen:0});
  Object.assign(state.player,{hp:300,maxHp:300,stamina:100,haki:30,speed:9.2,dodge:0,invuln:0,buff:0,attackAnim:0,hurtAnim:0});
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
  return new THREE.Vector3(Math.sin(state.yaw),0,-Math.cos(state.yaw)).normalize();
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
  Object.keys(p.cooldowns).forEach(k=>p.cooldowns[k]=Math.max(0,p.cooldowns[k]-dt));
  p.invuln=Math.max(0,p.invuln-dt); p.buff=Math.max(0,p.buff-dt);
  p.attackAnim=Math.max(0,p.attackAnim-dt*5.5); p.hurtAnim=Math.max(0,p.hurtAnim-dt*5);
  state.comboTimer-=dt; if(state.comboTimer<=0)state.combo=0;
  p.stamina=clamp(p.stamina+dt*(p.buff>0?23:15),0,100);

  // Mobile FPS steering: vertical stick moves, horizontal stick turns.
  // This avoids the disorienting "left stick also strafes the camera" feeling on phones.
  const keyboardX=(state.keys.KeyD?1:0)-(state.keys.KeyA?1:0);
  let ix=keyboardX+(state.mode==="first"?0:state.joy.x);
  let iz=(state.keys.KeyW?1:0)-(state.keys.KeyS?1:0)-state.joy.y;
  if(state.mode==="first"&&Math.abs(state.joy.x)>.035){
    const turn=Math.sign(state.joy.x)*Math.pow(Math.abs(state.joy.x),1.25);
    state.yaw-=turn*dt*2.35;
  }
  const l=Math.hypot(ix,iz); if(l>1){ix/=l;iz/=l;}
  const f=playerDirection(), r=new THREE.Vector3(Math.cos(state.yaw),0,Math.sin(state.yaw));
  const move=new THREE.Vector3().addScaledVector(f,iz).addScaledVector(r,ix);
  const moving=move.lengthSq()>.01;
  let speed=p.speed*(p.buff>0?1.3:1);
  if(p.dodge>0){p.dodge-=dt;speed=25;move.copy(p.dodgeDir);}
  if(moving||p.dodge>0) p.pos.addScaledVector(move.normalize(),speed*dt);
  p.pos.x=clamp(p.pos.x,-39,39); p.pos.z=clamp(p.pos.z,-62,55);
  if(state.phase!=="exit"&&p.pos.z<-59)p.pos.z=-59;

  state.playerModel.position.set(p.pos.x,0,p.pos.z);
  state.playerModel.rotation.y=state.yaw+Math.PI;
  state.playerModel.visible=state.mode!=="first";
  if(state.mode==="first"){
    camera.position.copy(p.pos);
    camera.position.y=1.74;
    camera.rotation.set(state.pitch,state.yaw,0);
    arms.visible=true;
  }else{
    const forward=playerDirection();
    const right=new THREE.Vector3(Math.cos(state.yaw),0,Math.sin(state.yaw));
    const cameraAnchor=p.pos.clone().add(new THREE.Vector3(0,7.2,0)).addScaledVector(forward,-8.6).addScaledVector(right,1.0);
    const lookAhead=p.pos.clone().add(new THREE.Vector3(0,2.15,0)).addScaledVector(forward,13);
    camera.position.copy(cameraAnchor);
    camera.lookAt(lookAhead); arms.visible=false;
  }
  if(state.shake>0){
    state.shake=Math.max(0,state.shake-dt*2.6);
    camera.position.x+=(Math.random()-.5)*state.shake;
    camera.position.y+=(Math.random()-.5)*state.shake*.65;
  }
  const bob=moving?Math.sin(state.time*11)*.018:0;
  arms.position.y=-.72+bob;
  const punch=(1-p.attackAnim)*Math.PI;
  const thrust=p.attackAnim>0?Math.sin(punch)*-.72:0;
  arms.userData.right.position.z=thrust;
  arms.userData.right.rotation.x=p.attackAnim>0?-Math.sin(punch)*.22:0;
  arms.userData.left.position.z=p.buff>0?Math.sin(state.time*8)*-.08:0;
}

function beginDodge(){
  const p=state.player;if(!state.active||p.cooldowns.dodge>0||p.stamina<28)return;
  p.stamina-=28;p.cooldowns.dodge=1.1;p.dodge=.24;p.invuln=.34;
  let ix=(state.keys.KeyD?1:0)-(state.keys.KeyA?1:0)+(state.mode==="first"?0:state.joy.x);
  let iz=(state.keys.KeyW?1:0)-(state.keys.KeyS?1:0)-state.joy.y;
  const f=playerDirection(),r=new THREE.Vector3(Math.cos(state.yaw),0,Math.sin(state.yaw));
  p.dodgeDir=new THREE.Vector3().addScaledVector(f,iz||1).addScaledVector(r,ix).normalize();
  audio.tone(130,.1,"sine",.04);
}
function attack(){
  const p=state.player;if(!state.active||state.paused||p.cooldowns.attack>0)return;
  p.cooldowns.attack=p.buff>0?.18:.34;p.attackAnim=1;
  const damage=p.buff>0?31:23; hitCone(damage,4.4,.72);
  audio.tone(170,.07,"square",.035);
}
function skill1(){
  const p=state.player;if(!state.active||p.cooldowns.s1>0)return;
  p.cooldowns.s1=p.buff>0?5.5:8;p.attackAnim=1; state.shake=.14;
  for(let i=0;i<5;i++)setTimeout(()=>{if(state.active){hitCone(15,6.3,.58);audio.tone(210+i*30,.045,"square",.025);}},i*75);
  toast("连环拳风！",800);
}
function skill2(){
  const p=state.player;if(!state.active||p.cooldowns.s2>0)return;
  p.cooldowns.s2=10;p.attackAnim=1;
  const dir=aimDirection(), pos=p.pos.clone().add(new THREE.Vector3(0,-.05,0)).addScaledVector(dir,1.2);
  const m=new THREE.Mesh(new THREE.SphereGeometry(.3,10,8),toon(C.orange,C.orange));
  m.position.copy(pos);scene.add(m);
  state.projectiles.push({mesh:m,pos:m.position,vel:dir.multiplyScalar(25),life:1.5,owner:"player",damage:62,radius:4,rocket:true});
  audio.tone(280,.14,"sawtooth",.045);toast("冲击飞拳！",800);
}
function skill3(){
  const p=state.player;if(!state.active||p.cooldowns.s3>0)return;
  p.cooldowns.s3=22;p.buff=9;p.hp=clamp(p.hp+35,0,p.maxHp);state.shake=.18;
  pulse(p.pos,C.red,5);toast("热血爆发：速度与攻击强化！",1400);audio.tone(95,.45,"sawtooth",.05);
}
function useHaki(){
  const p=state.player;if(!state.active||p.cooldowns.haki>0||p.haki<50)return;
  p.cooldowns.haki=25;p.haki-=50;state.shake=.38;p.invuln=.8;
  pulse(p.pos,C.purple,11);
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
  e.hp-=amount;e.model.userData.flash=.12;state.player.haki=clamp(state.player.haki+amount*.08,0,100);
  state.score+=Math.round(amount*(1+state.combo*.025));damageNumber(e.pos,Math.round(amount),heavy);
  if(e.hp<=0)killEnemy(e);
}
function killEnemy(e){
  if(e.dead)return;e.dead=true;state.kills++;state.score+=e.type==="boss"?1200:100;
  burst(e.pos,e.type==="boss"?C.gold:C.orange,e.type==="boss"?26:9);
  scene.remove(e.model);
  if(e.type==="boss"){
    state.boss=null;ui.bossWrap.classList.add("hidden");
    state.phase="defense";state.defense=30;state.waveClock=1;spawnAlly();
    toast("首领击败！保护盟友 30 秒！",2300);
  }
}
function hurtPlayer(amount){
  const p=state.player;if(p.invuln>0||!state.active)return;
  p.hp-=amount;p.invuln=.42;p.hurtAnim=1;state.shake=.28;state.combo=0;
  ui.redFlash.classList.remove("hit");void ui.redFlash.offsetWidth;ui.redFlash.classList.add("hit");
  audio.tone(92,.16,"sawtooth",.055);if(p.hp<=0)finish(false);
}

function updateEnemies(dt){
  const p=state.player;
  state.enemies.forEach(e=>{
    if(e.dead)return;
    if(e.model.userData.flash>0){
      e.model.userData.flash-=dt;e.model.traverse(o=>{if(o.isMesh&&o.material.emissive)o.material.emissive.setHex(0xffffff);});
    }else e.model.traverse(o=>{if(o.isMesh&&o.material.emissive)o.material.emissive.setHex(o.material.userData.baseEmissive||0x000000);});
    e.attackCd-=dt;e.stun=Math.max(0,e.stun-dt);
    e.bar.lookAt(camera.position);const ratio=clamp(e.hp/e.maxHp,0,1);
    e.bar.userData.fill.scale.x=ratio;e.bar.userData.fill.position.x=-(1-ratio)*e.bar.userData.width/2;
    if(e.stun>0){e.model.rotation.z=Math.sin(state.time*18)*.025;return;}else e.model.rotation.z=0;

    if(e.type==="boss"){updateBoss(e,dt);return;}
    const target=(state.phase==="defense"&&state.ally&&dist2D(e.pos,state.ally.pos)<dist2D(e.pos,p.pos)+4)?state.ally.pos:p.pos;
    const to=target.clone().sub(e.pos);to.y=0;const d=to.length();if(d>.01)e.model.rotation.y=Math.atan2(to.x,to.z);
    if(e.type==="gun"&&d<18&&d>5){
      if(e.attackCd<=0){e.attackCd=2.0+Math.random()*.5;enemyShot(e,target);}
    }else if(d>e.range){
      const crowd=state.enemies.filter(o=>o!==e&&!o.dead&&dist2D(o.pos,e.pos)<1.2).length;
      e.pos.addScaledVector(to.normalize(),e.speed*dt*(crowd?.55:1));
    }else if(e.attackCd<=0){
      e.attackCd=e.type==="captain"?1.25:1.55;
      if(state.ally&&target===state.ally.pos)hurtAlly(e.damage);else hurtPlayer(e.damage);
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
    e.attackCd=e.phase2?1.85:2.6;
    const r=Math.random();
    if(r<.42)spawnCircleHazard(p.pos.clone(),2.8,e.phase2?28:22,1.0);
    else if(r<.78)spawnCircleHazard(e.pos.clone(),5.2,e.phase2?35:27,.72);
    else spawnLineHazard(e.pos,p.pos,1.25,e.phase2?42:32);
  }
}
function enemyShot(e,target){
  const pos=e.pos.clone().add(new THREE.Vector3(0,2.8,0));
  const targetAlly=!!(state.ally&&target===state.ally.pos);
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
    if(a.attackCd<=0){a.attackCd=1.1;damageEnemy(nearest,28,false);pulse(nearest.pos,0x54dce6,1.5);}}
}

function updateProjectiles(dt){
  for(let i=state.projectiles.length-1;i>=0;i--){
    const p=state.projectiles[i];p.life-=dt;p.pos.addScaledVector(p.vel,dt);p.mesh.rotation.x+=dt*8;
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
  const m=new THREE.Mesh(new THREE.RingGeometry(.5,.72,32),new THREE.MeshBasicMaterial({color,transparent:true,opacity:.8,side:THREE.DoubleSide}));
  m.rotation.x=-Math.PI/2;m.position.copy(pos);m.position.y=.12;scene.add(m);
  state.effects.push({mesh:m,time:.55,total:.55,radius});
}
function burst(pos,color,count){
  for(let i=0;i<count;i++){
    const m=new THREE.Mesh(new THREE.BoxGeometry(.12,.12,.12),toon(color,color));m.position.copy(pos).add(new THREE.Vector3(0,2,0));scene.add(m);
    const v=new THREE.Vector3(Math.random()-.5,Math.random()*.85+.2,Math.random()-.5).normalize().multiplyScalar(5+Math.random()*5);
    state.effects.push({mesh:m,time:.6+Math.random()*.35,total:1,vel:v});
  }
}
function updateEffects(dt){
  for(let i=state.effects.length-1;i>=0;i--){
    const f=state.effects[i];f.time-=dt;
    if(f.vel){f.mesh.position.addScaledVector(f.vel,dt);f.vel.y-=9*dt;f.mesh.rotation.x+=dt*8;}
    else{const q=1-f.time/f.total;f.mesh.scale.setScalar(1+q*f.radius);f.mesh.material.opacity=1-q;}
    if(f.time<=0){scene.remove(f.mesh);state.effects.splice(i,1);}
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
    if(span)span.textContent=v>0?Math.ceil(v):"";el.classList.toggle("cooling",v>0);
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
    ui.joystick.addEventListener("touchstart",e=>{
      if(joyId!==null)return;const t=e.changedTouches[0];joyId=t.identifier;
      joyRect=ui.joystick.getBoundingClientRect();updateJoyPoint(t.clientX,t.clientY);e.preventDefault();
    },{passive:false});
    ui.joystick.addEventListener("touchmove",e=>{
      const t=Array.from(e.touches).find(v=>v.identifier===joyId);if(t){updateJoyPoint(t.clientX,t.clientY);e.preventDefault();}
    },{passive:false});
    const endJoyTouch=e=>{if(Array.from(e.changedTouches).some(v=>v.identifier===joyId)){resetJoy();e.preventDefault();}};
    ui.joystick.addEventListener("touchend",endJoyTouch,{passive:false});
    ui.joystick.addEventListener("touchcancel",endJoyTouch,{passive:false});

    ui.lookZone.addEventListener("touchstart",e=>{
      if(lookId!==null)return;const t=e.changedTouches[0];lookId=t.identifier;lx=t.clientX;ly=t.clientY;e.preventDefault();
    },{passive:false});
    ui.lookZone.addEventListener("touchmove",e=>{
      const t=Array.from(e.touches).find(v=>v.identifier===lookId);if(t){updateLookPoint(t.clientX,t.clientY);e.preventDefault();}
    },{passive:false});
    const endLookTouch=e=>{if(Array.from(e.changedTouches).some(v=>v.identifier===lookId)){resetLook();e.preventDefault();}};
    ui.lookZone.addEventListener("touchend",endLookTouch,{passive:false});
    ui.lookZone.addEventListener("touchcancel",endLookTouch,{passive:false});
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
    e.preventDefault();e.stopPropagation();({attack, dodge:beginDodge,s1:skill1,s2:skill2,s3:skill3,haki:useHaki}[b.dataset.action])();
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
    state.time+=dt;updatePlayer(dt);updateEnemies(dt);updateAlly(dt);updateProjectiles(dt);updateHazards(dt);updateEffects(dt);updatePhase(dt);updateUI();
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
