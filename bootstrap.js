import * as THREE from "https://cdn.jsdelivr.net/npm/three@0.166.1/build/three.module.js";
import { GLTFLoader } from "https://cdn.jsdelivr.net/npm/three@0.166.1/examples/jsm/loaders/GLTFLoader.js";
import { FBXLoader } from "https://cdn.jsdelivr.net/npm/three@0.166.1/examples/jsm/loaders/FBXLoader.js";
import { clone as cloneSkeleton } from "https://cdn.jsdelivr.net/npm/three@0.166.1/examples/jsm/utils/SkeletonUtils.js";

const [treeModule,presetModule]=await Promise.all([
  import("./assets/trees/ez-tree/tree.js"),
  import("./assets/trees/ez-tree/presets.js")
]);
window.__GRAND_LINE_GAME_DEPS__={
  THREE,GLTFLoader,FBXLoader,cloneSkeleton,
  Tree:treeModule.Tree,EZ_TREE_PRESETS:presetModule.EZ_TREE_PRESETS
};

async function loadClassicScript(src){
  await new Promise((resolve,reject)=>{
    const script=document.createElement("script");
    script.src=src;script.onload=resolve;
    script.onerror=()=>reject(new Error("游戏模块加载失败："+src));
    document.body.append(script);
  });
}

await loadClassicScript("./game.js?v=64");
await loadClassicScript("./game-core-2.js?v=64");
