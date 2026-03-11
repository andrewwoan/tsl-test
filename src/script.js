import GUI from "lil-gui";
import * as THREE from "three/webgpu";
import {
  vec3,
  vec4,
  uniform,
  color,
  pass,
  renderOutput,
  mix,
  normalWorld,
  dot,
  max,
  floor,
  mrt,
  normalView,
  output,
  add,
  div,
  smoothstep,
  clamp,
  sub,
  mul,
} from "three/tsl";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { sobel } from "three/addons/tsl/display/SobelOperatorNode.js";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { DRACOLoader } from "three/examples/jsm/loaders/DRACOLoader.js";

const gui = new GUI({ width: 400 });
const canvas = document.querySelector("canvas.webgpu");
const scene = new THREE.Scene();

const sizes = { width: window.innerWidth, height: window.innerHeight };

window.addEventListener("resize", () => {
  sizes.width = window.innerWidth;
  sizes.height = window.innerHeight;
  camera.aspect = sizes.width / sizes.height;
  camera.updateProjectionMatrix();
  renderer.setSize(sizes.width, sizes.height);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
});

const camera = new THREE.PerspectiveCamera(
  25,
  sizes.width / sizes.height,
  0.1,
  100,
);
camera.position.set(6, 3, 10);
scene.add(camera);

const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true;

const renderer = new THREE.WebGPURenderer({ canvas, antialias: true });
renderer.setSize(sizes.width, sizes.height);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setClearColor("#ffffff");

// --- Lights ---
const light = new THREE.DirectionalLight("#ffffff", 1);
light.position.set(5, 5, 5);
scene.add(light);

const lightAmbient = new THREE.AmbientLight("#ffffff", 0.2);
scene.add(lightAmbient);

// --- Toon uniforms ---
const toonSteps = uniform(4);
const toonSmoothness = uniform(0.02);
const toonAmbient = uniform(0.15);
const toonHighlight = uniform(1.0);
const toonShadowMix = uniform(0.4);
const outlineColor = uniform(vec3(0, 0, 0));

// Light direction as a uniform so it can be updated live
const lightDir = uniform(
  vec3(light.position.x, light.position.y, light.position.z).normalize(),
);

const makeToonMaterial = (baseColor) => {
  const mat = new THREE.MeshBasicNodeMaterial();
  mat.side = THREE.DoubleSide;

  // Use the uniform lightDir instead of hardcoded value
  const diffuse = max(dot(normalWorld, lightDir), 0);

  const scaled = diffuse.mul(toonSteps);
  const hard = floor(scaled.add(0.5)).div(toonSteps);
  const soft = floor(scaled)
    .add(
      smoothstep(
        toonSmoothness.negate(),
        toonSmoothness,
        scaled.fract().sub(0.5),
      ),
    )
    .div(toonSteps);

  const stepped = mix(hard, soft, clamp(toonSmoothness.mul(50), 0, 1));

  const lightIntensity = clamp(
    stepped.mul(toonHighlight).add(toonAmbient),
    toonAmbient,
    1.0,
  );

  const base = color(baseColor);
  const finalColor = mix(base.mul(toonShadowMix), base, lightIntensity);

  mat.colorNode = vec4(finalColor, 1.0);
  return mat;
};

// --- Post processing ---
const renderPipeline = new THREE.RenderPipeline(renderer);
renderPipeline.outputColorTransform = false;

const scenePass = pass(scene, camera);
scenePass.setMRT(mrt({ output, normal: normalView }));

const outputPass = renderOutput(scenePass);

const normalPass = scenePass.getTextureNode("normal");
const remappedNormal = div(add(normalPass, vec3(1, 1, 1)), 2);
const sobelNormal = sobel(remappedNormal);

const normalThreshold = uniform(0.05);
const normalStrength = uniform(1.0);
const normalEdges = sobelNormal.step(normalThreshold).mul(normalStrength);

renderPipeline.outputNode = mix(
  outputPass,
  vec4(outlineColor, 1.0),
  normalEdges,
);

// --- Load GLB ---
const dracoLoader = new DRACOLoader();
dracoLoader.setDecoderPath("/draco/");
const gltfLoader = new GLTFLoader();
gltfLoader.setDRACOLoader(dracoLoader);

gltfLoader.load("/models/cafe.glb", (gltf) => {
  gltf.scene.traverse((child) => {
    if (child.isMesh) {
      let baseColor = "#c8b89a";
      if (child.material?.color)
        baseColor = `#${child.material.color.getHexString()}`;
      child.material = makeToonMaterial(baseColor);
    }
  });
  scene.add(gltf.scene);
});

// Helper to sync light position → lightDir uniform
const syncLightDir = () => {
  const n = light.position.clone().normalize();
  lightDir.value.set(n.x, n.y, n.z);
};

// --- GUI ---
const toonFolder = gui.addFolder("Toon Shading");
toonFolder.add(toonSteps, "value", 1, 10, 1).name("Steps");
toonFolder.add(toonSmoothness, "value", 0, 0.5, 0.001).name("Band Smoothness");
toonFolder.add(toonAmbient, "value", 0, 1, 0.01).name("Ambient (shadow floor)");
toonFolder.add(toonHighlight, "value", 0, 2, 0.01).name("Highlight Strength");
toonFolder.add(toonShadowMix, "value", 0, 1, 0.01).name("Shadow Darkness");

const lightFolder = gui.addFolder("Directional Light");
lightFolder
  .add(light.position, "x", -20, 20, 0.1)
  .name("Position X")
  .onChange(syncLightDir);
lightFolder
  .add(light.position, "y", -20, 20, 0.1)
  .name("Position Y")
  .onChange(syncLightDir);
lightFolder
  .add(light.position, "z", -20, 20, 0.1)
  .name("Position Z")
  .onChange(syncLightDir);
lightFolder.add(light, "intensity", 0, 5, 0.01).name("Intensity");
lightFolder
  .addColor({ color: "#ffffff" }, "color")
  .name("Color")
  .onChange((val) => light.color.set(val));

const ambientFolder = gui.addFolder("Ambient Light");
ambientFolder.add(lightAmbient, "intensity", 0, 5, 0.01).name("Intensity");
ambientFolder
  .addColor({ color: "#ffffff" }, "color")
  .name("Color")
  .onChange((val) => lightAmbient.color.set(val));

const outlineFolder = gui.addFolder("Outlines");

outlineFolder
  .add(normalThreshold, "value", 0, 1, 0.001)
  .name("Normal Threshold");
outlineFolder.add(normalStrength, "value", 0, 2, 0.01).name("Normal Strength");
outlineFolder
  .addColor({ color: "#000000" }, "color")
  .name("Outline Color")
  .onChange((val) => {
    const c = new THREE.Color(val);
    outlineColor.value.set(c.r, c.g, c.b);
  });
const tick = () => {
  controls.update();
  renderPipeline.render();
};
renderer.setAnimationLoop(tick);
