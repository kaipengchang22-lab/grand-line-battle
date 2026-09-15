import fs from 'node:fs';

// Free, hand-authored mobile GLB.  It uses a node hierarchy so Three.js can
// play clips without a paid generation/rigging service.
const out='assets/models/straw-hat-hero-original.glb';
const B=[],views=[],accessors=[],meshes=[],nodes=[],materials=[],animations=[];
let size=0;
const pad=()=>{const n=(4-size%4)%4;if(n){B.push(Buffer.alloc(n));size+=n;}};
function data(a,target=34962){pad();const b=Buffer.from(a.buffer,a.byteOffset,a.byteLength);const i=views.length;views.push({buffer:0,byteOffset:size,byteLength:b.length,target});B.push(b);size+=b.length;return i;}
function acc(a,type,ct=5126,target=34962,min,max){const count=a.length/({SCALAR:1,VEC2:2,VEC3:3,VEC4:4}[type]);const o={bufferView:data(a,target),componentType:ct,count,type};if(min)o.min=min;if(max)o.max=max;accessors.push(o);return accessors.length-1;}
function bounds(p){let lo=[Infinity,Infinity,Infinity],hi=[-Infinity,-Infinity,-Infinity];for(let i=0;i<p.length;i+=3)for(let j=0;j<3;j++){lo[j]=Math.min(lo[j],p[i+j]);hi[j]=Math.max(hi[j],p[i+j]);}return [lo,hi];}
function geometry(name,p,n,ix){const [lo,hi]=bounds(p);return {name,pa:acc(new Float32Array(p),'VEC3',5126,34962,lo,hi),na:acc(new Float32Array(n),'VEC3'),ia:acc(new Uint16Array(ix),'SCALAR',5123,34963)};}
function sphere(name,sx=20,sy=14){const p=[],n=[],ix=[];for(let y=0;y<=sy;y++){const v=y/sy,ph=v*Math.PI;for(let x=0;x<=sx;x++){const u=x/sx,th=u*Math.PI*2,px=Math.sin(ph)*Math.cos(th),py=Math.cos(ph),pz=Math.sin(ph)*Math.sin(th);p.push(px,py,pz);n.push(px,py,pz);}}for(let y=0;y<sy;y++)for(let x=0;x<sx;x++){const a=y*(sx+1)+x,b=a+sx+1;ix.push(a,b,a+1,a+1,b,b+1);}return geometry(name,p,n,ix);}
function cylinder(name,seg=20){const p=[],n=[],ix=[];for(let y=0;y<2;y++)for(let x=0;x<=seg;x++){const t=x/seg*Math.PI*2,c=Math.cos(t),s=Math.sin(t);p.push(c,y-.5,s);n.push(c,0,s);}for(let x=0;x<seg;x++){const a=x,b=x+1,c=seg+1+x,d=c+1;ix.push(a,c,b,b,c,d);}const top=p.length/3;p.push(0,.5,0);n.push(0,1,0);const bot=p.length/3;p.push(0,-.5,0);n.push(0,-1,0);for(let x=0;x<seg;x++){ix.push(top,x+1,x,bot,seg+1+x,seg+1+x+1);}return geometry(name,p,n,ix);}
function cube(name){const p=[-1,-1,-1,1,-1,-1,1,1,-1,-1,1,-1,-1,-1,1,1,-1,1,1,1,1,-1,1,1],n=[0,0,-1,0,0,-1,0,0,-1,0,0,-1,0,0,1,0,0,1,0,0,1,0,0,1],ix=[0,1,2,0,2,3,4,6,5,4,7,6,0,4,5,0,5,1,1,5,6,1,6,2,2,6,7,2,7,3,3,7,4,3,4,0];return geometry(name,p,n,ix);}
function mat(name,hex,rough=.65,metal=0){const h=hex.replace('#',''),c=[0,2,4].map(i=>parseInt(h.slice(i,i+2),16)/255);materials.push({name,pbrMetallicRoughness:{baseColorFactor:[...c,1],metallicFactor:metal,roughnessFactor:rough}});return materials.length-1;}
const G={sphere:sphere('Sphere'),cyl:cylinder('Cylinder'),cube:cube('Cube')};
const M={skin:mat('Warm skin','#d89472',.78),skin2:mat('Skin light','#f0b092',.78),red:mat('Crimson vest','#a72f2a',.6),blue:mat('Indigo shorts','#183f81',.72),denim:mat('Denim cuff','#526b91',.78),light:mat('Cuff fabric','#d4d0c3',.88),yellow:mat('Sash gold','#d79e29',.72),straw:mat('Woven straw','#c7963e',.8),hair:mat('Black hair','#181319',.85),white:mat('Eye white','#f7f3ed',.35),black:mat('Pupil and mouth','#181722',.35),brown:mat('Sandal leather','#42251d',.75),scar:mat('Scar','#9f5245',.9)};
function mesh(name,g,m){meshes.push({name,primitives:[{attributes:{POSITION:g.pa,NORMAL:g.na},indices:g.ia,material:m}]});return meshes.length-1;}
const Q={};for(const [k,g] of Object.entries(G))for(const [c,m] of Object.entries(M))Q[k+'_'+c]=mesh(k+'_'+c,g,m);
const eulerQ=(x=0,y=0,z=0)=>{const c1=Math.cos(x/2),s1=Math.sin(x/2),c2=Math.cos(y/2),s2=Math.sin(y/2),c3=Math.cos(z/2),s3=Math.sin(z/2);return [s1*c2*c3+c1*s2*s3,c1*s2*c3-s1*c2*s3,c1*c2*s3+s1*s2*c3,c1*c2*c3-s1*s2*s3];};
function node(name,parent=-1,meshId,translation,scale,rotation){const x={name};if(meshId!==undefined)x.mesh=meshId;if(translation)x.translation=translation;if(scale)x.scale=scale;if(rotation)x.rotation=rotation.length===3?eulerQ(...rotation):rotation;nodes.push(x);const i=nodes.length-1;if(parent>=0)(nodes[parent].children??=[]).push(i);return i;}
const root=node('Hero_Root',-1,undefined,[0,0,0]);
const hips=node('Hips',root,undefined,[0,1.08,0]);
node('Shorts',hips,Q.cyl_blue,[0,0,0],[.47,.48,.30]);node('Sash',hips,Q.cyl_yellow,[0,.27,0],[.50,.11,.33]);
const torso=node('Torso',hips,Q.sphere_skin,[0,.62,0],[.48,.68,.30]);
node('Vest_L',torso,Q.cube_red,[-.31,.02,-.28],[.14,.52,.05]);node('Vest_R',torso,Q.cube_red,[.31,.02,-.28],[.14,.52,.05]);
const neck=node('Neck',torso,Q.sphere_skin,[0,.48,0],[.19,.20,.18]);
const head=node('Head',torso,Q.sphere_skin2,[0,.94,0],[.40,.50,.36]);
node('Ear_L',head,Q.sphere_skin2,[-.39,0,0],[.085,.14,.085]);node('Ear_R',head,Q.sphere_skin2,[.39,0,0],[.085,.14,.085]);
node('Eye_L',head,Q.sphere_white,[-.135,.05,-.335],[.095,.12,.030]);node('Eye_R',head,Q.sphere_white,[.135,.05,-.335],[.095,.12,.030]);
node('Pupil_L',head,Q.sphere_black,[-.135,.04,-.368],[.038,.055,.018]);node('Pupil_R',head,Q.sphere_black,[.135,.04,-.368],[.038,.055,.018]);
node('Nose',head,Q.sphere_skin2,[0,-.045,-.37],[.045,.055,.035]);node('Mouth',head,Q.cube_black,[0,-.17,-.365],[.105,.014,.014]);
node('Scar',head,Q.cube_scar,[.245,-.11,-.37],[.015,.105,.015],[0,0,.45]);
node('Hat_Brim',head,Q.sphere_straw,[0,.50,0],[.92,.075,.92]);node('Hat_Crown',head,Q.sphere_straw,[0,.67,0],[.43,.25,.43]);node('Hat_Band',head,Q.cyl_red,[0,.63,0],[.445,.055,.445]);
for(let i=0;i<9;i++){const a=(i-4)*.125;node('Hair_Front_'+i,head,Q.sphere_hair,[a,.29,-.31],[.105,.23,.095],[0,0,a*.85]);}
for(let i=0;i<4;i++){const sx=i<2?-1:1,yy=.13+(i%2)*.14;node('Hair_Side_'+i,head,Q.sphere_hair,[sx*(.32+(i%2)*.04),yy,-.02],[.09,.18,.12],[0,sx*.32,sx*.18]);}
for(const x of [-.17,.17])for(const y of [.68,.50])node('Vest_Button',torso,Q.sphere_yellow,[x,y,-.325],[.035,.035,.025]);
node('Chest_L',torso,Q.sphere_skin2,[-.15,.48,-.26],[.16,.16,.045]);node('Chest_R',torso,Q.sphere_skin2,[.15,.48,-.26],[.16,.16,.045]);
function limb(side){const sx=side==='L'?-1:1;const arm=node('UpperArm_'+side,torso,undefined,[sx*.53,.55,0]);node('UpperArmMesh_'+side,arm,Q.cyl_skin,[0,-.34,0],[.14,.72,.14]);const fore=node('ForeArm_'+side,arm,undefined,[0,-.69,0]);node('ForeArmMesh_'+side,fore,Q.cyl_skin2,[0,-.29,0],[.12,.60,.12]);node('Hand_'+side,fore,Q.sphere_skin2,[0,-.62,0],[.15,.16,.13]);const leg=node('UpperLeg_'+side,hips,undefined,[sx*.25,-.30,0]);node('UpperLegMesh_'+side,leg,Q.cyl_skin,[0,-.31,0],[.18,.64,.18]);node('Cuff_'+side,leg,Q.cyl_light,[0,-.55,0],[.20,.12,.20]);const shin=node('LowerLeg_'+side,leg,undefined,[0,-.63,0]);node('LowerLegMesh_'+side,shin,Q.cyl_skin2,[0,-.28,0],[.145,.58,.145]);node('Sandal_'+side,shin,Q.sphere_brown,[0,-.61,-.06],[.20,.10,.31]);return {arm,fore,leg,shin};}
const L=limb('L'),R=limb('R');
const quat=eulerQ;
function track(nodeId,t,e){const out=[];for(const a of e)out.push(...quat(...a));return {node:nodeId,t,e,out};}
function clip(name,d,tracks){const samplers=[],channels=[];for(const tr of tracks){const ti=acc(new Float32Array(tr.t),'SCALAR',5126,34962,[Math.min(...tr.t)],[Math.max(...tr.t)]);const oi=acc(new Float32Array(tr.out),'VEC4');samplers.push({input:ti,output:oi,interpolation:'LINEAR'});channels.push({sampler:samplers.length-1,target:{node:tr.node,path:'rotation'}});}animations.push({name,samplers,channels,extras:{duration:d}});}
clip('Idle',1.5,[track(torso,[0,.38,.76,1.14,1.5],[[0,0,-.015],[.025,0,.015],[0,0,-.015],[-.025,0,.015],[0,0,-.015]]),track(head,[0,.75,1.5],[[0,-.035,0],[0,.035,0],[0,-.035,0]])]);
clip('Walk',.82,[track(L.arm,[0,.205,.41,.615,.82],[[-.72,0,0],[0,0,0],[.72,0,0],[0,0,0],[-.72,0,0]]),track(R.arm,[0,.205,.41,.615,.82],[[.72,0,0],[0,0,0],[-.72,0,0],[0,0,0],[.72,0,0]]),track(L.leg,[0,.205,.41,.615,.82],[[.66,0,0],[0,0,0],[-.66,0,0],[0,0,0],[.66,0,0]]),track(R.leg,[0,.205,.41,.615,.82],[[-.66,0,0],[0,0,0],[.66,0,0],[0,0,0],[-.66,0,0]])]);
clip('Attack',.58,[track(R.arm,[0,.12,.26,.42,.58],[[0,0,0],[-.65,0,0],[-2.05,0,0],[.58,0,0],[0,0,0]]),track(R.fore,[0,.12,.26,.42,.58],[[0,0,0],[-.25,0,0],[-.85,0,0],[.25,0,0],[0,0,0]]),track(torso,[0,.26,.58],[[0,0,0],[.16,0,0],[0,0,0]])]);
clip('Hurt',.42,[track(torso,[0,.12,.42],[[0,0,0],[.34,0,0],[0,0,0]]),track(L.arm,[0,.12,.42],[[0,0,0],[.5,0,.25],[0,0,0]]),track(R.arm,[0,.12,.42],[[0,0,0],[.5,0,-.25],[0,0,0]])]);
const gltf={asset:{version:'2.0',generator:'Grand Line Battle free procedural hero'},scene:0,scenes:[{nodes:[root]}],nodes,meshes,materials,animations,bufferViews:views,accessors,buffers:[{byteLength:size}]};
const json=Buffer.from(JSON.stringify(gltf));const jp=(4-json.length%4)%4,bin=Buffer.concat([...B]);const bp=(4-bin.length%4)%4;const total=12+8+json.length+jp+8+bin.length+bp;const h=Buffer.alloc(12);h.writeUInt32LE(0x46546c67,0);h.writeUInt32LE(2,4);h.writeUInt32LE(total,8);const jc=Buffer.alloc(8);jc.writeUInt32LE(json.length+jp,0);jc.writeUInt32LE(0x4e4f534a,4);const bc=Buffer.alloc(8);bc.writeUInt32LE(bin.length+bp,0);bc.writeUInt32LE(0x004e4942,4);fs.mkdirSync('assets/models',{recursive:true});fs.writeFileSync(out,Buffer.concat([h,jc,json,Buffer.alloc(jp,0x20),bc,bin,Buffer.alloc(bp)]));console.log(`${out}: ${total} bytes, ${meshes.length} meshes, ${nodes.length} nodes, ${animations.length} animations`);
